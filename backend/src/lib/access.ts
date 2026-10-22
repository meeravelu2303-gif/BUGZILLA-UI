import type { BugzillaClient } from './bugzillaClient';
import { holdsProductGroup } from './productGroups';

/**
 * Product-access scoping, shared by the bug list / count / stats endpoints so that the
 * dashboard totals and the "All Bugs" table obey the SAME product-access model as the product
 * filter dropdown (`GET /products`). Without this, an instance-wide `/bug` search returns every
 * product's bugs, so one developer's dashboard counts another product's defects — e.g. a
 * KPost-only user seeing KMail's open count folded into their total.
 *
 * The rule mirrors `routes/products.ts`: a user sees a product only if they belong to a Bugzilla
 * group whose name equals the product name (the one-group-per-product convention), unless they
 * administer the whole instance.
 */

/** Groups whose holders administer the whole instance rather than one product. */
const ADMIN_GROUPS = new Set(['admin', 'editusers']);

/**
 * How long a user's product access is trusted before it is re-read.
 *
 * Measured against this instance: Bugzilla runs under Apache `mod_cgi` with no
 * mod_perl, so EVERY REST call forks a Perl interpreter and loads Bugzilla's
 * modules - a bare `/version` costs ~630ms against ~56ms for a static file from
 * the same server. Latency is therefore a function of how many upstream calls
 * we make, not how much data we ask for.
 *
 * This helper made three of them, SEQUENTIALLY, on every list, count, stats and
 * export request - roughly 1.9s of pure overhead before a single bug was
 * fetched, repeated for each of the half-dozen requests a screen fires. The
 * answer is the same every time: group membership changes when an admin edits a
 * user, not between two requests one second apart.
 *
 * Five minutes rather than the 60s used for bug data, because this is
 * configuration rather than content - and because the paths that CHANGE it
 * (creating a product, editing a user's groups) call `clearAccessScope()`, so
 * the TTL is a backstop, not the mechanism.
 */
const ACCESS_TTL_MS = 5 * 60_000;

/**
 * Everything the access rules need, read once: the products this user may
 * enter, and whether they administer the instance.
 *
 * Shared by `GET /products` and by query scoping so the two cannot disagree -
 * and so a screen that asks for both pays for one lookup, not two.
 */
export interface AccessSnapshot {
  /** Raw Bugzilla product objects the user may enter, before any filtering. */
  products: Array<Record<string, unknown> & { name: string }>;
  /** Product names after group filtering, or `null` for "do not scope". */
  names: string[] | null;
  isAdmin: boolean;
}

interface ScopeEntry {
  builtAt: number;
  /** The in-flight promise, so a burst of parallel requests shares ONE lookup. */
  promise: Promise<AccessSnapshot>;
}

const scopeCache = new Map<number, ScopeEntry>();

/*
 * Product details are the same for every user, but each user's first request
 * used to re-read them all on their own session - a second full CGI round trip
 * per person, after the first. Shared here, so only products nobody has read
 * yet are fetched, and a user's access lookup is one round of calls.
 */
type ProductRecord = Record<string, unknown> & { name: string; id?: number };
const productCache = { at: 0, byId: new Map<number, ProductRecord>() };

async function productsByIds(client: BugzillaClient, ids: number[]): Promise<ProductRecord[]> {
  if (Date.now() - productCache.at > ACCESS_TTL_MS) {
    productCache.byId.clear();
    productCache.at = Date.now();
  }
  const missing = ids.filter((id) => !productCache.byId.has(id));
  if (missing.length > 0) {
    const resp = await client.get<{ products: ProductRecord[] }>('/product', { ids: missing });
    for (const p of resp.products ?? []) if (typeof p.id === 'number') productCache.byId.set(p.id, p);
  }
  return ids.map((id) => productCache.byId.get(id)).filter((p): p is ProductRecord => p !== undefined);
}

/**
 * Drop cached access, for everyone or one user.
 *
 * Called wherever group membership or the product set changes, so an admin's
 * edit takes effect on the next request instead of up to five minutes later.
 */
export function clearAccessScope(bzUserId?: number): void {
  if (bzUserId === undefined) {
    scopeCache.clear();
    productCache.byId.clear();
  }
  else scopeCache.delete(bzUserId);
}

/**
 * The product names the user may see, or `null` meaning "do not scope" — the caller is an
 * instance admin, or their group membership could not be read (fall back to unscoped, exactly
 * as `GET /products` does: an over-broad list is recoverable, an empty one blocks the page).
 */
export function accessSnapshot(client: BugzillaClient, bzUserId: number): Promise<AccessSnapshot> {
  const hit = scopeCache.get(bzUserId);
  if (hit && Date.now() - hit.builtAt < ACCESS_TTL_MS) return hit.promise;

  const entry: ScopeEntry = { builtAt: Date.now(), promise: readAccess(client, bzUserId) };
  scopeCache.set(bzUserId, entry);
  // A failed read is evicted so the next request retries instead of caching an
  // error for five minutes.
  entry.promise.catch(() => scopeCache.delete(bzUserId));
  return entry.promise;
}

async function readAccess(client: BugzillaClient, bzUserId: number): Promise<AccessSnapshot> {
  /*
   * The membership lookup does not depend on the product lookup, so the two run
   * CONCURRENTLY. Awaited one after the other - which is how this read - they
   * cost two CGI startups end to end instead of one.
   */
  const [enterable, groups] = await Promise.all([
    client.get<{ ids: number[] }>('/product_enterable'),
    client
      .get<{ users: Array<{ groups?: Array<{ name: string }> }> }>('/user', {
        ids: bzUserId,
        groups_membership: 1,
      })
      .then((me) => (me.users[0]?.groups ?? []).map((g) => g.name))
      // Membership unavailable: fall through to unscoped rather than hiding everything.
      .catch((): string[] | null => null),
  ]);

  const isAdmin = !groups || groups.some((g) => ADMIN_GROUPS.has(g));
  if (!enterable.ids?.length) return { products: [], names: [], isAdmin };

  const products = await productsByIds(client, enterable.ids);

  if (isAdmin) return { products, names: null, isAdmin };

  const names = products.map((p) => p.name);
  /*
   * Case-insensitive: Bugzilla stores product and group names in a
   * case-insensitive collation, so `Kpost Admin UI` IS the group for the
   * product `KPost Admin UI` as far as Bugzilla is concerned. An exact match
   * here - which is what this did - decided that product had no group, quietly
   * dropped it from the user's scope, and reported nothing.
   */
  const scoped = names.filter((n) => holdsProductGroup(n, groups));
  /*
   * Nothing matched means the one-group-per-product convention does not hold
   * for this user; showing everything they can enter beats showing nothing.
   */
  return { products, names: scoped.length > 0 ? scoped : names, isAdmin };
}

/** The product names the user may see, or `null` meaning "do not scope". */
export async function accessibleProductNames(
  client: BugzillaClient,
  bzUserId: number
): Promise<string[] | null> {
  return (await accessSnapshot(client, bzUserId)).names;
}

/**
 * Constrains a Bugzilla `/bug` query object to the caller's accessible products — but only when
 * the query does not already name an explicit product (an explicit product filter, from the
 * dropdown, always wins) and the user is actually scoped (admins stay unscoped). This is what
 * keeps one login's dashboard/all-bugs totals from counting another product's bugs.
 */
export async function scopeToAccessibleProducts(
  params: Record<string, unknown>,
  client: BugzillaClient,
  bzUserId: number
): Promise<void> {
  if (params.product !== undefined) return; // explicit product filter wins
  const names = await accessibleProductNames(client, bzUserId);
  if (names) params.product = names;
}
