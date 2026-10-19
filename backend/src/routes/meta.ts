import { Router } from 'express';
import type { Env } from '../config/env';
import { accessSnapshot } from '../lib/access';
import { bugFeatures } from '../lib/bugFeatures';
import { BugzillaClient } from '../lib/bugzillaClient';
import { groupNameForProduct } from '../lib/productGroups';
import { isServiceAccount, parseTransferRoutes } from '../lib/productTransfer';
import { requireAuth } from '../middleware/auth';
import { extractBugMeta } from '../schemas/meta';

export function metaRouter(env: Env): Router {
  const router = Router();
  const transferRoutes = parseTransferRoutes(env.PRODUCT_TRANSFER_ROUTES);

  router.get('/', requireAuth(env), async (req, res, next) => {
    try {
      const [raw, features] = await Promise.all([req.bugzilla!.get('/field/bug'), bugFeatures(env)]);
      const fieldMeta = extractBugMeta(raw);
      // The REST base is .../rest; Bugzilla's web (non-REST) admin pages live one level up.
      const bugzillaWebUrl = env.BUGZILLA_URL.replace(/\/rest\/?$/, '');
      res.json({
        ...fieldMeta,
        features,
        currentUser: req.sessionUser!.email,
        bugzillaWebUrl,
        // Configuration only (which product may hand bugs to which), so the bug page
        // can decide whether to offer "Transfer" without a Bugzilla round trip.
        transferRoutes: Object.fromEntries([...transferRoutes].map(([from, to]) => [from, [...to]])),
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/meta/assignable-users?product=A&product=B
   *
   * The people a bug can be handed to - used by the Assignee dropdown on the bug
   * detail page and by the bulk reassign bar.
   *
   * Membership is read from the GROUPS themselves, not by searching the user
   * directory for an email pattern. The previous version matched logins
   * containing "kpost" (BUGZILLA_USER_MATCH), which silently excluded anyone on
   * another domain - the instance administrator, on a gmail.com login, never
   * appeared in any assignee list and nothing said why. Which email address a
   * person signs in with is an organisational choice and must not decide
   * whether they can be given work.
   *
   * Read on the SERVICE key: Bugzilla refuses "Group.get" to anyone without
   * "editusers" or "creategroups", so a developer asking on their own token
   * would get nothing back. This reveals strictly less than the unscoped list
   * already did, and only names and email addresses reach the response.
   */
  router.get('/assignable-users', requireAuth(env), async (req, res, next) => {
    try {
      const rawProduct = req.query.product;
      const products = (Array.isArray(rawProduct) ? rawProduct : [rawProduct])
        .filter((p) => typeof p === 'string')
        .map((p) => String(p).trim())
        .filter(Boolean);

      const directory = new BugzillaClient(env.BUGZILLA_URL, {
        kind: 'api_key',
        apiKey: env.BUGZILLA_API_KEY,
      });

      const allGroups = await directory.get<{ groups: Array<{ name: string }> }>('/group', {
        membership: 0,
      });
      const available = new Set((allGroups.groups ?? []).map((g) => g.name));

      /*
       * Only products that actually have a same-named group can narrow the list.
       * "KMail API" has none, so its bugs are readable by anyone and it must not
       * intersect the pool down to nobody.
       *
       * With no gating product the pool is "editbugs", which Bugzilla
       * auto-grants to every account (its user_regexp is ".*") - making it the
       * domain-agnostic "everyone who can work a bug" list, and the reason this
       * no longer depends on what a login's email happens to end in.
       */
      // Case-insensitive, and reduced to the group's own spelling: Bugzilla
      // matches these names case-insensitively, so a group created as
      // `Kpost Admin UI` does gate the product `KPost Admin UI`. Comparing
      // exactly treated it as ungated and widened the pool to everyone.
      const gating = products
        .map((p) => groupNameForProduct(p, available))
        .filter((g): g is string => g !== undefined);
      const poolNames = gating.length > 0 ? gating : ['editbugs'];

      /*
       * The candidate pool and the role groups, fetched together.
       *
       * `canconfirm`, `editusers` and `editcomponents` are what separate a
       * tester from an engineer (see lib/roles.ts), and Group.get takes several
       * names in one call - so this costs one upstream request, not three.
       * Under mod_cgi each one forks a Perl interpreter, which is why batching
       * matters here.
       */
      const [resp, roleResp] = await Promise.all([
        directory.get<{
          groups: Array<{
            name: string;
            membership?: Array<{ email?: string; real_name?: string; name?: string; can_login?: boolean }>;
          }>;
        }>('/group', { names: poolNames, membership: 1 }),
        directory.get<{
          groups: Array<{ name: string; membership?: Array<{ email?: string }> }>;
        }>('/group', { names: ['canconfirm', 'editusers', 'editcomponents'], membership: 1 }),
      ]);

      const membersOf = (group: string) =>
        new Set(
          (roleResp.groups ?? [])
            .find((g) => g.name.toLowerCase() === group)
            ?.membership?.map((m) => (m.email ?? '').toLowerCase())
            .filter(Boolean) ?? []
        );

      /*
       * A STRICT tester: holds `canconfirm` but neither admin group.
       *
       * Defects are assigned to whoever will change the code, so testers are
       * left out of this list - but an admin also holds `canconfirm`, and
       * subtracting the admin groups is what stops the rule from quietly
       * removing them too.
       */
      const canConfirm = membersOf('canconfirm');
      const admins = new Set([...membersOf('editusers'), ...membersOf('editcomponents')]);
      const strictTesters = new Set([...canConfirm].filter((email) => !admins.has(email)));

      /*
       * Component owners are always assignable, whatever role they hold.
       *
       * Bugzilla routes every new bug to the component's `initialowner`, so a
       * person who owns a module is already receiving its defects. Hiding them
       * from the picker would mean the UI refused to name the person the
       * server assigns to by default.
       *
       * Read from the cached access snapshot, so this is normally free.
       */
      const owners = new Set<string>();
      try {
        const snapshot = await accessSnapshot(req.bugzilla!, req.sessionUser!.bzUserId);
        const wanted = new Set(products.map((p) => p.toLowerCase()));
        for (const product of snapshot.products) {
          if (wanted.size > 0 && !wanted.has(product.name.toLowerCase())) continue;
          const components =
            (product as { components?: Array<{ default_assigned_to?: string }> }).components ?? [];
          for (const c of components) {
            if (c.default_assigned_to) owners.add(c.default_assigned_to.toLowerCase());
          }
        }
      } catch {
        // Owners unavailable: fall back to the role rule alone rather than
        // failing the picker.
      }

      // Intersect: for a batch spanning products, only people who can reach
      // EVERY one of them may take the whole selection.
      let pool: Map<string, { email: string; name: string }> | null = null;
      for (const group of resp.groups ?? []) {
        const members = new Map<string, { email: string; name: string }>();
        for (const m of group.membership ?? []) {
          if (!m.email || m.can_login === false || isServiceAccount(m.email)) continue;
          members.set(m.email.toLowerCase(), { email: m.email, name: m.real_name || m.name || m.email });
        }
        if (pool === null) pool = members;
        else for (const key of [...pool.keys()]) if (!members.has(key)) pool.delete(key);
      }

      /*
       * The signed-in user is never offered. "Reassign" means handing work to
       * someone else, and on a list that is usually already yours your own name
       * is the one option that changes nothing.
       */
      const me = req.sessionUser!.email.toLowerCase();
      const users = [...(pool?.values() ?? [])]
        .filter((u) => {
          const email = u.email.toLowerCase();
          if (email === me) return false;
          // Engineering only - unless they own a component, in which case
          // Bugzilla already assigns defects to them.
          return !strictTesters.has(email) || owners.has(email);
        })
        /*
         * Owners of the selected product first, then everyone else, each run
         * alphabetical. The caller renders these as two labelled groups.
         *
         * Group membership can no longer narrow this list - every account is in
         * every product group, so "who may see this product" is now true of
         * everyone. COMPONENT OWNERSHIP is what still distinguishes people:
         * Bugzilla routes each component's bugs to its `initialowner`, so those
         * are demonstrably the engineers who work that product. Everyone else
         * stays selectable, because a defect does sometimes need to go to
         * someone outside the usual owner.
         */
        .sort((a, b) => {
          const ao = owners.has(a.email.toLowerCase()) ? 0 : 1;
          const bo = owners.has(b.email.toLowerCase()) ? 0 : 1;
          return ao !== bo ? ao - bo : a.name.localeCompare(b.name);
        });

      res.json({
        /*
         * Each person carries their ROLE, so the picker can mark an admin as
         * one rather than listing them beside developers with nothing to tell
         * them apart. Derived from the same group membership the rest of the
         * app uses (lib/roles.ts), so the label cannot drift from the
         * permissions the server actually enforces.
         */
        users: users.map((u) => ({
          ...u,
          role: admins.has(u.email.toLowerCase()) ? ('admin' as const) : ('developer' as const),
        })),
        /*
         * The owner emails for the products asked about, so the picker can
         * label them rather than re-deriving ownership in the browser.
         */
        owners: users.filter((u) => owners.has(u.email.toLowerCase())).map((u) => u.email),
      });
    } catch (err) {
      next(err);
    }
  });


  return router;
}
