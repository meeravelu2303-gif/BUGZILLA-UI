import { z } from 'zod';
import { ROLES } from '../lib/roles';

export const rawAdminUserSchema = z
  .object({
    id: z.number(),
    email: z.string(),
    real_name: z.string().default(''),
    can_login: z.boolean().default(true),
    login_denied_text: z.string().default(''),
    groups: z.array(z.object({ name: z.string() }).passthrough()).default([]),
  })
  .passthrough();

export type RawAdminUser = z.infer<typeof rawAdminUserSchema>;

export interface AdminUser {
  id: number;
  email: string;
  fullName: string;
  isEnabled: boolean;
  disabledReason: string;
  groups: string[];
}

export function normalizeAdminUser(raw: RawAdminUser): AdminUser {
  return {
    id: raw.id,
    email: raw.email,
    fullName: raw.real_name,
    isEnabled: raw.login_denied_text === '',
    disabledReason: raw.login_denied_text,
    groups: raw.groups.map((g) => g.name),
  };
}

export const listUsersQuerySchema = z.object({
  // Optional: an empty search means "list everyone" (see adminUsers route).
  search: z.string().optional(),
});

export const createUserSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  fullName: z.string().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  /*
   * Both optional, so an account can still be created bare and have its groups
   * set in Bugzilla afterwards - the behaviour before roles existed, which any
   * existing tooling may depend on.
   */
  role: z.enum(ROLES).optional(),
  /** Products the account may see. Each maps to a same-named Bugzilla group. */
  products: z.array(z.string().min(1)).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    fullName: z.string().optional(),
    password: z.string().min(6, 'Password must be at least 6 characters long').optional(),
    disabled: z.boolean().optional(),
    disabledReason: z.string().optional(),
    /*
     * Sent together or not at all: a role without products would leave access
     * untouched while capability changed, and products without a role the
     * reverse - both leave the account in a state the form never showed.
     */
    role: z.enum(ROLES).optional(),
    products: z.array(z.string().min(1)).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' })
  .refine((v) => v.disabled !== true || Boolean(v.disabledReason?.trim()), {
    message: 'A reason is required to disable a user',
    path: ['disabledReason'],
  });

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
