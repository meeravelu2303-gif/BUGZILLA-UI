import { Router } from 'express';
import type { Env } from '../config/env';
import { BugzillaClient } from '../lib/bugzillaClient';
import { requireAuth } from '../middleware/auth';
import { extractBugMeta } from '../schemas/meta';

export function metaRouter(env: Env): Router {
  const router = Router();

  router.get('/', requireAuth(env), async (req, res, next) => {
    try {
      const raw = await req.bugzilla!.get('/field/bug');
      const fieldMeta = extractBugMeta(raw);
      // The REST base is .../rest; Bugzilla's web (non-REST) admin pages live one level up.
      const bugzillaWebUrl = env.BUGZILLA_URL.replace(/\/rest\/?$/, '');
      res.json({
        ...fieldMeta,
        currentUser: req.sessionUser!.email,
        bugzillaWebUrl,
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
      const gating = products.filter((p) => available.has(p));
      const poolNames = gating.length > 0 ? gating : ['editbugs'];

      const resp = await directory.get<{
        groups: Array<{
          name: string;
          membership?: Array<{ email?: string; real_name?: string; name?: string; can_login?: boolean }>;
        }>;
      }>('/group', { names: poolNames, membership: 1 });

      // Intersect: for a batch spanning products, only people who can reach
      // EVERY one of them may take the whole selection.
      let pool: Map<string, { email: string; name: string }> | null = null;
      for (const group of resp.groups ?? []) {
        const members = new Map<string, { email: string; name: string }>();
        for (const m of group.membership ?? []) {
          if (!m.email || m.can_login === false) continue;
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
        .filter((u) => u.email.toLowerCase() !== me)
        .sort((a, b) => a.name.localeCompare(b.name));

      res.json({ users });
    } catch (err) {
      next(err);
    }
  });


  return router;
}
