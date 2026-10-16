import { z } from 'zod';

/** `GET /rest/group` row. `is_active`/`is_bug_group`/`user_regexp` appear only for `creategroups` members. */
export const rawGroupSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    description: z.string().default(''),
    is_active: z.boolean().optional(),
    is_bug_group: z.boolean().optional(),
    user_regexp: z.string().default(''),
    membership: z
      .array(
        z
          .object({
            id: z.number(),
            email: z.string().default(''),
            name: z.string().default(''),
            real_name: z.string().default(''),
            can_login: z.boolean().default(true),
          })
          .passthrough()
      )
      .optional(),
  })
  .passthrough();

export type RawGroup = z.infer<typeof rawGroupSchema>;

export interface GroupMember {
  id: number;
  email: string;
  name: string;
  isEnabled: boolean;
  /**
   * 'admin' when the person holds this group only because they are in `admin`: Bugzilla makes the
   * admin group a member of every group it creates, so every administrator inherits every group.
   * Such a membership cannot be removed here - it is not on the user at all.
   */
  inheritedVia?: 'admin';
}

export interface AdminGroupSummary {
  id: number;
  name: string;
  description: string;
  /**
   * Bugzilla's single `isactive` flag. On editgroups.cgi it is the "Use For Bugs" checkbox: an
   * inactive bug group can no longer be added to bugs, but existing restrictions and membership
   * stay. So "active" and "use for bugs" are the same setting, not two.
   */
  isActive: boolean;
  /** False for Bugzilla's built-in system groups (admin, editusers, tweakparams, …). */
  isBugGroup: boolean;
  userRegexp: string;
  /** True when this group gates a product - it is named after one (see productGroups.ts). */
  isProductGroup: boolean;
  memberCount: number;
}

export interface AdminGroupDetail extends AdminGroupSummary {
  members: GroupMember[];
}

export function normalizeMembers(raw: RawGroup, adminIds: Set<number> = new Set()): GroupMember[] {
  return (raw.membership ?? [])
    .map((m) => ({
      id: m.id,
      email: m.email || m.name,
      name: m.real_name || m.email || m.name,
      isEnabled: m.can_login,
      ...(raw.name !== 'admin' && adminIds.has(m.id) ? { inheritedVia: 'admin' as const } : {}),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function normalizeGroup(raw: RawGroup, productNames: Set<string>): AdminGroupSummary {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    isActive: raw.is_active ?? true,
    isBugGroup: raw.is_bug_group ?? false,
    userRegexp: raw.user_regexp,
    // Bugzilla compares group and product names case-insensitively (collation), so do we.
    isProductGroup: (raw.is_bug_group ?? false) && productNames.has(raw.name.toLowerCase()),
    memberCount: raw.membership?.length ?? 0,
  };
}

/**
 * Bugzilla validates the regexp itself, but only by trying it in Perl. Checking it compiles here
 * too means the common mistake - an unbalanced bracket - is reported against the field instead of
 * coming back as a generic upstream error.
 */
const userRegexp = z
  .string()
  .max(255)
  .refine((v) => {
    if (!v) return true;
    try {
      new RegExp(v);
      return true;
    } catch {
      return false;
    }
  }, 'This is not a valid regular expression.');

const groupName = z
  .string()
  .trim()
  .min(1, 'Group name is required')
  .max(255)
  // Bugzilla stores names as-is, but a comma breaks every comma-separated group list it parses.
  .refine((v) => !v.includes(','), 'Group names cannot contain a comma.');

export const createGroupSchema = z.object({
  name: groupName,
  description: z.string().trim().min(1, 'Description is required').max(255),
  userRegexp: userRegexp.optional(),
  isActive: z.boolean().default(true),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const updateGroupSchema = z
  .object({
    name: groupName.optional(),
    description: z.string().trim().min(1, 'Description is required').max(255).optional(),
    userRegexp: userRegexp.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });

export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

export const membershipChangeSchema = z
  .object({
    add: z.array(z.number().int().positive()).max(100).default([]),
    remove: z.array(z.number().int().positive()).max(100).default([]),
  })
  .refine((v) => v.add.length + v.remove.length > 0, { message: 'Nothing to change' })
  .refine((v) => !v.add.some((id) => v.remove.includes(id)), { message: 'A user cannot be both added and removed' });

export const userSearchQuerySchema = z.object({
  q: z.string().trim().min(2, 'Type at least 2 characters').max(100),
});
