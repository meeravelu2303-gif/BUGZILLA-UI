import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../config/env';
import { groupsForRole, managedGroups } from '../lib/roles';
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
      const client = req.bugzilla!;
      const term = search?.trim();

      /*
       * With no search term, "everyone" comes from group membership rather than
       * an email-pattern search.
       *
       * `User.get` has no list-everyone call and rejects a punctuation-only
       * match, so this used to fall back to matching logins containing "kpost".
       * That quietly hid every account on another domain - including the
       * instance administrator, on a gmail.com login. Which email a person signs
       * in with is an organisational choice and must not decide whether they
       * appear in the admin list.
       *
       * `editbugs` is the right pool: Bugzilla auto-grants it to every account
       * (user_regexp `.*`), so its membership is literally everyone, disabled
       * accounts included.
       */
      let rawUsers: unknown[];
      if (term) {
        const resp = await client.get<{ users: unknown[] }>('/user', {
          match: term,
          include_disabled: 1,
          groups_membership: 1,
          limit: 500,
        });
        rawUsers = resp.users;
      } else {
        const groupResp = await client.get<{
          groups: Array<{ membership?: Array<{ id?: number }> }>;
        }>('/group', { names: 'editbugs', membership: 1 });
        const ids = (groupResp.groups?.[0]?.membership ?? [])
          .map((m) => m.id)
          .filter((id): id is number => typeof id === 'number');

        // Re-read by id: the group payload omits the group memberships the list
        // needs to show each account's role and product access.
        const resp = ids.length
          ? await client.get<{ users: unknown[] }>('/user', {
              ids,
              include_disabled: 1,
              groups_membership: 1,
            })
          : { users: [] };
        rawUsers = resp.users;
      }

      const users = rawUsers
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

      /*
       * Groups are a SECOND call: Bugzilla's `User.create` accepts only email,
       * name and password, so membership has to be set through `User.update`
       * afterwards. Verified against this instance - PUT /user/<id> with
       * `{groups:{add:[…]}}` returns the applied change.
       *
       * Deliberately not fatal. The account already exists by this point, and
       * failing the whole request would leave a real user created but reported
       * as an error - the caller would try again and hit "account already
       * exists". Instead the account is returned with a note saying which
       * groups did not apply, so the gap is visible and fixable rather than
       * silent.
       */
      let skippedGroups: string[] = [];
      let groupError: string | undefined;

      if (input.role) {
        try {
          const groupsResp = await client.get<{ groups: Array<{ name: string }> }>('/group', {
            // Bugzilla only returns groups the caller may bless; that is exactly
            // the set it would accept in an update, so it doubles as validation.
            membership: 0,
          });
          const available = new Set((groupsResp.groups ?? []).map((g) => g.name));
          const { granted, skipped } = groupsForRole(input.role, input.products ?? [], available);
          skippedGroups = skipped;

          if (granted.length > 0) {
            await client.put(`/user/${created.id}`, { groups: { add: granted } });
          }
        } catch (err) {
          groupError = err instanceof Error ? err.message : 'Group assignment failed.';
        }
      }

      const resp = await client.get<{ users: unknown[] }>(`/user/${created.id}`);
      const user = normalizeAdminUser(rawAdminUserSchema.parse(resp.users[0]));
      res.status(201).json({
        user,
        // Present only when something needs saying, so a clean create stays clean.
        ...(skippedGroups.length > 0 ? { skippedGroups } : {}),
        ...(groupError ? { groupError } : {}),
      });
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

      /*
       * Role and product access, applied as an explicit add/remove diff.
       *
       * Removals are bounded to `managedGroups` - the role groups plus the
       * product groups. Sending the target list as the account's whole
       * membership would strip everything this form does not model: an
       * administrator's `admin`, `creategroups` and `tweakparams`, and the
       * `bz_canusewhines` Bugzilla grants by regexp. Changing someone from
       * tester to developer must move exactly those two axes and nothing else.
       */
      let skippedGroups: string[] = [];
      let groupError: string | undefined;

      if (input.role) {
        try {
          const [groupsResp, current] = await Promise.all([
            client.get<{ groups: Array<{ name: string }> }>('/group', { membership: 0 }),
            client.get<{ users: Array<{ groups?: Array<{ name: string }> }> }>(`/user/${id}`, {
              groups_membership: 1,
            }),
          ]);

          const available = new Set((groupsResp.groups ?? []).map((g) => g.name));
          const held = (current.users[0]?.groups ?? []).map((g) => g.name);

          const products = input.products ?? [];
          const { granted, skipped } = groupsForRole(input.role, products, available);
          skippedGroups = skipped;

          const target = new Set(granted);
          const managed = managedGroups(available, products.concat(held));
          const add = granted.filter((g) => !held.includes(g));
          const remove = held.filter((g) => managed.has(g) && !target.has(g));

          if (add.length > 0 || remove.length > 0) {
            await client.put(`/user/${id}`, { groups: { add, remove } });
          }
        } catch (err) {
          groupError = err instanceof Error ? err.message : 'Role update failed.';
        }
      }

      const resp = await client.get<{ users: unknown[] }>(`/user/${id}`);
      const user = normalizeAdminUser(rawAdminUserSchema.parse(resp.users[0]));
      res.json({
        user,
        // Same contract as create: say what did NOT apply rather than implying
        // the whole change landed.
        ...(skippedGroups.length > 0 ? { skippedGroups } : {}),
        ...(groupError ? { groupError } : {}),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
