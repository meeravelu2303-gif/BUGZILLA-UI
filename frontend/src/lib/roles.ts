import { Code2, ShieldCheck, TestTube2, type LucideIcon } from 'lucide-react';
import type { Tone } from '../components/ui/Pill';

/**
 * Roles, read back from the Bugzilla groups an account holds.
 *
 * Mirrors backend/src/lib/roles.ts exactly - including its ORDERING, which is
 * load-bearing: an admin also holds `canconfirm`, so testing for that first
 * would report every admin as a tester.
 *
 * Duplicated rather than imported because the backend is a separate package,
 * so the two must be changed together. This is the single frontend copy; any
 * screen needing a role reads it from here rather than re-deriving it, which
 * is how the admin dashboard and the user list ended up disagreeing before.
 */
export const ROLES = ['developer', 'tester', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/** What each role is actually made of, for tooltips and explanation. */
export const ROLE_GROUPS: Record<Role, string[]> = {
  developer: ['editbugs'],
  tester: ['editbugs', 'canconfirm'],
  admin: ['editbugs', 'canconfirm', 'editusers', 'editcomponents'],
};

export const ROLE_LABELS: Record<Role, string> = {
  developer: 'Developer',
  tester: 'Tester',
  admin: 'Admin',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  developer: 'Files and works bugs in their products. Cannot confirm or triage.',
  tester: 'Files, confirms and triages bugs, and hands work to developers.',
  admin: 'Everything a tester can do, plus managing users and products.',
};

export const ROLE_ICONS: Record<Role, LucideIcon> = {
  developer: Code2,
  tester: TestTube2,
  admin: ShieldCheck,
};

/**
 * Tones chosen so the three read as distinct at a glance down a long list -
 * violet for admin (the rarest and most powerful), teal for tester, neutral
 * slate for developer (the baseline, and the most common).
 */
export const ROLE_TONES: Record<Role, Tone> = {
  developer: 'slate',
  tester: 'teal',
  admin: 'violet',
};

export function roleFromGroups(groups: string[]): Role {
  const held = new Set(groups);
  // Widest first - see the note above.
  if (held.has('editusers') || held.has('editcomponents')) return 'admin';
  if (held.has('canconfirm')) return 'tester';
  return 'developer';
}

/** How a person reads in an assignee picker - name, plus a role when it is worth saying. */
export function assigneeLabel(user: { name: string; email: string; role?: 'admin' | 'developer' }): string {
  const name = user.name || user.email;
  // Only `admin` is called out. Labelling the other nine "Developer" would be
  // noise - it is the default, and the list is engineering-only by design.
  return user.role === 'admin' ? `${name} - Admin` : name;
}
