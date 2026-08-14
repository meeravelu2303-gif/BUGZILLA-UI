import { z } from 'zod';

export const loginInputSchema = z.object({
  login: z.string().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginInputSchema>;
