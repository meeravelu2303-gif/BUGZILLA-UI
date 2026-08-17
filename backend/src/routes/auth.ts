import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { SESSION_COOKIE_NAME, type Env } from '../config/env';
import { loginToBugzilla } from '../lib/bugzillaAuth';
import { BugzillaClient } from '../lib/bugzillaClient';
import { AppError } from '../lib/errors';
import { parseInput } from '../lib/validate';
import { loginInputSchema } from '../schemas/auth';
import { derivePermissions, userDetailSchema } from '../schemas/common';
import { requireAuth } from '../middleware/auth';
import type { SessionUser } from '../types/express';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

/**
 * In-memory fixed-window rate limiter for the login endpoint. Login proxies
 * straight through to Bugzilla's own auth, so without this a caller can
 * brute-force credentials against Bugzilla with no friction. Kept in-process
 * deliberately - this BFF has no database drivers and runs single-instance.
 */
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function loginRateLimit(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  const key = req.ip ?? 'unknown';

  // Cheap sweep so the map cannot grow unbounded across many client IPs.
  for (const [k, v] of loginAttempts) {
    if (now >= v.resetAt) loginAttempts.delete(k);
  }

  const entry = loginAttempts.get(key);
  if (!entry) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    next();
    return;
  }

  entry.count += 1;
  if (entry.count > LOGIN_MAX_ATTEMPTS) {
    const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    next(
      new AppError(
        429,
        'RATE_LIMITED',
        `Too many login attempts. Please try again in ${Math.ceil(retryAfterSec / 60)} minute(s).`
      )
    );
    return;
  }

  next();
}

export function authRouter(env: Env): Router {
  const router = Router();

  router.post('/login', loginRateLimit, async (req, res, next) => {
    try {
      const input = parseInput(loginInputSchema, req.body);
      const { id, token } = await loginToBugzilla(env.BUGZILLA_URL, input.login, input.password);

      const client = new BugzillaClient(env.BUGZILLA_URL, { kind: 'token', token });
      const userResp = await client.get<{ users: unknown[] }>(`/user/${id}`);
      const user = userDetailSchema.parse(userResp.users[0]);
      const permissions = derivePermissions(user.groups);

      const sessionUser: SessionUser = { bzUserId: id, bzToken: token, email: user.email, realName: user.real_name || user.email, permissions };

      // New session id on privilege change, so a pre-login id can't be replayed.
      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => (err ? reject(err) : resolve()));
      });

      req.session.bzUserId = sessionUser.bzUserId;
      req.session.bzToken = sessionUser.bzToken;
      req.session.email = sessionUser.email;
      req.session.realName = sessionUser.realName;
      req.session.permissions = sessionUser.permissions;

      // Persist to the store before replying, so the very next request finds it.
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
      });

      res.json({ user: { id, email: sessionUser.email, realName: sessionUser.realName, permissions } });
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', (req, res, next) => {
    req.session.destroy((err) => {
      if (err) {
        next(err);
        return;
      }
      res.clearCookie(SESSION_COOKIE_NAME, {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.COOKIE_SECURE,
        path: '/',
      });
      res.status(204).end();
    });
  });

  router.get('/me', requireAuth(env), (req, res) => {
    const u = req.sessionUser!;
    res.json({ user: { id: u.bzUserId, email: u.email, realName: u.realName, permissions: u.permissions } });
  });

  return router;
}
