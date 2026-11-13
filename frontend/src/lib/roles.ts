import { Code2, ShieldCheck, TestTube2, UserRound, type LucideIcon } from 'lucide-react';
import type { Tone } from '../components/ui/Pill';

/** Roles, read back from the Bugzilla groups an account holds. */
export const ROLES = ['reporter', 'developer', 'tester', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/** What each role is actually made of, for tooltips and explanation. */
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
  admin: 'Admin',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  reporter: 'Office staff who file and follow bugs. Never assigned work; cannot confirm or triage.',
  developer: 'Files and works bugs in their products. Cannot confirm or triage.',
  tester: 'Files, confirms and triages bugs, and hands work to developers.',
  admin: 'Everything a tester can do, plus managing users and products.',
};

export const ROLE_ICONS: Record<Role, LucideIcon> = {
  reporter: UserRound,
  developer: Code2,
  tester: TestTube2,
  admin: ShieldCheck,
};

/** Tones chosen so the three read as distinct at a glance down a long list. */
export const ROLE_TONES: Record<Role, Tone> = {
  reporter: 'amber',
  developer: 'slate',
  tester: 'teal',
  admin: 'violet',
};

export function roleFromGroups(groups: string[]): Role {
  const held = new Set(groups);
  if (held.has('editusers') || held.has('editcomponents')) return 'admin';
  if (held.has('canconfirm')) return 'tester';
  if (held.has('reporter')) return 'reporter';
  return 'developer';
}

/** How a person reads in an assignee picker - name, plus a role when it is worth saying. */
export function assigneeLabel(user: { name: string; email: string; role?: Role }): string {
  const name = user.name || user.email;
  if (user.role === 'admin') return `${name} - Admin`;
  if (user.role === 'tester') return `${name} - Tester`;
  return name;
}
