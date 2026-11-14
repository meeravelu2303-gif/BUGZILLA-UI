import { z } from 'zod';

/** Shared by the session middleware (index.ts) and logout's clearCookie (controllers/auth.controller.ts). */
export const SESSION_COOKIE_NAME = 'bzui_session';

const bool = (defaultValue: 'true' | 'false') =>
  z
    .string()
    .default(defaultValue)
    .transform((value) => value === 'true');

const envSchema = z
  .object({
    BUGZILLA_URL: z.string().url(),
    BUGZILLA_API_KEY: z.string().min(1, 'BUGZILLA_API_KEY must be set'),
    PORT: z.coerce.number().int().positive().default(4000),
    SESSION_SECRET: z.string().min(16, 'SESSION_SECRET should be at least 16 characters'),
    COOKIE_SECURE: z.enum(['true', 'false', 'auto']).default('auto'),
    TRUST_PROXY: z.string().default('false'),
    CORS_ORIGIN: z.string().default('http://localhost:5175'),
    SESSION_STORE: z.enum(['memory', 'file', 'redis']).default('file'),
    SESSION_DIR: z.string().min(1).optional(),
    REDIS_URL: z.string().url().optional(),
    STATS_CACHE_TTL_MS: z.coerce.number().int().min(0).default(60_000),
    PUBLIC_APP_URL: z
      .string()
      .url()
      .optional()
      .transform((value) => value?.replace(/\/+$/, '')),
    PROOF_LINK_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    PROOF_LINK_SECRET: z.string().min(16).optional(),
    BUGZILLA_PUBLIC_URL: z.string().url().optional(),
    HSTS: bool('false'),
    PRODUCT_TRANSFER_ROUTES: z.string().default('KPost UI<->KPost API; KPost Admin UI<->KPost Admin'),
    TRANSFER_API_KEY: z.string().min(1).optional(),
  })
  .superRefine((env, context) => {
    if (env.SESSION_STORE === 'redis' && !env.REDIS_URL) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['REDIS_URL'],
        message: 'REDIS_URL is required when SESSION_STORE=redis',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** TRUST_PROXY as Express wants it: boolean, hop count, or address list. */
export function trustProxySetting(value: string): boolean | number | string {
  const normalizedValue = value.trim();
  if (normalizedValue === 'true') return true;
  if (normalizedValue === 'false' || normalizedValue === '') return false;
  if (/^\d+$/.test(normalizedValue)) return Number(normalizedValue);
  return normalizedValue;
}

/** Optional settings with no default: an empty value (`KEY=` in an env file) means "not set". */
const UNSET_WHEN_EMPTY = ['SESSION_DIR', 'REDIS_URL', 'PROOF_LINK_SECRET', 'BUGZILLA_PUBLIC_URL', 'TRANSFER_API_KEY'];

export function loadEnv(): Env {
  const source = { ...process.env };
  for (const key of UNSET_WHEN_EMPTY) if (source[key] === '') delete source[key];
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    console.error('Invalid environment configuration:');
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data;
}

/** The validated configuration, read once at start-up. */
export const env: Env = loadEnv();
