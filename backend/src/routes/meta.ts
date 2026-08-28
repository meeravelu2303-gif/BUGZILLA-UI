import { Router } from 'express';
import type { Env } from '../config/env';
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
   * GET /api/meta/assignable-users
   *
   * The people a bug can be reassigned to — used to populate the Assignee dropdown on the bug
   * detail page. Read-only and available to any authenticated user (not admin-gated), because
   * reassigning is a normal developer action, not an administrative one.
   *
   * Bugzilla's `User.get` has no "list everyone" call, so we match on "@" (present in every
   * email login) exactly as the admin user list does. Disabled accounts are excluded — you
   * cannot assign a bug to someone who can no longer log in. Only the fields the dropdown needs
   * are returned.
   */
  router.get('/assignable-users', requireAuth(env), async (req, res, next) => {
    try {
      /*
       * Bugzilla's `User.get` needs a match term and — verified against this instance —
       * silently returns nothing for `@` (it strips punctuation-only terms), so an email-domain
       * token is used instead. `BUGZILLA_USER_MATCH` overrides it; the default matches this
       * org's logins (all `@kpost*`). Results are de-duplicated in case several terms overlap.
       */
      const terms = (process.env.BUGZILLA_USER_MATCH || 'kpost')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      /*
       * `product` scopes the list to people who actually work on that product.
       *
       * Without it the dropdown offered every account on the instance, so reassigning a KPost UI
       * bug listed the API team and vice versa — and picking one hands the bug to somebody who
       * cannot see it. This instance grants product access through a same-named group
       * (`KPost API`, `KPost UI`, …), so membership in that group is the test.
       *
       * `groups_membership` is requested alongside the match: Bugzilla fills it in only for
       * callers privileged enough to read it and returns the users without it otherwise, which
       * is handled by the fallback below rather than assumed away.
       */
      const product = typeof req.query.product === 'string' ? req.query.product.trim() : '';

      const byEmail = new Map<string, { email: string; name: string; groups: string[] }>();
      for (const term of terms) {
        const resp = await req.bugzilla!.get<{
          users: Array<{
            email?: string;
            name?: string;
            real_name?: string;
            can_login?: boolean;
            groups?: Array<{ name: string }>;
          }>;
        }>('/user', { match: term, limit: 500, groups_membership: 1 });
        for (const u of resp.users) {
          if (u.can_login === false || !u.email) continue;
          byEmail.set(u.email, {
            email: u.email,
            name: u.real_name || u.name || u.email,
            groups: (u.groups ?? []).map((g) => g.name),
          });
        }
      }

      const all = [...byEmail.values()].sort((a, b) => a.name.localeCompare(b.name));
      const scoped = product ? all.filter((u) => u.groups.includes(product)) : all;

      /*
       * Fall back to the full list when scoping yields nobody — either this caller cannot read
       * group membership, or the product does not follow the naming convention. An over-broad
       * dropdown is a nuisance; an empty one makes reassignment impossible.
       */
      const chosen = scoped.length > 0 ? scoped : all;

      res.json({ users: chosen.map(({ email, name }) => ({ email, name })) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
