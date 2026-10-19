import { Router } from 'express';
import type { Env } from '../config/env';
import { accessSnapshot } from '../lib/access';
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

export function productsRouter(env: Env): Router {
  const router = Router();

  /*
   * Served from the shared per-user access snapshot (lib/access.ts), which also
   * decides the rule described above - so the dropdown and query scoping can
   * never disagree about which products a user has.
   *
   * This route used to repeat the very three upstream calls that scoping makes
   * (`/product_enterable`, `/product`, `/user`), so opening a list page paid
   * for the same lookup twice. Bugzilla runs under `mod_cgi` here, where every
   * call costs ~630ms of Perl startup whatever it asks for, so the duplicate
   * was close to two seconds of wall time for an answer already in hand.
   */
  router.get('/', requireAuth(env), async (req, res, next) => {
    try {
      const { products, names } = await accessSnapshot(req.bugzilla!, req.sessionUser!.bzUserId);
      const normalized = products.map((p) => normalizeProduct(rawProductSchema.parse(p)));

      /*
       * `?scope=filing` returns everything Bugzilla says this user may FILE
       * into, skipping the same-named-group convention applied below.
       *
       * The two answers differ on purpose. The convention is a sensible way to
       * scope a FILTER - a KPost UI engineer does not want three dropdown
       * options returning nothing. But it is stricter than Bugzilla itself: a
       * product whose group is not MANDATORY is enterable by anyone, so
       * filtering it out of the filing form refuses a bug the server would
       * happily accept. Someone finding a defect in another team's product
       * should be able to report it.
       *
       * Still Bugzilla's own list, NOT every product in the system: it comes
       * from `product_enterable`, so a product that genuinely refuses this user
       * never appears and the form cannot offer a choice that fails on submit.
       */
      if (req.query.scope === 'filing') {
        res.json({ products: normalized });
        return;
      }

      // `names === null` means an instance admin, or membership that could not
      // be read: show everything enterable rather than nothing.
      const visible = names === null ? normalized : normalized.filter((p) => names.includes(p.name));
      res.json({ products: visible });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
