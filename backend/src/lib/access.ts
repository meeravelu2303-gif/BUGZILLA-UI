import type { BugzillaClient } from './bugzillaClient';

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
 * The product names the user may see, or `null` meaning "do not scope" — the caller is an
 * instance admin, or their group membership could not be read (fall back to unscoped, exactly
 * as `GET /products` does: an over-broad list is recoverable, an empty one blocks the page).
 */
export async function accessibleProductNames(
  client: BugzillaClient,
  bzUserId: number
): Promise<string[] | null> {
  const enterable = await client.get<{ ids: number[] }>('/product_enterable');
  if (!enterable.ids?.length) return [];
  const full = await client.get<{ products: Array<{ name: string }> }>('/product', {
    ids: enterable.ids,
  });
  const names = (full.products ?? []).map((p) => p.name);

  let groups: string[] | null = null;
  try {
    const me = await client.get<{ users: Array<{ groups?: Array<{ name: string }> }> }>('/user', {
      ids: bzUserId,
      groups_membership: 1,
    });
    groups = (me.users[0]?.groups ?? []).map((g) => g.name);
  } catch {
    // Membership unavailable: fall through to unscoped rather than hiding everything.
    groups = null;
  }
  if (!groups || groups.some((g) => ADMIN_GROUPS.has(g))) return null;

  const member = new Set(groups);
  const scoped = names.filter((n) => member.has(n));
  return scoped.length > 0 ? scoped : names;
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
