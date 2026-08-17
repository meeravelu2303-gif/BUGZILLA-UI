import { z } from 'zod';

/** Shared by the session middleware (index.ts) and logout's clearCookie (routes/auth.ts). */
export const SESSION_COOKIE_NAME = 'bzui_session';

const envSchema = z.object({
  BUGZILLA_URL: z.string().url(),
  BUGZILLA_API_KEY: z.string().min(1, 'BUGZILLA_API_KEY must be set'),
  PORT: z.coerce.number().int().positive().default(4000),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET should be at least 16 characters'),
  COOKIE_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment configuration:');
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data;
}
