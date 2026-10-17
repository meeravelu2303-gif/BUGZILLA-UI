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

/**
 * Bugzilla's password tokens are short random strings; anything outside that
 * alphabet is refused here rather than forwarded. The pattern is deliberately
 * wider than the current generator so a Bugzilla upgrade cannot lock everyone
 * out of resets by changing it.
 */
export const resetTokenSchema = z.string().trim().min(6).max(128).regex(/^[\w.~-]+$/, 'Malformed reset token');

/**
 * Length only. USER_PASSWORD_MIN_LENGTH is Bugzilla's own floor (6); the
 * complexity rule is a Bugzilla parameter that only Bugzilla can apply, and
 * its refusal is passed through with its own wording.
 */
export const resetPasswordInputSchema = z
  .object({
    token: resetTokenSchema,
    password: z.string().min(6, 'Password must be at least 6 characters').max(1024),
    confirmPassword: z.string().max(1024).optional(),
  })
  .refine((v) => v.confirmPassword === undefined || v.confirmPassword === v.password, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;

/**
 * Same length floor as reset (Bugzilla's USER_PASSWORD_MIN_LENGTH); complexity
 * is Bugzilla's to judge. "Same as current" is refused here because Bugzilla
 * itself accepts it silently and changes nothing - the user would be told it
 * worked while their password stayed as it was.
 */
export const changePasswordInputSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password').max(1024),
    newPassword: z.string().min(6, 'Password must be at least 6 characters').max(1024),
    confirmPassword: z.string().max(1024),
  })
  .refine((v) => v.confirmPassword === v.newPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    message: 'The new password must be different from the current one',
  });

export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;
