import { groupIndex } from './productGroups.service';

/** Roles, as a shorthand for the Bugzilla groups behind them. */
export const ROLES = ['reporter', 'developer', 'tester', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/** editbugs is in every role because filing and editing bugs is the baseline for anyone with an account here. */
export const ROLE_GROUPS: Record<Role, string[]> = {
  reporter: ['editbugs', 'reporter'],
  developer: ['editbugs'],
  tester: ['editbugs', 'canconfirm'],
  admin: ['editbugs', 'canconfirm', 'editusers', 'editcomponents'],
};

export const ROLE_LABELS: Record<Role, string> = {
  reporter: 'Reporter',
  developer: 'Developer',
  tester: 'Tester',
  admin: 'Administrator',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  reporter: 'Office staff who file and follow bugs. Never assigned work; cannot confirm or triage.',
  developer: 'Files and works bugs in the products they are given. Cannot confirm or triage.',
  tester: 'Files, confirms and triages bugs, and marks duplicates.',
  admin: 'Everything a tester can do, plus managing users and products.',
};

/** The full group list for a role and a set of products. */
export function groupsForRole(role: Role, products: string[], availableGroups: Set<string>) {
  const wanted = [...new Set([...ROLE_GROUPS[role], ...products])];

  const index = groupIndex(availableGroups);
  const granted: string[] = [];
  const skipped: string[] = [];
  for (const name of wanted) {
    const actual = index.get(name.toLowerCase());
    if (actual) granted.push(actual);
    else skipped.push(name);
  }
  return { granted, skipped };
}

/** Best-fit role for an account, read back from the groups it holds. */
export function roleFromGroups(groups: string[]): Role {
  const held = new Set(groups);
  if (held.has('editusers') || held.has('editcomponents')) return 'admin';
  if (held.has('canconfirm')) return 'tester';
  if (held.has('reporter')) return 'reporter';
  return 'developer';
}

/** The groups this feature is allowed to touch. */
export function managedGroups(availableGroups: Set<string>, productGroups: string[]): Set<string> {
  const index = groupIndex(availableGroups);
  const managed = new Set<string>();
  const add = (name: string) => {
    const actual = index.get(name.toLowerCase());
    if (actual) managed.add(actual);
  };
  for (const role of ROLES) for (const group of ROLE_GROUPS[role]) add(group);
  for (const group of productGroups) add(group);
  return managed;
}
