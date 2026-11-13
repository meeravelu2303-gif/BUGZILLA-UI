import type { z } from 'zod';
import type { updateBugSchema } from '../dto/bug.dto';
import type { BugFeatures } from './bugFeatures.service';
import type { BugzillaClient } from '../clients/bugzilla.client';
import { badRequest, forbidden, conflict } from '../helpers/errors.helper';
import { DELETED_GROUP, DELETED_RESOLUTION } from './softDelete.service';

export type UpdateBugInput = z.infer<typeof updateBugSchema>;

/** The slice of the stored bug every update check needs, fetched once per save. */
export interface CurrentBug {
  id: number;
  last_change_time: string;
  status: string;
  is_open: boolean;
  assigned_to: string;
  product: string;
  component: string;
  cf_subcomponent?: string;
  version: string;
  target_milestone?: string;
  depends_on?: number[];
  blocks?: number[];
  resolution?: string;
}

export const CURRENT_BUG_FIELDS =
  'id,last_change_time,status,is_open,resolution,assigned_to,product,component,cf_subcomponent,version,target_milestone,depends_on,blocks';

const SCALARS: Record<string, string> = {
  summary: 'summary',
  status: 'status',
  resolution: 'resolution',
  priority: 'priority',
  severity: 'severity',
  product: 'product',
  component: 'component',
  version: 'version',
  targetMilestone: 'target_milestone',
  opSys: 'op_sys',
  platform: 'platform',
  assignedTo: 'assigned_to',
  qaContact: 'qa_contact',
  url: 'url',
  whiteboard: 'whiteboard',
  dupeOf: 'dupe_of',
  deadline: 'deadline',
  estimatedTime: 'estimated_time',
  remainingTime: 'remaining_time',
  workTime: 'work_time',
  isCcAccessible: 'is_cc_accessible',
  isCreatorAccessible: 'is_creator_accessible',
  resetAssignedTo: 'reset_assigned_to',
  resetQaContact: 'reset_qa_contact',
};

const LISTS: Record<string, string> = {
  cc: 'cc',
  dependsOn: 'depends_on',
  blocks: 'blocks',
  seeAlso: 'see_also',
  alias: 'alias',
  keywords: 'keywords',
  groups: 'groups',
};

/** Translates a validated update into the body of Bugzilla's PUT /bug/{id}. */
export function toBugzillaUpdate(input: UpdateBugInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const [key, bzKey] of Object.entries(SCALARS)) {
    const value = (input as Record<string, unknown>)[key];
    if (value !== undefined) payload[bzKey] = value;
  }

  for (const [key, bzKey] of Object.entries(LISTS)) {
    const change = (input as Record<string, { add?: unknown[]; remove?: unknown[] } | undefined>)[key];
    if (!change) continue;
    const delta: Record<string, unknown[]> = {};
    if (change.add?.length) delta.add = change.add;
    if (change.remove?.length) delta.remove = change.remove;
    if (Object.keys(delta).length) payload[bzKey] = delta;
  }

  if (input.flags?.length) {
    payload.flags = input.flags.map((flag) => ({
      ...(flag.id !== undefined ? { id: flag.id } : { type_id: flag.typeId }),
      status: flag.status,
      ...(flag.requestee ? { requestee: flag.requestee } : {}),
    }));
  }

  if (input.comment) {
    payload.comment = { body: input.comment.body, is_private: input.comment.isPrivate ?? false };
  }

  return payload;
}

const sameInstant = (left: string, right: string) => Date.parse(left) === Date.parse(right);

/** Checks that need the stored bug, or other bugs, and so cannot live in the Zod schema. */
export const REOPENED = 'REOPENED';

