/**
 * Resolving a product to the Bugzilla group that gates it.
 *
 * This instance follows a one-group-per-product convention: the product
 * `KPost UI` is gated by a group also called `KPost UI`. Three separate places
 * relied on that - query scoping, the assignable-user list, and granting
 * product access when an admin sets someone's role - and all three compared the
 * two names with an exact, case-sensitive match.
 *
 * That is stricter than Bugzilla itself. Product and group names are stored in
 * a case-insensitive collation, so an admin creating the group through the web
 * UI can type `Kpost Admin UI` for the product `KPost Admin UI` and Bugzilla
 * treats them as the same name - while our `Set.has()` sees two different
 * strings and silently decides the product has no group at all. The product
 * then vanishes from the dropdown, its bugs stop being scoped, and nothing
 * anywhere reports a problem.
 *
 * Matching is therefore case-insensitive, but the group's REAL spelling is what
 * comes back: Bugzilla rejects a group name that differs in case when granting
 * membership, so the caller must send the name as the instance stores it.
 */

/** Index of group names by their lower-cased form, for case-insensitive lookup. */
export function groupIndex(available: Iterable<string>): Map<string, string> {
  const index = new Map<string, string>();
  // First spelling wins, so a duplicate differing only in case cannot make the
  // result depend on iteration order.
  for (const name of available) {
    const key = name.toLowerCase();
    if (!index.has(key)) index.set(key, name);
  }
  return index;
}

/**
 * The gating group for `product`, spelled as the instance spells it, or
 * `undefined` when no such group exists (e.g. `KMail API`, which is ungated).
 */
export function groupNameForProduct(product: string, available: Iterable<string>): string | undefined {
  return groupIndex(available).get(product.trim().toLowerCase());
}

/** True when `groups` contains the group gating `product`, ignoring case. */
export function holdsProductGroup(product: string, groups: Iterable<string>): boolean {
  return groupNameForProduct(product, groups) !== undefined;
}
