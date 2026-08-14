import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../config/env';
import { requireAuth, requirePermission } from '../middleware/auth';
import { parseInput } from '../lib/validate';
import { createUserSchema, listUsersQuerySchema, normalizeAdminUser, rawAdminUserSchema, updateUserSchema } from '../schemas/adminUser';

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export function adminUsersRouter(env: Env): Router {
  const router = Router();
  const gate = [requireAuth(env), requirePermission('canManageUsers')];

  // GET /api/admin/users?search=
  router.get('/', ...gate, async (req, res, next) => {
    try {
      const { search } = parseInput(listUsersQuerySchema, req.query);
      const resp = await req.bugzilla!.get<{ users: unknown[] }>('/user', { match: search });
      const users = resp.users.map((u) => normalizeAdminUser(rawAdminUserSchema.parse(u)));
      res.json({ users });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/admin/users/:id
  router.get('/:id', ...gate, async (req, res, next) => {
    try {
      const { id } = parseInput(idParamSchema, req.params);
      const resp = await req.bugzilla!.get<{ users: unknown[] }>(`/user/${id}`);
      const user = normalizeAdminUser(rawAdminUserSchema.parse(resp.users[0]));
      res.json({ user });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/admin/users
  router.post('/', ...gate, async (req, res, next) => {
    try {
      const input = parseInput(createUserSchema, req.body);
      const client = req.bugzilla!;

      const created = await client.post<{ id: number }>('/user', {
        email: input.email,
        full_name: input.fullName ?? '',
        password: input.password,
      });

      const resp = await client.get<{ users: unknown[] }>(`/user/${created.id}`);
      const user = normalizeAdminUser(rawAdminUserSchema.parse(resp.users[0]));
      res.status(201).json({ user });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/admin/users/:id
  router.patch('/:id', ...gate, async (req, res, next) => {
    try {
      const { id } = parseInput(idParamSchema, req.params);
      const input = parseInput(updateUserSchema, req.body);
      const client = req.bugzilla!;

      const payload: Record<string, string> = {};
      if (input.fullName !== undefined) payload.full_name = input.fullName;
      if (input.password !== undefined) payload.password = input.password;
      if (input.disabled === true) payload.login_denied_text = input.disabledReason!.trim();
      if (input.disabled === false) payload.login_denied_text = '';

      await client.put(`/user/${id}`, payload);

      const resp = await client.get<{ users: unknown[] }>(`/user/${id}`);
      const user = normalizeAdminUser(rawAdminUserSchema.parse(resp.users[0]));
      res.json({ user });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
