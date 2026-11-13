import type { RequestHandler } from 'express';
import { announceDirectoryChange } from '../events/liveUpdates.event';
import { badRequest } from '../helpers/errors.helper';
import { checkUserDeletion, deleteUserViaBugzilla } from '../services/userDelete.service';
import { isServiceAccount } from '../services/productTransfer.service';
import { z } from 'zod';
import { clearAccessScope } from '../services/access.service';
import { clearMemo } from '../helpers/memo.helper';
import { groupsForRole, managedGroups, roleFromGroups, ROLE_LABELS } from '../services/roles.service';
import { randomBytes } from 'node:crypto';
import { parseInput } from '../helpers/validate.helper';
import {
  createUserSchema,
  listUsersQuerySchema,
  normalizeAdminUser,
  rawAdminUserSchema,
  updateUserSchema,
  idParamSchema,
} from '../dto/adminUser.dto';
import { asyncHandler, sendNoContent, sendSuccess } from '../helpers/response.helper';
import { env } from '../config/app.config';
import { assertUserDeletable, directoryReaderFor, sendWelcome } from '../services/adminUsers.service';

export const announceDirectoryChanges: RequestHandler = (req, res, next) => {
  if (req.method !== 'GET')
    res.on('finish', () => {
      if (res.statusCode < 400) announceDirectoryChange();
    });
  next();
};

export const listUsers = asyncHandler(async (req, res) => {
  const { search } = parseInput(listUsersQuerySchema, req.query);
  const client = directoryReaderFor(req);
  const term = search?.trim();

  let rawUsers: unknown[];
  if (term) {
    const response = await client.get<{ users: unknown[] }>('/user', {
      match: term,
      include_disabled: 1,
      groups_membership: 1,
      limit: 500,
    });
    rawUsers = response.users;
  } else {
    const groupResponse = await client.get<{
      groups: Array<{ membership?: Array<{ id?: number }> }>;
    }>('/group', { names: 'editbugs', membership: 1 });
    const ids = (groupResponse.groups?.[0]?.membership ?? [])
      .map((membership) => membership.id)
      .filter((id): id is number => typeof id === 'number');

    const response = ids.length
      ? await client.get<{ users: unknown[] }>('/user', {
          ids,
          include_disabled: 1,
          groups_membership: 1,
        })
      : { users: [] };
    rawUsers = response.users;
  }

  const users = rawUsers
    .map((rawUser) => normalizeAdminUser(rawAdminUserSchema.parse(rawUser)))
    .sort((left, right) => (left.fullName || left.email).localeCompare(right.fullName || right.email));
  sendSuccess(res, { users });
});

export const getUser = asyncHandler(async (req, res) => {
  const { id } = parseInput(idParamSchema, req.params);
  const response = await directoryReaderFor(req).get<{ users: unknown[] }>(`/user/${id}`);
  const user = normalizeAdminUser(rawAdminUserSchema.parse(response.users[0]));
  sendSuccess(res, { user });
});

export const createUser = asyncHandler(async (req, res) => {
  const input = parseInput(createUserSchema, req.body);
  const client = req.bugzilla!;
  if (!input.password && !input.sendWelcome) {
    throw badRequest('Set a password, or send the welcome email so they can set their own.');
  }

  const created = await client.post<{ id: number }>('/user', {
    email: input.email,
    full_name: input.fullName ?? '',
    password: input.password ?? randomBytes(24).toString('base64url'),
  });

  let skippedGroups: string[] = [];
  let groupError: string | undefined;

  if (input.role) {
    try {
      const groupsResponse = await client.get<{ groups: Array<{ name: string }> }>('/group', {
        membership: 0,
      });
      const available = new Set((groupsResponse.groups ?? []).map((group) => group.name));
      const { granted, skipped } = groupsForRole(input.role, input.products ?? [], available);
      skippedGroups = skipped;

      if (granted.length > 0) {
        await client.put(`/user/${created.id}`, { groups: { add: granted } });
      }
    } catch (err) {
      groupError = err instanceof Error ? err.message : 'Group assignment failed.';
    }
  }

  clearAccessScope();
  clearMemo('directory');

  let welcome: { sentTo: string } | { error: string } | undefined;
  if (input.sendWelcome) {
    welcome = await sendWelcome(
      client,
      created.id,
      input.role ? ROLE_LABELS[input.role] : '',
      input.products ?? [],
    ).catch((err: unknown) => ({
      error: err instanceof Error ? err.message : 'The welcome email could not be sent.',
    }));
  }

  const response = await client.get<{ users: unknown[] }>(`/user/${created.id}`);
  const user = normalizeAdminUser(rawAdminUserSchema.parse(response.users[0]));
  sendSuccess(
    res,
    {
      user,
      ...(skippedGroups.length > 0 ? { skippedGroups } : {}),
      ...(groupError ? { groupError } : {}),
      ...(welcome ? { welcome } : {}),
    },
    201,
  );
});

