import { z } from 'zod';

/**
 * Shared by the session middleware (index.ts) and logout's clearCookie (routes/auth.ts).
 *
 * Staging gets its own name: browsers share cookies across ports of one host, so the live UI on
 * :5175 and the staging UI on :5176 would otherwise overwrite each other's session. Read straight
 * from process.env because it is a module constant; loadEnvFile.ts has run before this module.
 */
export const SESSION_COOKIE_NAME = process.env.APP_ENV === 'staging' ? 'bzui_session_staging' : 'bzui_session';

const envSchema = z.object({
  BUGZILLA_URL: z.string().url(),
  /** `staging` shows a STAGING banner in the UI and isolates the session cookie. */
  APP_ENV: z.enum(['live', 'staging']).default('live'),
  BUGZILLA_API_KEY: z.string().min(1, 'BUGZILLA_API_KEY must be set'),
  PORT: z.coerce.number().int().positive().default(4000),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET should be at least 16 characters'),
  COOKIE_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  /**
   * How long (ms) to reuse the per-user category index and dashboard stats
   * before recomputing them from Bugzilla.
   *
   * Both are derived by asking Bugzilla which bug ids match each category, which
   * is four searches over the whole product - cheap to reuse, wasteful to repeat
   * on every list page. Kept short so a newly filed bug appears promptly; set to
   * 0 to disable caching entirely (useful when debugging against a live bench run).
   */
  STATS_CACHE_TTL_MS: z.coerce.number().int().min(0).default(60_000),
  /**
   * The address other machines use to reach this app (e.g. http://192.168.0.50:5175). Links written
   * into an exported sheet use it, so they work on a developer's machine - not "localhost", which
   * only ever means the machine the link is opened on.
   */
  PUBLIC_APP_URL: z
    .string()
    .url()
    .optional()
    .transform((v) => v?.replace(/\/+$/, '')),
  /** How long a proof link in an exported sheet keeps working without a login. */
  PROOF_LINK_DAYS: z.coerce.number().int().min(1).max(365).default(30),
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
