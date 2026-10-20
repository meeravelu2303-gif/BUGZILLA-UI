import type { Env } from '../config/env';
import { BugzillaClient } from './bugzillaClient';
import { AppError } from './errors';
import { groupNameForProduct } from './productGroups';
import { DELETED_RESOLUTION } from './softDelete';

/**
 * Cross-product transfer: hand a bug to another team's product without
 * giving the person doing it access to that product.
 *
 * Why the BFF has to do this. Bugzilla 5.2 has no "may move bugs into a
 * product" permission separate from "may see every bug in it":
 *
 *   - Bug::_check_product calls can_enter_product(target), which for these
 *     products means membership of the product's group - and those groups are
 *     Mandatory/Mandatory, so membership also exposes every bug in it.
 *   - The editbugs / canconfirm columns of a product's group controls only ADD
 *     requirements; there is no group setting that grants entry alone.
 *
 * So the move is split along the line between "may this person ask for it"
 * and "who has the rights to carry it out":
 *
 *   USER token     proves the bug is visible to them, that they may hand it on
 *                  (assignee or tester - the same rule as reassigning), and
 *                  posts the explanation under their own name.
 *   SERVICE key    performs only the product/component/version/assignee change,
 *                  and only along a route in PRODUCT_TRANSFER_ROUTES.
 *
 * The user is CC'd (cclist_accessible is on for every bug here), so they can
 * still follow THAT bug after Bugzilla swaps its product group - and nothing
 * else in the target product becomes visible to them. Bugzilla itself removes
 * the old product's group and adds the new one's mandatory group as part of the
 * move (Bug::_set_product), so no group handling is done here.
 */

// ------------------------------------------------------------------ routes

/**
 * `KPost UI<->KPost API; KPost Admin UI<->KPost Admin` - `<->` both ways,
 * `->` one way, separated by `;` or `,`. Case-insensitive, like Bugzilla's
 * own product names.
 */
/** Keyed by the lower-cased source; values keep the spelling written in the config. */
export function parseTransferRoutes(spec: string): Map<string, Set<string>> {
  const routes = new Map<string, Set<string>>();
  const add = (from: string, to: string) => {
    const f = from.trim().toLowerCase();
    const t = to.trim();
    if (!f || !t || f === t.toLowerCase()) return;
    if (!routes.has(f)) routes.set(f, new Set());
    routes.get(f)!.add(t);
  };
  for (const raw of spec.split(/[;,]/)) {
    const rule = raw.trim();
    if (!rule) continue;
    if (rule.includes('<->')) {
      const [a, b] = rule.split('<->');
      add(a, b);
      add(b, a);
    } else if (rule.includes('->')) {
      const [a, b] = rule.split('->');
      add(a, b);
    }
  }
  return routes;
}

export function transferTargetsFor(product: string, routes: Map<string, Set<string>>): string[] {
  return [...(routes.get(product.trim().toLowerCase()) ?? [])];
}

export function isTransferAllowed(from: string, to: string, routes: Map<string, Set<string>>): boolean {
  const want = to.trim().toLowerCase();
  return transferTargetsFor(from, routes).some((t) => t.toLowerCase() === want);
}

/**
 * Accounts that exist to run the BFF, not to work bugs. They are members of
 * every product group (that is how they can move bugs), so without this they
 * would be offered as assignees in every people list. Keep in step with
 * LOGIN in ops/bugzilla/setup-transfer-account.pl.
 */
export const SERVICE_ACCOUNTS = new Set([
  'bugtracker-transfer@kpost.in',
  // Mantis placeholders (ops/migration): kept so old bugs can be credited to them,
  // never a person anyone should assign work to or pick on a dashboard.
  'admin@example.com',
  'mantis-unknown@mantis.invalid',
]);

export function isServiceAccount(email: string | undefined): boolean {
  return !!email && SERVICE_ACCOUNTS.has(email.toLowerCase());
}

/**
 * The elevated WRITE client: performs the move. A dedicated, non-admin
 * account's key when configured.
 */
export function transferClient(env: Env): BugzillaClient {
  return new BugzillaClient(env.BUGZILLA_URL, { kind: 'api_key', apiKey: env.TRANSFER_API_KEY ?? env.BUGZILLA_API_KEY });
}

