import type { Env } from '../config/app.config';
import { memo } from '../helpers/memo.helper';
import { BugzillaClient } from '../clients/bugzilla.client';
import { AppError, badRequest, forbidden, notFound, conflict } from '../helpers/errors.helper';
import { groupNameForProduct } from './productGroups.service';
import { DELETED_RESOLUTION } from './softDelete.service';

/** Cross-product transfer: hand a bug to another team's product without giving the person doing it. */
export function parseTransferRoutes(spec: string): Map<string, Set<string>> {
  const routes = new Map<string, Set<string>>();
  const add = (from: string, to: string) => {
    const normalizedFrom = from.trim().toLowerCase();
    const normalizedTo = to.trim();
    if (!normalizedFrom || !normalizedTo || normalizedFrom === normalizedTo.toLowerCase()) return;
    if (!routes.has(normalizedFrom)) routes.set(normalizedFrom, new Set());
    routes.get(normalizedFrom)!.add(normalizedTo);
  };
  for (const raw of spec.split(/[;,]/)) {
    const rule = raw.trim();
    if (!rule) continue;
    if (rule.includes('<->')) {
      const [left, right] = rule.split('<->');
      add(left, right);
      add(right, left);
    } else if (rule.includes('->')) {
      const [source, destination] = rule.split('->');
      add(source, destination);
    }
  }
  return routes;
}

export function transferTargetsFor(product: string, routes: Map<string, Set<string>>): string[] {
  return [...(routes.get(product.trim().toLowerCase()) ?? [])];
}

export function isTransferAllowed(from: string, to: string, routes: Map<string, Set<string>>): boolean {
  const want = to.trim().toLowerCase();
  return transferTargetsFor(from, routes).some((value) => value.toLowerCase() === want);
}

/** Accounts that exist to run the BFF, not to work bugs. */
export const SERVICE_ACCOUNTS = new Set([
  'bugtracker-transfer@kpost.in',
  'admin@example.com',
  'mantis-unknown@mantis.invalid',
]);

export function isServiceAccount(email: string | undefined): boolean {
  return !!email && SERVICE_ACCOUNTS.has(email.toLowerCase());
}

/** The elevated WRITE client: performs the move. */
export function transferClient(env: Env): BugzillaClient {
  return new BugzillaClient(env.BUGZILLA_URL, {
    kind: 'api_key',
    apiKey: env.TRANSFER_API_KEY ?? env.BUGZILLA_API_KEY,
  });
}

/** The READ client for the target's directory data (components, versions, team). */
export function directoryClient(env: Env): BugzillaClient {
  return new BugzillaClient(env.BUGZILLA_URL, { kind: 'api_key', apiKey: env.BUGZILLA_API_KEY });
}

/** ------------------------------------------------------------- the bug itself. */
export interface TransferableBug {
  id: number;
  product: string;
  component: string;
  status: string;
  is_open: boolean;
  resolution?: string;
  assigned_to: string;
  last_change_time: string;
}

/** Loads the bug on the USER's token and checks they may hand it on. */
export async function loadTransferableBug(
  userClient: BugzillaClient,
  id: number,
  actor: { email: string; canTriage: boolean },
): Promise<TransferableBug> {
  const response = await userClient
    .get<{ bugs: TransferableBug[] }>(`/bug/${id}`, {
      include_fields: 'id,product,component,status,is_open,resolution,assigned_to,last_change_time',
    })
    .catch((err: unknown) => {
      if (err instanceof AppError && (err.status === 404 || err.status === 403)) return { bugs: [] };
      throw err;
    });
  const bug = response.bugs[0];
  if (!bug) throw notFound('That bug could not be found.');

  if (bug.resolution === DELETED_RESOLUTION) {
    throw conflict('This bug is deleted. Restore it before transferring it.');
  }
  if (!bug.is_open) {
    throw conflict(`Bug #${id} is ${bug.status}. Reopen it before transferring it to another team.`);
  }
  if (!actor.canTriage && bug.assigned_to.toLowerCase() !== actor.email.toLowerCase()) {
    throw forbidden('Only the current assignee, or a tester, can transfer this bug to another team.');
  }
  return bug;
}

/** ------------------------------------------------------------ target product. */
export interface TransferTarget {
  product: string;
  components: { name: string; defaultAssignee: string; defaultAssigneeName: string }[];
  versions: string[];
  defaultMilestone: string | null;
  people: { email: string; name: string }[];
}

interface RawProduct {
  name: string;
  is_active: boolean;
  default_milestone?: string;
  components: { name: string; is_active: boolean; default_assigned_to: string }[];
  versions: { name: string; is_active: boolean }[];
}

/** What a transfer form needs about one target product. */
export async function describeTarget(service: BugzillaClient, product: string): Promise<TransferTarget | null> {
  return (await describeTargets(service, [product]))[0] ?? null;
}

