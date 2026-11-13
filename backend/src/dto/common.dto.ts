import { z } from 'zod';

export const userDetailSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    email: z.string(),
    real_name: z.string().default(''),
    login_denied_text: z.string().default(''),
    groups: z.array(z.object({ name: z.string() }).passthrough()).default([]),
  })
  .passthrough();

export type UserDetail = z.infer<typeof userDetailSchema>;

export function normalizeUser(u?: UserDetail | null): { id: number; email: string; name: string } | null {
  if (!u) return null;
  return { id: u.id, email: u.email, name: u.real_name || u.email };
}

export interface Permissions {
  canManageUsers: boolean;
  canManageProducts: boolean;
  /**
   * May hand a bug to someone else even when it is not theirs.
   *
   * Comes from `canconfirm`, the group that already marks a triager on this
   * instance ("confirm a bug or mark it a duplicate"). Deciding who a defect
   * belongs to is the same job as deciding whether it is real, so the same
   * people do both - testers and admins. A developer keeps their own bugs
   * movable, but cannot reach across and reassign a colleague's.
   */
  canTriage: boolean;
  /**
   * May reassign any open bug, not only their own - single or in bulk from the
   * bug list. Testers, admins and developers (`editbugs`), by the user's
   * decision of 2026-10-28; office reporters without `editbugs` may not.
   * Reopening, deleting and transferring stay with `canTriage`.
   */
  canReassignAny: boolean;
  /**
   * Read-only access to the admin Users / Products screens, and adding a
   * component to a product. Testers (`canconfirm`) get these without being
   * admins: they may look, and grow a product's module list as they test it,
   * but creating products and editing/deleting anything stays with
   * `canManageUsers` / `canManageProducts`. The BFF performs these reads and
   * the component create with its service key (Bugzilla itself would refuse a
   * tester), so these flags ARE the enforcement for those calls.
   */
  canViewUsers: boolean;
  canViewProducts: boolean;
  canCreateComponents: boolean;
  /** Member of the `reporter` marker group: files bugs, is never assigned any. Gets the "my reports" board. */
  isReporter: boolean;
}

/**
 * Admin capability is derived from the Bugzilla groups on the user's own
 * record (self-lookup always returns full group detail regardless of
 * privilege - see docs/API_CONTRACT.md §12). Bugzilla itself remains the real
 * enforcement point: every admin write is re-checked live and rejected with
 * error code 304 if these have gone stale mid-session.
 */
export function derivePermissions(groups: { name: string }[]): Permissions {
  const names = new Set(groups.map((g) => g.name));
  return {
    canManageUsers: names.has('editusers'),
    canManageProducts: names.has('editcomponents'),
    // `editusers` implies it: an admin who can create the accounts should not be
    // blocked from routing work between them.
    canTriage: names.has('canconfirm') || names.has('editusers'),
    canReassignAny: names.has('editbugs') || names.has('canconfirm') || names.has('editusers'),
    canViewUsers: names.has('editusers') || names.has('canconfirm'),
    canViewProducts: names.has('editcomponents') || names.has('canconfirm'),
    canCreateComponents: names.has('editcomponents') || names.has('canconfirm'),
    isReporter: names.has('reporter'),
  };
}