/**
 * The READ client for the target's directory data (components, versions, team).
 *
 * Not the transfer account, on purpose: Bugzilla's Group.get returns a group's
 * member list only to `editusers`, `creategroups` or someone who can bless that
 * group (WebService/Group.pm _get_group_membership) - exactly the rights the
 * transfer account must not have. The service key already reads this same
 * list for the assignee picker (routes/meta.ts), so nothing new is exposed by
 * using it here, and the account that can WRITE stays narrow.
 */
export function directoryClient(env: Env): BugzillaClient {
  return new BugzillaClient(env.BUGZILLA_URL, { kind: 'api_key', apiKey: env.BUGZILLA_API_KEY });
}

// ------------------------------------------------------------- the bug itself

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

/**
 * Loads the bug on the USER's token and checks they may hand it on.
 *
 * A bug they cannot see comes back as not found - the same answer as a bug
 * that does not exist, so this cannot be used to probe other products.
 */
export async function loadTransferableBug(
  userClient: BugzillaClient,
  id: number,
  actor: { email: string; canTriage: boolean }
): Promise<TransferableBug> {
  const resp = await userClient
    .get<{ bugs: TransferableBug[] }>(`/bug/${id}`, {
      include_fields: 'id,product,component,status,is_open,resolution,assigned_to,last_change_time',
    })
    .catch((err: unknown) => {
      if (err instanceof AppError && (err.status === 404 || err.status === 403)) return { bugs: [] };
      throw err;
    });
  const bug = resp.bugs[0];
  if (!bug) throw new AppError(404, 'NOT_FOUND', 'That bug could not be found.');

  if (bug.resolution === DELETED_RESOLUTION) {
    throw new AppError(409, 'CONFLICT', 'This bug is deleted. Restore it before transferring it.');
  }
  if (!bug.is_open) {
    throw new AppError(409, 'CONFLICT', `Bug #${id} is ${bug.status}. Reopen it before transferring it to another team.`);
  }
  // Same rule as reassigning (routes/bugs.ts assertReassignable): the assignee
  // hands their own work on; testers and admins may move anyone's.
  if (!actor.canTriage && bug.assigned_to.toLowerCase() !== actor.email.toLowerCase()) {
    throw new AppError(403, 'FORBIDDEN', 'Only the current assignee, or a tester, can transfer this bug to another team.');
  }
  return bug;
}

// ------------------------------------------------------------ target product

export interface TransferTarget {
  product: string;
  components: { name: string; defaultAssignee: string; defaultAssigneeName: string }[];
  versions: string[];
  defaultMilestone: string | null;
  /** People who can work bugs in the target product - its group's members. */
  people: { email: string; name: string }[];
}

interface RawProduct {
  name: string;
  is_active: boolean;
  default_milestone?: string;
  components: { name: string; is_active: boolean; default_assigned_to: string }[];
  versions: { name: string; is_active: boolean }[];
}

/**
 * What a transfer form needs about one target product, read on the SERVICE
 * key - the user cannot read it themselves, which is the point.
 *
 * Deliberately only directory data: component names, version names and the
 * names of the people on that team. No bugs, counts, summaries or anything
 * else about the product's contents.
 */
