import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../config/env';
import { clearAccessScope } from '../lib/access';
import { BugzillaClient } from '../lib/bugzillaClient';
import { AppError } from '../lib/errors';
import { parseInput } from '../lib/validate';
import { requireAuth, requirePermission } from '../middleware/auth';
import {
  createGroupSchema,
  membershipChangeSchema,
  normalizeGroup,
  normalizeMembers,
  rawGroupSchema,
  updateGroupSchema,
  userSearchQuerySchema,
  type AdminGroupDetail,
} from '../schemas/adminGroup';

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/**
 * Lower-cased names of EVERY product. A product's access group carries the product's name (see
 * lib/productGroups.ts), so this is how a group is recognised as one - Bugzilla's REST API exposes
 * no product -> group control mapping.
 *
 * Read with the service key, not the admin's session: a product gated by a MANDATORY group is
 * invisible to anyone outside that group, admins included, and the rename guard must not switch
 * off just because the person editing cannot see the product. Only the names are used, and only
 * to set a flag on groups this admin can already see.
 */
const PRODUCT_NAMES_TTL_MS = 5 * 60 * 1000;
let productNamesCache: { at: number; names: Set<string> } | null = null;

async function productNames(env: Env): Promise<Set<string>> {
  if (productNamesCache && Date.now() - productNamesCache.at < PRODUCT_NAMES_TTL_MS) return productNamesCache.names;
  const service = new BugzillaClient(env.BUGZILLA_URL, { kind: 'api_key', apiKey: env.BUGZILLA_API_KEY });
  const { ids } = await service.get<{ ids: number[] }>('/product_accessible');
  const resp = ids.length
    ? await service.get<{ products: Array<{ name: string }> }>('/product', { ids, include_fields: 'name' })
    : { products: [] };
  const names = new Set(resp.products.map((p) => p.name.toLowerCase()));
  productNamesCache = { at: Date.now(), names };
  return names;
}

async function fetchGroup(client: BugzillaClient, env: Env, id: number): Promise<AdminGroupDetail> {
  const [resp, products, admins] = await Promise.all([
    client.get<{ groups: unknown[] }>('/group', { ids: id, membership: 1 }),
    productNames(env),
    client.get<{ groups: Array<{ membership?: Array<{ id: number }> }> }>('/group', { names: 'admin', membership: 1 }),
  ]);
  const raw = resp.groups[0];
  if (!raw) throw new AppError(404, 'NOT_FOUND', 'That group could not be found.');
  const parsed = rawGroupSchema.parse(raw);
  const adminIds = new Set((admins.groups[0]?.membership ?? []).map((m) => m.id));
  return { ...normalizeGroup(parsed, products), members: normalizeMembers(parsed, adminIds) };
}

/**
 * Built-in groups (admin, editusers, tweakparams, …) are read-only here: they ARE the permission
 * model, and a slip in one locks people out of administration or hands it to the wrong person.
 * Bugzilla itself would allow editing their description and regexp; this deliberately does not.
 */
function assertEditable(group: AdminGroupDetail): void {
  if (!group.isBugGroup) {
    throw new AppError(
      403,
      'FORBIDDEN',
      `"${group.name}" is a built-in Bugzilla system group and is read-only here. Change it in Bugzilla's native admin if it is truly needed.`
    );
  }
}

