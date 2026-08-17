import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import session from 'express-session';
import { loadEnv, SESSION_COOKIE_NAME } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { adminMetaRouter } from './routes/adminMeta';
import { adminProductsRouter } from './routes/adminProducts';
import { adminUsersRouter } from './routes/adminUsers';
import { authRouter } from './routes/auth';
import { bugsRouter } from './routes/bugs';
import { metaRouter } from './routes/meta';
import { productsRouter } from './routes/products';

const env = loadEnv();
const app = express();

app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
app.use(
  cors({
    origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
  })
);
app.use(express.json());
// Sessions live server-side in the default in-memory MemoryStore, so the cookie
// carries only an opaque signed session id - never the user's Bugzilla token.
// This BFF is single-instance by design (no database drivers); a restart just
// means users log in again.
app.use(
  session({
    name: SESSION_COOKIE_NAME,
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.COOKIE_SECURE,
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
    },
  })
);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRouter(env));
app.use('/api/bugs', bugsRouter(env));
app.use('/api/products', productsRouter(env));
app.use('/api/meta', metaRouter(env));
app.use('/api/admin/users', adminUsersRouter(env));
app.use('/api/admin/products', adminProductsRouter(env));
app.use('/api/admin/meta', adminMetaRouter(env));

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`BFF listening on http://localhost:${env.PORT}`);
  console.log(`Proxying Bugzilla REST at ${env.BUGZILLA_URL}`);
});
