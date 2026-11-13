import { z } from 'zod';
import { ROLES } from '../services/roles.service';

export const rawAdminUserSchema = z
  .object({
    id: z.number(),
    email: z.string(),
    real_name: z.string().default(''),
    can_login: z.boolean().default(true),
    login_denied_text: z.string().default(''),
    email_enabled: z.boolean().default(true),
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
  emailEnabled: boolean;
  groups: string[];
}

export function normalizeAdminUser(raw: RawAdminUser): AdminUser {
  return {
    id: raw.id,
    email: raw.email,
    fullName: raw.real_name,
    isEnabled: raw.login_denied_text === '',
    disabledReason: raw.login_denied_text,
    emailEnabled: raw.email_enabled,
    groups: raw.groups.map((group) => group.name),
  };
}

export const listUsersQuerySchema = z.object({
  search: z.string().optional(),
});

export const createUserSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  fullName: z.string().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters long').optional(),
  sendWelcome: z.boolean().optional(),
  role: z.enum(ROLES).optional(),
  products: z.array(z.string().min(1)).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    fullName: z.string().optional(),
    email: z.string().trim().email('Enter a valid email address').max(255).optional(),
    emailEnabled: z.boolean().optional(),
    password: z.string().min(6, 'Password must be at least 6 characters long').optional(),
    disabled: z.boolean().optional(),
    disabledReason: z.string().optional(),
    role: z.enum(ROLES).optional(),
    products: z.array(z.string().min(1)).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field must be provided' })
  .refine((value) => value.disabled !== true || Boolean(value.disabledReason?.trim()), {
    message: 'A reason is required to disable a user',
    path: ['disabledReason'],
  });

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