export function adminGroupsRouter(env: Env): Router {
  const router = Router();
  // `creategroups` is what Bugzilla checks for Group.create/update; the gate mirrors it so a
  // missing permission is a clean 403 before any upstream call. Bugzilla re-checks every write.
  const gate = [requireAuth(env), requirePermission('canManageGroups')];

  // GET /api/admin/groups
  router.get('/', ...gate, async (req, res, next) => {
    try {
      const client = req.bugzilla!;
      const [resp, products] = await Promise.all([
        // membership=1 for the member counts. ~20 groups on this instance, so one call is cheap.
        client.get<{ groups: unknown[] }>('/group', { membership: 1 }),
        productNames(env),
      ]);
      const groups = resp.groups
        .map((g) => normalizeGroup(rawGroupSchema.parse(g), products))
        .sort((a, b) => Number(b.isBugGroup) - Number(a.isBugGroup) || a.name.localeCompare(b.name));
      res.json({ groups });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/admin/groups/user-search?q=  - the membership picker's source.
  // Registered before /:id so "user-search" is never read as an id.
  router.get('/user-search', ...gate, async (req, res, next) => {
    try {
      const { q } = parseInput(userSearchQuerySchema, req.query);
      const resp = await req.bugzilla!.get<{
        users: Array<{ id: number; email?: string; name: string; real_name?: string; can_login?: boolean }>;
      }>('/user', { match: q, limit: 20, include_fields: 'id,email,name,real_name,can_login' });
      const users = resp.users.map((u) => ({
        id: u.id,
        email: u.email || u.name,
        name: u.real_name || u.email || u.name,
        isEnabled: u.can_login ?? true,
      }));
      res.json({ users });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/admin/groups/:id  - one group with its members.
  router.get('/:id', ...gate, async (req, res, next) => {
    try {
      const { id } = parseInput(idParamSchema, req.params);
      res.json({ group: await fetchGroup(req.bugzilla!, env, id) });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/admin/groups
  router.post('/', ...gate, async (req, res, next) => {
    try {
      const input = parseInput(createGroupSchema, req.body);
      const client = req.bugzilla!;
      // Group.create always makes a bug group (isbuggroup=1); system groups cannot be created.
      const created = await client.post<{ id: number }>('/group', {
        name: input.name,
        description: input.description,
        user_regexp: input.userRegexp ?? '',
        is_active: input.isActive,
      });
      res.status(201).json({ group: await fetchGroup(client, env, created.id) });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/admin/groups/:id
  router.patch('/:id', ...gate, async (req, res, next) => {
    try {
      const { id } = parseInput(idParamSchema, req.params);
      const input = parseInput(updateGroupSchema, req.body);
      const client = req.bugzilla!;
      const current = await fetchGroup(client, env, id);
      assertEditable(current);

      /*
       * A product's access group is found by its NAME (productGroups.ts). Renaming it would leave
       * the product looking ungated to this app - its bugs scoped wrongly and new users granted the
       * wrong group - while Bugzilla, which links by id, carried on. So the rename is refused here,
       * and the other fields stay editable.
       */
      if (input.name !== undefined && input.name !== current.name && current.isProductGroup) {
        throw new AppError(
          400,
          'VALIDATION',
          `"${current.name}" controls access to the product of the same name, so it cannot be renamed. Rename the product and its group together in Bugzilla if needed.`
        );
      }

      const payload: Record<string, string | boolean> = {};
      if (input.name !== undefined && input.name !== current.name) payload.name = input.name;
      if (input.description !== undefined) payload.description = input.description;
      if (input.userRegexp !== undefined) payload.user_regexp = input.userRegexp;
      if (input.isActive !== undefined) payload.is_active = input.isActive;

      if (Object.keys(payload).length > 0) await client.put(`/group/${id}`, payload);

      // A regexp change alters who is a member, and so who can see which product's bugs.
      clearAccessScope();
      res.json({ group: await fetchGroup(client, env, id) });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/admin/groups/:id/members  { add: [userId], remove: [userId] }
  router.post('/:id/members', ...gate, async (req, res, next) => {
    try {
      const { id } = parseInput(idParamSchema, req.params);
      const { add, remove } = parseInput(membershipChangeSchema, req.body);
      const client = req.bugzilla!;
      const current = await fetchGroup(client, env, id);
      assertEditable(current);

      /*
       * Membership lives on the USER in Bugzilla (User.update groups add/remove), and Bugzilla
       * checks the caller may bless this group. One call per user, so one refusal does not undo
       * the others; failures are collected and reported by email.
       */
      const failed: Array<{ userId: number; message: string }> = [];
      await Promise.all(
        [...add.map((u) => ({ u, op: 'add' as const })), ...remove.map((u) => ({ u, op: 'remove' as const }))].map(
          async ({ u, op }) => {
            try {
              await client.put(`/user/${u}`, { groups: { [op]: [current.name] } });
            } catch (err) {
              failed.push({ userId: u, message: err instanceof Error ? err.message : 'Update failed.' });
            }
          }
        )
      );

      clearAccessScope();
      const group = await fetchGroup(client, env, id);

      /*
       * User.update can only remove a DIRECT membership. Someone who matches the group's user
       * regexp, or is in it through another group, stays a member - Bugzilla reports success
       * either way. Re-reading and naming them turns a silent no-op into an explanation.
       */
      const stillMembers = new Set(group.members.map((m) => m.id));
      const notRemoved = remove
        .filter((u) => stillMembers.has(u) && !failed.some((f) => f.userId === u))
        .map((u) => group.members.find((m) => m.id === u)!.email);

      res.json({
        group,
        ...(failed.length ? { failed } : {}),
        ...(notRemoved.length ? { notRemoved } : {}),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
