import { Router } from 'express';
import type { Env } from '../config/env';
import { requireAuth } from '../middleware/auth';
import { normalizeProduct, rawProductSchema } from '../schemas/product';

/**
 * Products the signed-in user may work in.
 *
 * ## Why `product_enterable` alone is not enough
 *
 * On this instance every product carries a same-named group (`KPost API`, `KPost UI`, …) with
 * `membercontrol = DEFAULT`. Default means "put new bugs in this group" — **not** "hide the
 * product from non-members"; only `MANDATORY` does that. So Bugzilla considers every product
 * enterable by everyone, and a QA engineer with access to KPost UI alone was offered a dropdown
 * listing all four, three of which return nothing they can act on.
 *
 * Raising those groups to `MANDATORY` in Bugzilla is the better fix and worth doing, but it
 * changes who can read existing bugs across the whole instance. Scoping the list here is safe,
 * reversible, and fixes the surface people actually use.
 *
 * ## The rule
 *
 * A product is offered when the user belongs to a group of the same name — the convention this
 * instance already follows — or when they hold `admin`/`editusers`, who administer every product
 * and would otherwise be shown an empty dropdown.
 *
 * Falling back to the unscoped list when membership cannot be read is deliberate: this endpoint
 * feeds a *filter*, not an authorisation decision. Bugzilla still enforces what each user can
 * read, so the worst case is an option that returns nothing — never data they should not see.
 */

/** Groups whose holders administer the whole instance rather than one product. */
const ADMIN_GROUPS = new Set(['admin', 'editusers']);

export function productsRouter(env: Env): Router {
  const router = Router();

  router.get('/', requireAuth(env), async (req, res, next) => {
    try {
      const client = req.bugzilla!;
      const enterable = await client.get<{ ids: number[] }>('/product_enterable');
      if (enterable.ids.length === 0) {
        res.json({ products: [] });
        return;
      }
      const full = await client.get<{ products: unknown[] }>('/product', { ids: enterable.ids });
      const products = full.products.map((p) => normalizeProduct(rawProductSchema.parse(p)));

      let groups: string[] | null = null;
      try {
        const me = await client.get<{ users: Array<{ groups?: Array<{ name: string }> }> }>('/user', {
          ids: req.sessionUser!.bzUserId,
          groups_membership: 1,
        });
        groups = (me.users[0]?.groups ?? []).map((g) => g.name);
      } catch {
        // Membership unavailable: fall through to the unscoped list rather than showing nothing.
        groups = null;
      }

      if (!groups || groups.some((g) => ADMIN_GROUPS.has(g))) {
        res.json({ products });
        return;
      }

      const member = new Set(groups);
      const scoped = products.filter((p) => member.has(p.name));

      /*
       * If nothing matched, the naming convention does not hold for this user and filtering
       * would leave them unable to select anything at all. An over-broad list is recoverable;
       * an empty one blocks the page.
       */
      res.json({ products: scoped.length > 0 ? scoped : products });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
