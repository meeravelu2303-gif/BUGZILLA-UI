import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import session from 'express-session';
import { loadEnv, SESSION_COOKIE_NAME, trustProxySetting } from './config/env';
import { rpcCall } from './lib/bugzillaClient';
import { getBugSnapshot } from './lib/bugSnapshot';
import { eventsRouter, startChangeWatcher } from './lib/liveUpdates';
import { createSessionStore } from './lib/sessionStore';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { adminMetaRouter } from './routes/adminMeta';
import { adminProductsRouter } from './routes/adminProducts';
import { adminTeamsRouter } from './routes/adminTeams';
import { adminUsersRouter } from './routes/adminUsers';
import { authRouter } from './routes/auth';
import { bugsRouter } from './routes/bugs';
import { metaRouter } from './routes/meta';
import { productsRouter } from './routes/products';
import { proofRouter } from './routes/proof';

const env = loadEnv();
const startedAt = Date.now();

async function main(): Promise<void> {
  const app = express();

  /*
   * `trust proxy` decides what `req.ip` and `req.secure` mean. Behind a reverse
   * proxy (the production layout in docs/DEPLOYMENT.md) the rate limiter keys on the
   * client's real address and `COOKIE_SECURE=auto` sees the original scheme.
   */
  app.set('trust proxy', trustProxySetting(env.TRUST_PROXY));
  app.disable('x-powered-by');

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    // The API serves JSON only: no scripts, frames or plugins may ever run from it.
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (env.HSTS) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
      credentials: true,
    })
  );

  // Evidence uploads arrive base64-encoded in JSON, so that one route gets a larger body limit;
  // mounted first, it parses the body and the global parser below then leaves it alone.
  app.use('/api/bugs/:id/attachments', express.json({ limit: '25mb' }));
  app.use(express.json());

  /*
   * Sessions live server-side (lib/sessionStore.ts); the cookie carries only an
   * opaque signed session id - never the user's Bugzilla token. With the file or
   * Redis store a restart keeps everyone signed in.
   */
  const store = await createSessionStore(env);
  app.use(
    session({
      name: SESSION_COOKIE_NAME,
      secret: env.SESSION_SECRET,
      store,
      resave: false,
      saveUninitialized: false,
      // Secure must be honoured by the proxy-aware setting above when `auto`.
      proxy: env.COOKIE_SECURE === 'auto' ? undefined : env.COOKIE_SECURE === 'true',
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.COOKIE_SECURE === 'auto' ? 'auto' : env.COOKIE_SECURE === 'true',
        maxAge: 8 * 60 * 60 * 1000, // 8 hours
      },
    })
  );

  /*
   * Liveness: `GET /api/health` answers from this process alone, so a monitor
   * can tell "the BFF is down" from "Bugzilla is down". Add `?deep=1` to also
   * ask Bugzilla for its version on the service key (a cheap, read-only call).
   */
  app.get('/api/health', async (req, res) => {
    const body: Record<string, unknown> = {
      ok: true,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      sessionStore: env.SESSION_STORE,
    };
    if (req.query.deep === '1') {
      try {
        const upstream = await rpcCall<{ version: string }>(env.BUGZILLA_URL, 'Bugzilla.version', {}, { kind: 'api_key', apiKey: env.BUGZILLA_API_KEY });
        body.bugzilla = { ok: true, version: upstream.version };
      } catch (err) {
        body.ok = false;
        body.bugzilla = { ok: false, error: err instanceof Error ? err.message : 'unreachable' };
        res.status(503);
      }
    }
    res.set('Cache-Control', 'no-store').json(body);
  });

  app.use('/api/auth', authRouter(env));
  app.use('/api/events', eventsRouter(env));
  app.use('/api/bugs', bugsRouter(env));
  app.use('/api/products', productsRouter(env));
  app.use('/api/meta', metaRouter(env));
  // No login on purpose: opened from links in an exported sheet; every link is signed and expires.
  app.use('/api/proof', proofRouter(env));
  app.use('/api/admin/users', adminUsersRouter(env));
  app.use('/api/admin/products', adminProductsRouter(env));
  app.use('/api/admin/meta', adminMetaRouter(env));
  app.use('/api/admin/teams', adminTeamsRouter(env));

  app.use(notFoundHandler);
  app.use(errorHandler);

  /*
   * 64 KB of request headers instead of Node's 16 KB default. Cookies are per HOST,
   * not per port, so every app on 192.168.0.50 - Bugzilla's own pages included -
   * adds to the Cookie header the browser sends here. Past 16 KB Node answers
   * 431 to every request and that browser cannot use the app at all.
   */
  createServer({ maxHeaderSize: 64 * 1024 }, app).listen(env.PORT, () => {
    console.log(`BFF listening on http://localhost:${env.PORT}`);
    // Live updates: notice bugs changed outside this app (benches, Bugzilla pages).
    startChangeWatcher(env);
    // Build the in-memory bug copy now (it then refreshes itself), so the first
    // dashboard after a restart is not the one that waits for it.
    const warmStart = Date.now();
    getBugSnapshot(env)
      .then((snap) => console.log(`[snapshot] ${snap.rows.length} bugs loaded in ${Date.now() - warmStart} ms`))
      .catch((err) => console.warn('[snapshot] warm-up failed (will load on first use):', err instanceof Error ? err.message : err));
    console.log(`Bugzilla at ${env.BUGZILLA_URL} (JSON-RPC transport, credentials in request bodies)`);
    console.log(`Sessions: ${env.SESSION_STORE} · cookie secure: ${env.COOKIE_SECURE} · trust proxy: ${env.TRUST_PROXY}`);
    if (env.PRODUCT_TRANSFER_ROUTES.trim() && !env.TRANSFER_API_KEY) {
      console.warn(
        '[transfer] TRANSFER_API_KEY is not set: cross-product transfers run on BUGZILLA_API_KEY, so Bugzilla history ' +
          'will show that account as the one who moved each bug. Create a dedicated account (ops/bugzilla/setup-transfer-account.pl).'
      );
    }
  });
}

main().catch((err) => {
  console.error('BFF failed to start:', err);
  process.exit(1);
});
