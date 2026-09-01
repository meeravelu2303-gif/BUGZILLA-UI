/**
 * Roles, as a shorthand for the Bugzilla groups behind them.
 *
 * Bugzilla has no notion of a "tester" or a "developer" - it has groups, and a
 * role is just a named bundle of them. Naming that bundle in one place keeps
 * account setup consistent: the difference between two developers should never
 * be which checkboxes whoever created them happened to remember.
 *
 * Two independent axes, deliberately kept apart:
 *
 *   ROLE     what you may DO      editbugs / canconfirm / editusers / editcomponents
 *   PRODUCTS what you may SEE     one same-named group per product
 *
 * They are orthogonal - a developer on two products and a tester on one are
 * both ordinary combinations - so collapsing them into a single "role" list
 * would immediately need a role per product.
 */

export const ROLES = ['developer', 'tester', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/**
 * `editbugs` is in every role because filing and editing bugs is the baseline
 * for anyone with an account here; an account without it can read but not
 * participate.
 *
 * `canconfirm` separates tester from developer. It grants "confirm a bug or
 * mark it a duplicate" - triaging what comes in is the tester's call, not the
 * assignee's. It also decides how a filed bug lands: without `editbugs` OR
 * `canconfirm` a new bug is UNCONFIRMED, which would split the queue in two.
 *
 * `editusers` / `editcomponents` are what this app reads for `canManageUsers`
 * and `canManageProducts` (see derivePermissions), so they are exactly what
 * turns the admin screens on. The raw `admin` group is deliberately NOT granted
 * - it carries far more than this app exposes, and handing it out from a
 * create-user form would be a much bigger grant than the label suggests.
 */
export const ROLE_GROUPS: Record<Role, string[]> = {
  developer: ['editbugs'],
  tester: ['editbugs', 'canconfirm'],
  admin: ['editbugs', 'canconfirm', 'editusers', 'editcomponents'],
};

export const ROLE_LABELS: Record<Role, string> = {
  developer: 'Developer',
  tester: 'Tester',
  admin: 'Administrator',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  developer: 'Files and works bugs in the products they are given. Cannot confirm or triage.',
  tester: 'Files, confirms and triages bugs, and marks duplicates.',
  admin: 'Everything a tester can do, plus managing users and products.',
};

/**
 * The full group list for a role and a set of products.
 *
 * `availableGroups` is the set that actually exists on the instance, and
 * anything outside it is dropped rather than sent: Bugzilla rejects the whole
 * update if one name is unknown, so a single product without a same-named group
 * (KMail API here) would otherwise fail the entire account setup rather than
 * simply granting nothing for that product.
 */
export function groupsForRole(role: Role, products: string[], availableGroups: Set<string>) {
  const wanted = [...new Set([...ROLE_GROUPS[role], ...products])];
  const granted = wanted.filter((g) => availableGroups.has(g));
  const skipped = wanted.filter((g) => !availableGroups.has(g));
  return { granted, skipped };
}

/** Best-fit role for an account, read back from the groups it holds. */
export function roleFromGroups(groups: string[]): Role {
  const held = new Set(groups);
  // Widest first: an admin also holds `canconfirm`, so testing for that first
  // would report every admin as a tester.
  if (held.has('editusers') || held.has('editcomponents')) return 'admin';
  if (held.has('canconfirm')) return 'tester';
  return 'developer';
}

/**
 * The groups this feature is allowed to touch: every role group, plus every
 * product group that exists on the instance.
 *
 * Changing a role has to REMOVE what the old role granted, and the only safe way
 * to do that is to bound removals to a known set. A naive "replace all groups
 * with the new list" would strip everything outside the role model - the
 * `admin`, `creategroups` and `tweakparams` an instance administrator holds, or
 * `bz_canusewhines` that Bugzilla grants by regexp - silently demoting someone
 * far beyond what the form said it was doing.
 */
export function managedGroups(availableGroups: Set<string>, productGroups: string[]): Set<string> {
  const managed = new Set<string>();
  for (const role of ROLES) for (const g of ROLE_GROUPS[role]) if (availableGroups.has(g)) managed.add(g);
  for (const g of productGroups) if (availableGroups.has(g)) managed.add(g);
  return managed;
}
