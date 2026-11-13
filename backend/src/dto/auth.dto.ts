import { z } from 'zod';

export const loginInputSchema = z.object({
  login: z.string().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginInputSchema>;

export const forgotPasswordInputSchema = z.object({
  login: z.string().trim().min(3, 'Email is required').max(255).email('Enter a valid email address'),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordInputSchema>;

/** Bugzilla's password tokens are short random strings. */
export const resetTokenSchema = z
  .string()
  .trim()
  .min(6)
  .max(128)
  .regex(/^[\w.~-]+$/, 'Malformed reset token');

/** Length only. */
export const resetPasswordInputSchema = z
  .object({
    token: resetTokenSchema,
    password: z.string().min(6, 'Password must be at least 6 characters').max(1024),
    confirmPassword: z.string().max(1024).optional(),
  })
  .refine((value) => value.confirmPassword === undefined || value.confirmPassword === value.password, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;

/** Same length floor as reset (Bugzilla's USER_PASSWORD_MIN_LENGTH); complexity is Bugzilla's to judge. */
export const changePasswordInputSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password').max(1024),
    newPassword: z.string().min(6, 'Password must be at least 6 characters').max(1024),
    confirmPassword: z.string().max(1024),
  })
  .refine((value) => value.confirmPassword === value.newPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    path: ['newPassword'],
    message: 'The new password must be different from the current one',
  });

export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;
