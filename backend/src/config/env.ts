import { z } from 'zod';

/** Shared by the session middleware (index.ts) and logout's clearCookie (routes/auth.ts). */
export const SESSION_COOKIE_NAME = 'bzui_session';

const bool = (defaultValue: 'true' | 'false') =>
  z
    .string()
    .default(defaultValue)
    .transform((v) => v === 'true');

const envSchema = z
  .object({
    BUGZILLA_URL: z.string().url(),
    BUGZILLA_API_KEY: z.string().min(1, 'BUGZILLA_API_KEY must be set'),
    PORT: z.coerce.number().int().positive().default(4000),
    SESSION_SECRET: z.string().min(16, 'SESSION_SECRET should be at least 16 characters'),
    /**
     * `true`  - cookies carry the Secure flag; browsers send them over HTTPS only.
     * `false` - plain HTTP (development on localhost).
     * `auto`  - Secure exactly when the request arrived over HTTPS (needs TRUST_PROXY
     *           when TLS terminates at a reverse proxy). The safe default: a plain
     *           HTTP dev server keeps working, an HTTPS deployment is protected.
     */
    COOKIE_SECURE: z.enum(['true', 'false', 'auto']).default('auto'),
    /**
     * Express's `trust proxy` setting. `false` (default) when clients connect
     * directly; `1` behind one reverse proxy (nginx/IIS/Apache in front of this
     * server); `2` behind two; or a comma-separated list of proxy addresses.
     * Without it, behind a proxy every request appears to come from the proxy,
     * so the login rate limiter would lock everyone out together and `auto`
     * cookies would never be marked Secure.
     */
    TRUST_PROXY: z.string().default('false'),
    CORS_ORIGIN: z.string().default('http://localhost:5175'),
    /** See lib/sessionStore.ts. `file` survives restarts with no extra infrastructure. */
    SESSION_STORE: z.enum(['memory', 'file', 'redis']).default('file'),
    /** Directory for SESSION_STORE=file (default: ./.sessions next to the backend). */
    SESSION_DIR: z.string().min(1).optional(),
    /** e.g. redis://127.0.0.1:6379/0 - required for SESSION_STORE=redis. */
    REDIS_URL: z.string().url().optional(),
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
    /**
     * Signs proof links. Separate from SESSION_SECRET so rotating session signing
     * (which only signs people out) does not also void every link in every sheet
     * ever exported. Falls back to SESSION_SECRET when unset, for compatibility.
     */
    PROOF_LINK_SECRET: z.string().min(16).optional(),
    /** Enables the HSTS header. Set only once the site is served over HTTPS end to end. */
    HSTS: bool('false'),
    /**
     * Which products a bug may be transferred between by someone who cannot
     * enter the target product (lib/productTransfer.ts). `A<->B` both ways,
     * `A->B` one way, separated by `;`. Empty disables transfers.
     */
    PRODUCT_TRANSFER_ROUTES: z.string().default('KPost UI<->KPost API; KPost Admin UI<->KPost Admin'),
    /**
     * API key of the account that carries out transfers. Should be a dedicated,
     * NON-admin account in every product group plus editbugs/canconfirm
     * (ops/bugzilla/setup-transfer-account.pl), so the history names it rather
     * than a person. Falls back to BUGZILLA_API_KEY, with a startup warning.
     */
    TRANSFER_API_KEY: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.SESSION_STORE === 'redis' && !env.REDIS_URL) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['REDIS_URL'], message: 'REDIS_URL is required when SESSION_STORE=redis' });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** `TRUST_PROXY` as Express wants it: boolean, hop count, or address list. */
export function trustProxySetting(value: string): boolean | number | string {
  const v = value.trim();
  if (v === 'true') return true;
  if (v === 'false' || v === '') return false;
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}

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
