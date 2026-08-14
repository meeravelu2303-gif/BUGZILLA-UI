import 'dotenv/config';
import cookieSession from 'cookie-session';
import cors from 'cors';
import express from 'express';
import { loadEnv } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { adminProductsRouter } from './routes/adminProducts';
import { adminUsersRouter } from './routes/adminUsers';
import { authRouter } from './routes/auth';
import { bugsRouter } from './routes/bugs';
import { metaRouter } from './routes/meta';
import { productsRouter } from './routes/products';

const env = loadEnv();
const app = express();

app.disable('x-powered-by');
app.use(
  cors({
    origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
  })
);
app.use(express.json());
app.use(
  cookieSession({
    name: 'bzui_session',
    secret: env.SESSION_SECRET,
    httpOnly: true,
    sameSite: 'lax',
    secure: env.COOKIE_SECURE,
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
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

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`BFF listening on http://localhost:${env.PORT}`);
  console.log(`Proxying Bugzilla REST at ${env.BUGZILLA_URL}`);
});
