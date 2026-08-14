import { z } from 'zod';

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
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    fullName: z.string().optional(),
    password: z.string().min(6, 'Password must be at least 6 characters long').optional(),
    disabled: z.boolean().optional(),
    disabledReason: z.string().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' })
  .refine((v) => v.disabled !== true || Boolean(v.disabledReason?.trim()), {
    message: 'A reason is required to disable a user',
    path: ['disabledReason'],
  });

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
