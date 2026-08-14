import { Router } from 'express';
import type { Env } from '../config/env';
import { loginToBugzilla } from '../lib/bugzillaAuth';
import { BugzillaClient } from '../lib/bugzillaClient';
import { parseInput } from '../lib/validate';
import { loginInputSchema } from '../schemas/auth';
import { derivePermissions, userDetailSchema } from '../schemas/common';
import { requireAuth } from '../middleware/auth';
import type { SessionUser } from '../types/express';

export function authRouter(env: Env): Router {
  const router = Router();

  router.post('/login', async (req, res, next) => {
    try {
      const input = parseInput(loginInputSchema, req.body);
      const { id, token } = await loginToBugzilla(env.BUGZILLA_URL, input.login, input.password);

      const client = new BugzillaClient(env.BUGZILLA_URL, { kind: 'token', token });
      const userResp = await client.get<{ users: unknown[] }>(`/user/${id}`);
      const user = userDetailSchema.parse(userResp.users[0]);
      const permissions = derivePermissions(user.groups);

      const session: SessionUser = { bzUserId: id, bzToken: token, email: user.email, realName: user.real_name || user.email, permissions };
      req.session = session;

      res.json({ user: { id, email: session.email, realName: session.realName, permissions } });
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', (req, res) => {
    req.session = null;
    res.status(204).end();
  });

  router.get('/me', requireAuth(env), (req, res) => {
    const u = req.sessionUser!;
    res.json({ user: { id: u.bzUserId, email: u.email, realName: u.realName, permissions: u.permissions } });
  });

  return router;
}
