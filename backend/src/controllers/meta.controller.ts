import { accessSnapshot } from '../services/access.service';
import { bugFeatures, bugzillaPublicUrl } from '../services/bugFeatures.service';
import { groupNameForProduct } from '../services/productGroups.service';
import { isServiceAccount } from '../services/productTransfer.service';
import { extractBugMeta } from '../dto/meta.dto';
import { asyncHandler, sendSuccess } from '../helpers/response.helper';
import { env } from '../config/app.config';
import { bugReporters, fieldDefinitions, memoizedDirectory } from '../services/meta.service';
import { transferRoutes } from '../services/bugTransfer.service';

export const getMeta = asyncHandler(async (req, res) => {
  const [raw, features, bugzillaWebUrl] = await Promise.all([
    fieldDefinitions(req.bugzilla!),
    bugFeatures(env),
    bugzillaPublicUrl(env),
  ]);
  const fieldMeta = extractBugMeta(raw);
  sendSuccess(res, {
    ...fieldMeta,
    features,
    currentUser: req.sessionUser!.email,
    bugzillaWebUrl,
    transferRoutes: Object.fromEntries([...transferRoutes].map(([from, to]) => [from, [...to]])),
  });
});

export const getAssignableUsers = asyncHandler(async (req, res) => {
  const rawProduct = req.query.product;
  const products = (Array.isArray(rawProduct) ? rawProduct : [rawProduct])
    .filter((item) => typeof item === 'string')
    .map((value) => String(value).trim())
    .filter(Boolean);

  const directory = memoizedDirectory(env);

  const allGroups = await directory.get<{ groups: Array<{ name: string }> }>('/group', {
    membership: 0,
  });
  const available = new Set((allGroups.groups ?? []).map((group) => group.name));

  const gating = products
    .map((product) => groupNameForProduct(product, available))
    .filter((value): value is string => value !== undefined);
  const poolNames = gating.length > 0 ? gating : ['editbugs'];

  const [response, roleResponse] = await Promise.all([
    directory.get<{
      groups: Array<{
        name: string;
        membership?: Array<{ email?: string; real_name?: string; name?: string; can_login?: boolean }>;
      }>;
    }>('/group', { names: poolNames, membership: 1 }),
    directory.get<{
      groups: Array<{ name: string; membership?: Array<{ email?: string }> }>;
    }>('/group', { names: ['canconfirm', 'editusers', 'editcomponents', 'reporter'], membership: 1 }),
  ]);

  const membersOf = (group: string) =>
    new Set(
      (roleResponse.groups ?? [])
        .find((candidate) => candidate.name.toLowerCase() === group)
        ?.membership?.map((membership) => (membership.email ?? '').toLowerCase())
        .filter(Boolean) ?? [],
    );

  const canConfirm = membersOf('canconfirm');
  const admins = new Set([...membersOf('editusers'), ...membersOf('editcomponents')]);
  const strictTesters = new Set([...canConfirm].filter((email) => !admins.has(email)));
  const reporters = membersOf('reporter');

  const owners = new Set<string>();
  try {
    const snapshot = await accessSnapshot(req.bugzilla!, req.sessionUser!.bzUserId);
    const wanted = new Set(products.map((product) => product.toLowerCase()));
    for (const product of snapshot.products) {
      if (wanted.size > 0 && !wanted.has(product.name.toLowerCase())) continue;
      const components = (product as { components?: Array<{ default_assigned_to?: string }> }).components ?? [];
      for (const component of components) {
        if (component.default_assigned_to) owners.add(component.default_assigned_to.toLowerCase());
      }
    }
  } catch {}

  let pool: Map<string, { email: string; name: string }> | null = null;
  for (const group of response.groups ?? []) {
    const members = new Map<string, { email: string; name: string }>();
    for (const member of group.membership ?? []) {
      if (!member.email || member.can_login === false || isServiceAccount(member.email)) continue;
      members.set(member.email.toLowerCase(), {
        email: member.email,
        name: member.real_name || member.name || member.email,
      });
    }
    if (pool === null) pool = members;
    else for (const key of [...pool.keys()]) if (!members.has(key)) pool.delete(key);
  }

  const me = req.sessionUser!.email.toLowerCase();
  const everyone = req.query.scope === 'all';
  const users = [...(pool?.values() ?? [])]
    .filter((item) => {
      if (everyone) return true;
      const email = item.email.toLowerCase();
      if (email === me) return false;
      return (!strictTesters.has(email) && !reporters.has(email)) || owners.has(email);
    })
    .sort((left, right) => {
      const leftOwnerRank = owners.has(left.email.toLowerCase()) ? 0 : 1;
      const rightOwnerRank = owners.has(right.email.toLowerCase()) ? 0 : 1;
      return leftOwnerRank !== rightOwnerRank ? leftOwnerRank - rightOwnerRank : left.name.localeCompare(right.name);
    });

  sendSuccess(res, {
    users: users.map((user) => ({
      ...user,
      role: admins.has(user.email.toLowerCase())
        ? ('admin' as const)
        : strictTesters.has(user.email.toLowerCase())
          ? ('tester' as const)
          : reporters.has(user.email.toLowerCase())
            ? ('reporter' as const)
            : ('developer' as const),
    })),
    owners: users.filter((user) => owners.has(user.email.toLowerCase())).map((user) => user.email),
  });
});

export const getReporters = asyncHandler(async (_req, res) => {
  const directory = memoizedDirectory(env);
  const response = await directory.get<{
    groups: Array<{
      name: string;
      membership?: Array<{ email?: string; real_name?: string; name?: string; can_login?: boolean }>;
    }>;
  }>('/group', { names: ['canconfirm', 'editusers', 'editcomponents', 'reporter'], membership: 1 });

  const RANK = { admin: 3, tester: 2, reporter: 1, developer: 0 } as const;
  const people = new Map<
    string,
    { email: string; name: string; role: 'admin' | 'tester' | 'reporter' | 'developer' }
  >();
  for (const group of response.groups ?? []) {
    const normalizedName = group.name.toLowerCase();
    const groupRole = normalizedName === 'canconfirm' ? 'tester' : normalizedName === 'reporter' ? 'reporter' : 'admin';
    for (const member of group.membership ?? []) {
      if (!member.email || member.can_login === false || isServiceAccount(member.email)) continue;
      const key = member.email.toLowerCase();
      const existing = people.get(key);
      const role = existing && RANK[existing.role] > RANK[groupRole] ? existing.role : groupRole;
      people.set(key, { email: member.email, name: member.real_name || member.name || member.email, role });
    }
  }
  const filers = await bugReporters(env);
  for (const [key, who] of filers) {
    if (people.has(key) || isServiceAccount(who.email)) continue;
    people.set(key, { ...who, role: 'developer' });
  }
  sendSuccess(res, { users: [...people.values()].sort((left, right) => left.name.localeCompare(right.name)) });
});