export async function describeTarget(service: BugzillaClient, product: string): Promise<TransferTarget | null> {
  const [productResp, groupsResp] = await Promise.all([
    service.get<{ products: RawProduct[] }>('/product', {
      names: product,
      include_fields:
        'name,is_active,default_milestone,components.name,components.is_active,components.default_assigned_to,versions.name,versions.is_active',
    }),
    service.get<{ groups: { name: string }[] }>('/group', { membership: 0 }),
  ]);
  const raw = productResp.products?.[0];
  if (!raw || !raw.is_active) return null;

  const gate = groupNameForProduct(raw.name, (groupsResp.groups ?? []).map((g) => g.name));
  const poolGroup = gate ?? 'editbugs';
  const members = await service.get<{
    groups: { membership?: { email?: string; real_name?: string; name?: string; can_login?: boolean }[] }[];
  }>('/group', { names: poolGroup, membership: 1 });

  const people = new Map<string, { email: string; name: string }>();
  for (const m of members.groups?.[0]?.membership ?? []) {
    if (!m.email || m.can_login === false || isServiceAccount(m.email)) continue;
    people.set(m.email.toLowerCase(), { email: m.email, name: m.real_name || m.name || m.email });
  }
  const nameOf = (email: string) => people.get(email.toLowerCase())?.name ?? email;

  return {
    product: raw.name,
    components: raw.components
      .filter((c) => c.is_active)
      .map((c) => ({ name: c.name, defaultAssignee: c.default_assigned_to, defaultAssigneeName: nameOf(c.default_assigned_to) })),
    versions: raw.versions.filter((v) => v.is_active).map((v) => v.name),
    defaultMilestone: raw.default_milestone ?? null,
    people: [...people.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// --------------------------------------------------------------- the transfer

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
  /** The person who asked can still open the bug, through CC. */
  ccAdded: string;
}

export async function transferBug(opts: {
  env: Env;
  userClient: BugzillaClient;
  actor: { email: string; realName: string; canTriage: boolean };
  id: number;
  request: TransferRequest;
  routes: Map<string, Set<string>>;
  useTargetMilestone: boolean;
}): Promise<TransferResult> {
  const { env, userClient, actor, id, request, routes } = opts;

  // 1. On the user's own token: visible to them, open, theirs to hand on.
  const bug = await loadTransferableBug(userClient, id, actor);

  // 2. Only along a configured route.
  if (!isTransferAllowed(bug.product, request.product, routes)) {
    throw new AppError(403, 'FORBIDDEN', `Bugs in ${bug.product} cannot be transferred to ${request.product}.`);
  }

  // 3. Resolve the target (directory key) and check every value against it.
  const service = transferClient(env);
  const target = await describeTarget(directoryClient(env), request.product);
  if (!target) throw new AppError(400, 'VALIDATION', `${request.product} is not open for new bugs.`);

  const component = target.components.find((c) => c.name.toLowerCase() === request.component.trim().toLowerCase());
  if (!component) {
    throw new AppError(400, 'VALIDATION', `"${request.component}" is not a component of ${target.product}.`);
  }

  let version = request.version?.trim();
  if (!version) {
    if (target.versions.length !== 1) {
      throw new AppError(400, 'VALIDATION', `Choose a version of ${target.product}: ${target.versions.join(', ')}.`);
    }
    version = target.versions[0];
  } else if (!target.versions.includes(version)) {
    throw new AppError(400, 'VALIDATION', `"${version}" is not a version of ${target.product}.`);
  }

  // An explicit assignee must be someone who can actually work bugs there.
  let assignee = component.defaultAssignee;
  if (request.assignee?.trim()) {
    const chosen = target.people.find((p) => p.email.toLowerCase() === request.assignee!.trim().toLowerCase());
    if (!chosen) {
      throw new AppError(400, 'VALIDATION', `${request.assignee} is not on the ${target.product} team, so they could not work the bug there.`);
    }
    assignee = chosen.email;
  }

  // 4. The move, on the service key. Bugzilla swaps the product groups itself.
  const update: Record<string, unknown> = {
    product: target.product,
    component: component.name,
    version,
    assigned_to: assignee,
    cc: { add: [actor.email] },
    is_cc_accessible: true,
  };
  if (opts.useTargetMilestone && target.defaultMilestone) update.target_milestone = target.defaultMilestone;
  await service.put(`/bug/${id}`, update);

  // 5. The explanation, under the requester's own name. They can still comment:
  //    they are on the CC list now, and CC members may see the bug.
  const assigneeName = target.people.find((p) => p.email.toLowerCase() === assignee.toLowerCase())?.name ?? assignee;
  const body = [
    `Transferred from ${bug.product} / ${bug.component} to ${target.product} / ${component.name}, assigned to ${assigneeName}.`,
    '',
    `Reason: ${request.reason.trim()}`,
  ].join('\n');
  try {
    await userClient.post(`/bug/${id}/comment`, { comment: body });
  } catch {
    // The move happened; the record of why must not be lost with it.
    await service
      .post(`/bug/${id}/comment`, { comment: `${body}\n\n(Requested by ${actor.realName || actor.email} <${actor.email}> via the Bug Tracker.)` })
      .catch(() => undefined);
  }

  console.info(
    `[transfer] bug ${id}: ${bug.product}/${bug.component} -> ${target.product}/${component.name}, assignee ${assignee}, requested by ${actor.email}`
  );
  return { id, product: target.product, component: component.name, assignee, ccAdded: actor.email };
}
