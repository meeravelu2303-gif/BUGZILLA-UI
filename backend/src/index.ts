import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import session from 'express-session';
import { env, SESSION_COOKIE_NAME, trustProxySetting } from './config/app.config';
import { getBugSnapshot } from './services/bugSnapshot.service';
import { startChangeWatcher } from './events/liveUpdates.event';
import { createSessionStore } from './clients/session.store';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { apiRouter } from './routes/api.route';

async function main(): Promise<void> {
  const app = express();

  app.set('trust proxy', trustProxySetting(env.TRUST_PROXY));
  app.disable('x-powered-by');

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (env.HSTS) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((value) => value.trim()),
      credentials: true,
    }),
  );

  app.use('/api/bugs/:id/attachments', express.json({ limit: '25mb' }));
  app.use(express.json());

  const store = await createSessionStore(env);
  app.use(
    session({
      name: SESSION_COOKIE_NAME,
      secret: env.SESSION_SECRET,
      store,
      resave: false,
      saveUninitialized: false,
      proxy: env.COOKIE_SECURE === 'auto' ? undefined : env.COOKIE_SECURE === 'true',
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.COOKIE_SECURE === 'auto' ? 'auto' : env.COOKIE_SECURE === 'true',
        maxAge: 8 * 60 * 60 * 1000,
      },
    }),
  );

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  createServer({ maxHeaderSize: 64 * 1024 }, app).listen(env.PORT, () => {
    console.log(`BFF listening on http://localhost:${env.PORT}`);
    startChangeWatcher(env);
    const warmStart = Date.now();
    getBugSnapshot(env)
      .then((snapshot) => console.log(`[snapshot] ${snapshot.rows.length} bugs loaded in ${Date.now() - warmStart} ms`))
      .catch((err) =>
        console.warn('[snapshot] warm-up failed (will load on first use):', err instanceof Error ? err.message : err),
      );
    console.log(`Bugzilla at ${env.BUGZILLA_URL} (JSON-RPC transport, credentials in request bodies)`);
    console.log(
      `Sessions: ${env.SESSION_STORE} · cookie secure: ${env.COOKIE_SECURE} · trust proxy: ${env.TRUST_PROXY}`,
    );
    if (env.PRODUCT_TRANSFER_ROUTES.trim() && !env.TRANSFER_API_KEY) {
      console.warn(
        '[transfer] TRANSFER_API_KEY is not set: cross-product transfers run on BUGZILLA_API_KEY, so Bugzilla history ' +
          'will show that account as the one who moved each bug. Create a dedicated account (bugzilla/setup/setup-transfer-account.pl).',
      );
    }
  });
}

main().catch((err) => {
  console.error('BFF failed to start:', err);
  process.exit(1);
});
