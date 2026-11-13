/** Resolving a product to the Bugzilla group that gates it. */
export function groupIndex(available: Iterable<string>): Map<string, string> {
  const index = new Map<string, string>();
  for (const name of available) {
    const key = name.toLowerCase();
    if (!index.has(key)) index.set(key, name);
  }
  return index;
}

/** The gating group for product, spelled as the instance spells it, or undefined when no such group exists (e.g. */
export function groupNameForProduct(product: string, available: Iterable<string>): string | undefined {
  return groupIndex(available).get(product.trim().toLowerCase());
}

/** True when groups contains the group gating product, ignoring case. */
export function holdsProductGroup(product: string, groups: Iterable<string>): boolean {
  return groupNameForProduct(product, groups) !== undefined;
}