/** The same, for several products at once - three Bugzilla calls however many there are (the products. */
export async function describeTargets(service: BugzillaClient, products: string[]): Promise<TransferTarget[]> {
  if (products.length === 0) return [];
  const [productResponse, groupsResponse] = await Promise.all([
    service.get<{ products: RawProduct[] }>('/product', {
      names: products,
      include_fields:
        'name,is_active,default_milestone,components.name,components.is_active,components.default_assigned_to,versions.name,versions.is_active',
    }),
    service.get<{ groups: { name: string }[] }>('/group', { membership: 0 }),
  ]);
  const raws = (productResponse.products ?? []).filter(
    (product) => product.is_active && product.components.some((component) => component.is_active),
  );
  if (raws.length === 0) return [];

  const groupNames = (groupsResponse.groups ?? []).map((group) => group.name);
  const poolOf = new Map(raws.map((raw) => [raw.name, groupNameForProduct(raw.name, groupNames) ?? 'editbugs']));
  const members = await service.get<{
    groups: {
      name: string;
      membership?: { email?: string; real_name?: string; name?: string; can_login?: boolean }[];
    }[];
  }>('/group', { names: [...new Set(poolOf.values())], membership: 1 });
  const membersOf = new Map((members.groups ?? []).map((group) => [group.name.toLowerCase(), group.membership ?? []]));

  return raws
    .map((raw) => {
      const people = new Map<string, { email: string; name: string }>();
      for (const member of membersOf.get(poolOf.get(raw.name)!.toLowerCase()) ?? []) {
        if (!member.email || member.can_login === false || isServiceAccount(member.email)) continue;
        people.set(member.email.toLowerCase(), {
          email: member.email,
          name: member.real_name || member.name || member.email,
        });
      }
      const nameOf = (email: string) => people.get(email.toLowerCase())?.name ?? email;
      return {
        product: raw.name,
        components: raw.components
          .filter((component) => component.is_active)
          .map((component) => ({
            name: component.name,
            defaultAssignee: component.default_assigned_to,
            defaultAssigneeName: nameOf(component.default_assigned_to),
          })),
        versions: raw.versions.filter((version) => version.is_active).map((version) => version.name),
        defaultMilestone: raw.default_milestone ?? null,
        people: [...people.values()].sort((left, right) => left.name.localeCompare(right.name)),
      };
    })
    .sort((left, right) => left.product.localeCompare(right.product));
}

/** Every active product - the transfer destinations. */
export async function allProductNames(env: Env): Promise<string[]> {
  return memo('transfer-products', 'all', 5 * 60 * 1000, async () => {
    const service = directoryClient(env);
    const accessible = await service.get<{ ids: number[] }>('/product_accessible');
    if (!accessible.ids?.length) return [];
    const response = await service.get<{ products: { name: string; is_active: boolean }[] }>('/product', {
      ids: accessible.ids,
      include_fields: 'name,is_active',
    });
    return (response.products ?? []).filter((product) => product.is_active).map((product) => product.name);
  });
}

/** --------------------------------------------------------------- the transfer. */
export interface TransferRequest {
  product: string;
  component: string;
  version?: string;
  assignee?: string;
  reason: string;
}

export interface TransferResult {
  id: number;
  product: string;
  component: string;
  assignee: string;
  ccAdded: string;
}

export async function transferBug(options: {
  env: Env;
  userClient: BugzillaClient;
  actor: { email: string; realName: string; canTriage: boolean };
  id: number;
  request: TransferRequest;
  routes: Map<string, Set<string>>;
  accessibleProducts?: string[];
  useTargetMilestone: boolean;
}): Promise<TransferResult> {
  const { env, userClient, actor, id, request, routes } = options;

  const bug = await loadTransferableBug(userClient, id, actor);

  const want = request.product.trim().toLowerCase();
  const ownProduct =
    (options.accessibleProducts ?? []).some((accessibleProduct) => accessibleProduct.toLowerCase() === want) &&
    want !== bug.product.toLowerCase();
  if (!ownProduct && !isTransferAllowed(bug.product, request.product, routes)) {
    throw forbidden(`Bugs in ${bug.product} cannot be transferred to ${request.product}.`);
  }

  const service = transferClient(env);
  const target = await describeTarget(directoryClient(env), request.product);
  if (!target) throw badRequest(`${request.product} is not open for new bugs.`);

  const component = target.components.find(
    (candidate) => candidate.name.toLowerCase() === request.component.trim().toLowerCase(),
  );
  if (!component) {
    throw badRequest(`"${request.component}" is not a component of ${target.product}.`);
  }

  let version = request.version?.trim();
  if (!version) {
    if (target.versions.length !== 1) {
      throw badRequest(`Choose a version of ${target.product}: ${target.versions.join(', ')}.`);
    }
    version = target.versions[0];
  } else if (!target.versions.includes(version)) {
    throw badRequest(`"${version}" is not a version of ${target.product}.`);
  }

  let assignee = component.defaultAssignee;
  if (request.assignee?.trim()) {
    const chosen = target.people.find(
      (person) => person.email.toLowerCase() === request.assignee!.trim().toLowerCase(),
    );
    if (!chosen) {
      throw badRequest(
        `${request.assignee} is not on the ${target.product} team, so they could not work the bug there.`,
      );
    }
    assignee = chosen.email;
  }

  const update: Record<string, unknown> = {
    product: target.product,
    component: component.name,
    version,
    assigned_to: assignee,
    cf_subcomponent: '---',
    cc: { add: [actor.email] },
    is_cc_accessible: true,
  };
  if (options.useTargetMilestone && target.defaultMilestone) update.target_milestone = target.defaultMilestone;
  await service.put(`/bug/${id}`, update);

  const assigneeName =
    target.people.find((person) => person.email.toLowerCase() === assignee.toLowerCase())?.name ?? assignee;
  const body = [
    `Transferred from ${bug.product} / ${bug.component} to ${target.product} / ${component.name}, assigned to ${assigneeName}.`,
    '',
    `Reason: ${request.reason.trim()}`,
  ].join('\n');
  try {
    await userClient.post(`/bug/${id}/comment`, { comment: body });
  } catch {
    await service
      .post(`/bug/${id}/comment`, {
        comment: `${body}\n\n(Requested by ${actor.realName || actor.email} <${actor.email}> via the Bug Tracker.)`,
      })
      .catch(() => undefined);
  }

  console.info(
    `[transfer] bug ${id}: ${bug.product}/${bug.component} -> ${target.product}/${component.name}, assignee ${assignee}, requested by ${actor.email}`,
  );
  return { id, product: target.product, component: component.name, assignee, ccAdded: actor.email };
}
