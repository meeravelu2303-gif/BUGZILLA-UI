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

export function normalizeUser(user?: UserDetail | null): { id: number; email: string; name: string } | null {
  if (!user) return null;
  return { id: user.id, email: user.email, name: user.real_name || user.email };
}

export interface Permissions {
  canManageUsers: boolean;
  canManageProducts: boolean;
  canTriage: boolean;
  canReassignAny: boolean;
  canViewUsers: boolean;
  canViewProducts: boolean;
  canCreateComponents: boolean;
  isReporter: boolean;
}

/** Admin capability is derived from the Bugzilla groups on the user's own record (self-lookup always. */
export function derivePermissions(groups: { name: string }[]): Permissions {
  const names = new Set(groups.map((group) => group.name));
  return {
    canManageUsers: names.has('editusers'),
    canManageProducts: names.has('editcomponents'),
    canTriage: names.has('canconfirm') || names.has('editusers'),
    canReassignAny: names.has('editbugs') || names.has('canconfirm') || names.has('editusers'),
    canViewUsers: names.has('editusers') || names.has('canconfirm'),
    canViewProducts: names.has('editcomponents') || names.has('canconfirm'),
    canCreateComponents: names.has('editcomponents') || names.has('canconfirm'),
    isReporter: names.has('reporter'),
  };
}