export const sendWelcomeEmail = asyncHandler(async (req, res) => {
  const { id } = parseInput(idParamSchema, req.params);
  const client = req.bugzilla!;
  const response = await client.get<{ users: unknown[] }>(`/user/${id}`);
  const user = normalizeAdminUser(rawAdminUserSchema.parse(response.users[0]));
  if (isServiceAccount(user.email)) {
    throw badRequest('This is a system account; it does not sign in, so it gets no welcome email.');
  }
  sendSuccess(res, { welcome: await sendWelcome(client, id, ROLE_LABELS[roleFromGroups(user.groups)], []) });
});

export const updateUser = asyncHandler(async (req, res) => {
  const { id } = parseInput(idParamSchema, req.params);
  const input = parseInput(updateUserSchema, req.body);
  const client = req.bugzilla!;

  const payload: Record<string, string | boolean> = {};
  if (input.fullName !== undefined) payload.full_name = input.fullName;
  if (input.email !== undefined) payload.email = input.email;
  if (input.emailEnabled !== undefined) payload.disable_mail = !input.emailEnabled;
  if (input.password !== undefined) payload.password = input.password;
  if (input.disabled === true) payload.login_denied_text = input.disabledReason!.trim();
  if (input.disabled === false) payload.login_denied_text = '';

  await client.put(`/user/${id}`, payload);

  let skippedGroups: string[] = [];
  let groupError: string | undefined;

  if (input.role) {
    try {
      const [groupsResponse, current] = await Promise.all([
        client.get<{ groups: Array<{ name: string }> }>('/group', { membership: 0 }),
        client.get<{ users: Array<{ groups?: Array<{ name: string }> }> }>(`/user/${id}`, {
          groups_membership: 1,
        }),
      ]);

      const available = new Set((groupsResponse.groups ?? []).map((group) => group.name));
      const held = (current.users[0]?.groups ?? []).map((group) => group.name);

      const products = input.products ?? [];
      const { granted, skipped } = groupsForRole(input.role, products, available);
      skippedGroups = skipped;

      const target = new Set(granted);
      const managed = managedGroups(available, products.concat(held));
      const add = granted.filter((value) => !held.includes(value));
      const remove = held.filter((value) => managed.has(value) && !target.has(value));

      if (add.length > 0 || remove.length > 0) {
        await client.put(`/user/${id}`, { groups: { add, remove } });
      }
    } catch (err) {
      groupError = err instanceof Error ? err.message : 'Role update failed.';
    }
  }

  clearAccessScope();
  clearMemo('directory');

  const response = await client.get<{ users: unknown[] }>(`/user/${id}`);
  const user = normalizeAdminUser(rawAdminUserSchema.parse(response.users[0]));
  sendSuccess(res, {
    user,
    ...(skippedGroups.length > 0 ? { skippedGroups } : {}),
    ...(groupError ? { groupError } : {}),
  });
});

export const getDeleteCheck = asyncHandler(async (req, res) => {
  const { id } = parseInput(idParamSchema, req.params);
  const response = await directoryReaderFor(req).get<{ users: unknown[] }>(`/user/${id}`);
  const user = normalizeAdminUser(rawAdminUserSchema.parse(response.users[0]));
  try {
    assertUserDeletable(req, id, user.email);
  } catch (err) {
    sendSuccess(res, { deletable: false, blockers: [err instanceof Error ? err.message : 'Cannot be deleted.'] });
    return;
  }
  res.set('Cache-Control', 'no-store').json(await checkUserDeletion(env.BUGZILLA_URL, req.sessionUser!.bzToken, id));
});

export const deleteUser = asyncHandler(async (req, res) => {
  const { id } = parseInput(idParamSchema, req.params);
  const { confirmEmail } = parseInput(z.object({ confirmEmail: z.string().trim().min(1) }), req.body);
  const response = await directoryReaderFor(req).get<{ users: unknown[] }>(`/user/${id}`);
  const user = normalizeAdminUser(rawAdminUserSchema.parse(response.users[0]));
  if (confirmEmail.toLowerCase() !== user.email.toLowerCase()) {
    throw badRequest(`Type the account's email exactly - "${user.email}" - to confirm.`);
  }
  assertUserDeletable(req, id, user.email);
  await deleteUserViaBugzilla(env.BUGZILLA_URL, req.sessionUser!.bzToken, id);
  clearAccessScope();
  clearMemo('directory');
  console.info(`[admin] user ${user.email} (id ${id}) deleted by ${req.sessionUser!.email}`);
  sendNoContent(res);
});