export async function validateBugUpdate(
  client: BugzillaClient,
  current: CurrentBug,
  input: UpdateBugInput,
  features: BugFeatures,
  actor: { canTriage: boolean } = { canTriage: false },
): Promise<void> {
  if (input.status === REOPENED && current.status !== REOPENED) {
    if (!actor.canTriage) {
      throw forbidden(
        'Only testers and admins can reopen a bug. Add a comment saying it still fails, and a tester will reopen it.',
      );
    }
    if (!input.comment?.body.trim()) {
      throw badRequest('Say why you are reopening it - what still fails after the fix - in the comment.');
    }
  }

  if (input.lastChangeTime && !sameInstant(input.lastChangeTime, current.last_change_time)) {
    throw conflict(
      'Someone else changed this bug while you were editing it. Load their changes, then save again - your edits are kept.',
      undefined,
      { reason: 'MID_AIR_COLLISION', lastChangeTime: current.last_change_time },
    );
  }

  const touchesDeletedGroup = [...(input.groups?.add ?? []), ...(input.groups?.remove ?? [])].some(
    (value) => value.toLowerCase() === DELETED_GROUP.toLowerCase(),
  );
  if (input.resolution === DELETED_RESOLUTION || touchesDeletedGroup) {
    throw badRequest('Use Delete or Restore to delete a bug or bring it back.');
  }
  if (current.resolution === DELETED_RESOLUTION) {
    throw conflict('This bug is deleted. Restore it before editing.');
  }

  if (input.qaContact !== undefined && !features.qaContact) {
    throw badRequest('QA contacts are switched off on this Bugzilla.');
  }
  if (input.targetMilestone !== undefined && !features.targetMilestone) {
    throw badRequest('Target milestones are switched off on this Bugzilla.');
  }
  if (input.seeAlso && !features.seeAlso) {
    throw badRequest('"See also" links are switched off on this Bugzilla.');
  }
  if (input.comment?.isPrivate && !features.privateComments) {
    throw badRequest('Private comments are not enabled on this Bugzilla.');
  }

  await validateProductMove(client, current, input, features);
  await validateRelations(client, current, input);

  for (const url of input.seeAlso?.add ?? []) {
    if (!/^https?:\/\//i.test(url) && !/^\d+$/.test(url)) {
      throw badRequest(`"${url}" is not a link. See also takes a full URL, or a bug number on this Bugzilla.`);
    }
  }
}

async function validateProductMove(
  client: BugzillaClient,
  current: CurrentBug,
  input: UpdateBugInput,
  features: BugFeatures,
): Promise<void> {
  if (input.product === undefined || input.product === current.product) return;

  const response = await client
    .get<{
      products: {
        name: string;
        is_active: boolean;
        components: { name: string; is_active: boolean }[];
        versions: { name: string; is_active: boolean }[];
        milestones: { name: string; is_active: boolean }[];
      }[];
    }>('/product', {
      names: input.product,
      include_fields:
        'name,is_active,components.name,components.is_active,versions.name,versions.is_active,milestones.name,milestones.is_active',
    })
    .catch(() => ({ products: [] }));

  const target = response.products[0];
  if (!target || !target.is_active) {
    throw badRequest(`Product "${input.product}" does not exist, is closed for new bugs, or you cannot use it.`);
  }

  const active = (list: { name: string; is_active: boolean }[]) =>
    list.filter((item) => item.is_active).map((item) => item.name);
  const need = (value: string | undefined, allowed: string[], label: string) => {
    if (!value) {
      throw badRequest(`Moving to ${target.name} needs a ${label} from that product.`);
    }
    if (!allowed.includes(value)) {
      throw badRequest(
        `"${value}" is not a ${label} of ${target.name}. Choose one of: ${allowed.slice(0, 8).join(', ')}${allowed.length > 8 ? ', …' : ''}.`,
      );
    }
  };

  need(input.component, active(target.components), 'component');
  need(input.version, active(target.versions), 'version');
  if (features.targetMilestone) need(input.targetMilestone, active(target.milestones), 'milestone');
}

async function validateRelations(client: BugzillaClient, current: CurrentBug, input: UpdateBugInput): Promise<void> {
  const addDeps = input.dependsOn?.add ?? [];
  const addBlocks = input.blocks?.add ?? [];
  const added = [...addDeps, ...addBlocks];
  if (added.length === 0) return;

  if (added.includes(current.id)) {
    throw badRequest('A bug cannot depend on or block itself.');
  }

  const finalDeps = new Set([
    ...(current.depends_on ?? []).filter((value) => !(input.dependsOn?.remove ?? []).includes(value)),
    ...addDeps,
  ]);
  const finalBlocks = new Set([
    ...(current.blocks ?? []).filter((block) => !(input.blocks?.remove ?? []).includes(block)),
    ...addBlocks,
  ]);
  const both = [...finalDeps].filter((finalDependency) => finalBlocks.has(finalDependency));
  if (both.length) {
    throw badRequest(
      `Bug ${both.map((value) => `#${value}`).join(', ')} cannot be both a dependency and blocked by this bug - that is a loop.`,
    );
  }

  const found = await client
    .get<{ bugs: { id: number }[] }>('/bug', { id: [...new Set(added)].join(','), include_fields: 'id', limit: 0 })
    .catch(() => ({ bugs: [] as { id: number }[] }));
  const seen = new Set(found.bugs.map((bug) => bug.id));
  const missing = [...new Set(added)].filter((value) => !seen.has(value));
  if (missing.length) {
    throw badRequest(
      `${missing.map((value) => `Bug ${value}`).join(', ')} ${missing.length === 1 ? 'does' : 'do'} not exist, or you do not have access.`,
    );
  }
}
