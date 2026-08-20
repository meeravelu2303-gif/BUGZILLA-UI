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
  // Bugzilla's User.get requires a match term — it has no "list everyone" call, and — verified
  // against this instance — it returns nothing for a punctuation-only term like "@". So an
  // org-email token (BUGZILLA_USER_MATCH, default "kpost") lists everyone; a real search term
  // narrows it. include_disabled lets the admin see (and re-enable) disabled accounts;
  // groups_membership returns each user's groups so the UI can filter by product access (a
  // product's access is granted through group membership).
  router.get('/', ...gate, async (req, res, next) => {
    try {
      const { search } = parseInput(listUsersQuerySchema, req.query);
      const term = search?.trim() ? search.trim() : process.env.BUGZILLA_USER_MATCH || 'kpost';
      const resp = await req.bugzilla!.get<{ users: unknown[] }>('/user', {
        match: term,
        include_disabled: 1,
        groups_membership: 1,
        limit: 500,
      });
      const users = resp.users
        .map((u) => normalizeAdminUser(rawAdminUserSchema.parse(u)))
        .sort((a, b) => (a.fullName || a.email).localeCompare(b.fullName || b.email));
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
