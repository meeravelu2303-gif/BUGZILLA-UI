import type { z } from 'zod';
import type { updateBugSchema } from '../schemas/bug';
import type { BugFeatures } from './bugFeatures';
import type { BugzillaClient } from './bugzillaClient';
import { AppError } from './errors';
import { DELETED_GROUP, DELETED_RESOLUTION } from './softDelete';

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
  version: string;
  target_milestone?: string;
  depends_on?: number[];
  blocks?: number[];
  resolution?: string;
}

export const CURRENT_BUG_FIELDS =
  'id,last_change_time,status,is_open,resolution,assigned_to,product,component,version,target_milestone,depends_on,blocks';

/** Scalar fields copied straight across, camelCase -> Bugzilla's update parameter name. */
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

/** add/remove list fields, camelCase -> Bugzilla name. */
const LISTS: Record<string, string> = {
  cc: 'cc',
  dependsOn: 'depends_on',
  blocks: 'blocks',
  seeAlso: 'see_also',
  alias: 'alias',
  keywords: 'keywords',
  groups: 'groups',
};

/**
 * Translates a validated update into the body of Bugzilla's `PUT /bug/{id}`.
 * Pure, so the mapping can be checked without a Bugzilla to talk to.
 */
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
    payload.flags = input.flags.map((f) => ({
      ...(f.id !== undefined ? { id: f.id } : { type_id: f.typeId }),
      status: f.status,
      ...(f.requestee ? { requestee: f.requestee } : {}),
    }));
  }

  if (input.comment) {
    payload.comment = { body: input.comment.body, is_private: input.comment.isPrivate ?? false };
  }

  return payload;
}

const sameInstant = (a: string, b: string) => Date.parse(a) === Date.parse(b);

/**
 * Checks that need the stored bug, or other bugs, and so cannot live in the
 * Zod schema. Each one turns what would be a vague upstream refusal - or worse,
 * a silent wrong result - into a message naming the field to fix.
 */
export async function validateBugUpdate(
  client: BugzillaClient,
  current: CurrentBug,
  input: UpdateBugInput,
  features: BugFeatures
): Promise<void> {
  // Mid-air collision: someone saved this bug after the editor loaded it.
  if (input.lastChangeTime && !sameInstant(input.lastChangeTime, current.last_change_time)) {
    throw new AppError(
      409,
      'CONFLICT',
      'Someone else changed this bug while you were editing it. Load their changes, then save again - your edits are kept.',
      undefined,
      { reason: 'MID_AIR_COLLISION', lastChangeTime: current.last_change_time }
    );
  }

  /*
   * Deleting and restoring go through their own endpoints, which record the
   * previous state and are limited to testers and admins. Reaching the same
   * state through a plain edit would skip both.
   */
  const touchesDeletedGroup = [...(input.groups?.add ?? []), ...(input.groups?.remove ?? [])].some(
    (g) => g.toLowerCase() === DELETED_GROUP.toLowerCase()
  );
  if (input.resolution === DELETED_RESOLUTION || touchesDeletedGroup) {
    throw new AppError(400, 'VALIDATION', 'Use Delete or Restore to delete a bug or bring it back.');
  }
  if (current.resolution === DELETED_RESOLUTION) {
    throw new AppError(409, 'CONFLICT', 'This bug is deleted. Restore it before editing.');
  }

  if (input.qaContact !== undefined && !features.qaContact) {
    throw new AppError(400, 'VALIDATION', 'QA contacts are switched off on this Bugzilla.');
  }
  if (input.targetMilestone !== undefined && !features.targetMilestone) {
    throw new AppError(400, 'VALIDATION', 'Target milestones are switched off on this Bugzilla.');
  }
  if (input.seeAlso && !features.seeAlso) {
    throw new AppError(400, 'VALIDATION', '"See also" links are switched off on this Bugzilla.');
  }
  if (input.comment?.isPrivate && !features.privateComments) {
    throw new AppError(400, 'VALIDATION', 'Private comments are not enabled on this Bugzilla.');
  }

  await validateProductMove(client, current, input, features);
  await validateRelations(client, current, input);

  for (const url of input.seeAlso?.add ?? []) {
    if (!/^https?:\/\//i.test(url) && !/^\d+$/.test(url)) {
      throw new AppError(400, 'VALIDATION', `"${url}" is not a link. See also takes a full URL, or a bug number on this Bugzilla.`);
    }
  }
}

/**
 * Moving to another product: Bugzilla falls back to the bug's CURRENT
 * component and version when none are given, which almost never exist in the
 * new product, and its refusal then names neither. So both are required, and
 * checked against the new product's active values here.
 */
async function validateProductMove(
  client: BugzillaClient,
  current: CurrentBug,
  input: UpdateBugInput,
  features: BugFeatures
): Promise<void> {
  if (input.product === undefined || input.product === current.product) return;

  const resp = await client
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
      include_fields: 'name,is_active,components.name,components.is_active,versions.name,versions.is_active,milestones.name,milestones.is_active',
    })
    .catch(() => ({ products: [] }));

  const target = resp.products[0];
  if (!target || !target.is_active) {
    throw new AppError(400, 'VALIDATION', `Product "${input.product}" does not exist, is closed for new bugs, or you cannot use it.`);
  }

  const active = (list: { name: string; is_active: boolean }[]) => list.filter((v) => v.is_active).map((v) => v.name);
  const need = (value: string | undefined, allowed: string[], label: string) => {
    if (!value) {
      throw new AppError(400, 'VALIDATION', `Moving to ${target.name} needs a ${label} from that product.`);
    }
    if (!allowed.includes(value)) {
      throw new AppError(
        400,
        'VALIDATION',
        `"${value}" is not a ${label} of ${target.name}. Choose one of: ${allowed.slice(0, 8).join(', ')}${allowed.length > 8 ? ', …' : ''}.`
      );
    }
  };

  need(input.component, active(target.components), 'component');
  need(input.version, active(target.versions), 'version');
  if (features.targetMilestone) need(input.targetMilestone, active(target.milestones), 'milestone');
}

/** Dependency edits: no self-references, no bug on both sides, and every bug must be visible. */
async function validateRelations(client: BugzillaClient, current: CurrentBug, input: UpdateBugInput): Promise<void> {
  const addDeps = input.dependsOn?.add ?? [];
  const addBlocks = input.blocks?.add ?? [];
  const added = [...addDeps, ...addBlocks];
  if (added.length === 0) return;

  if (added.includes(current.id)) {
    throw new AppError(400, 'VALIDATION', 'A bug cannot depend on or block itself.');
  }

  const finalDeps = new Set([...(current.depends_on ?? []).filter((d) => !(input.dependsOn?.remove ?? []).includes(d)), ...addDeps]);
  const finalBlocks = new Set([...(current.blocks ?? []).filter((d) => !(input.blocks?.remove ?? []).includes(d)), ...addBlocks]);
  const both = [...finalDeps].filter((d) => finalBlocks.has(d));
  if (both.length) {
    throw new AppError(
      400,
      'VALIDATION',
      `Bug ${both.map((d) => `#${d}`).join(', ')} cannot be both a dependency and blocked by this bug - that is a loop.`
    );
  }

  // On the caller's own token, so a bug they cannot see is reported as missing
  // rather than accepted and leaked through the dependency tree.
  const found = await client
    .get<{ bugs: { id: number }[] }>('/bug', { id: [...new Set(added)].join(','), include_fields: 'id', limit: 0 })
    .catch(() => ({ bugs: [] as { id: number }[] }));
  const seen = new Set(found.bugs.map((b) => b.id));
  const missing = [...new Set(added)].filter((d) => !seen.has(d));
  if (missing.length) {
    throw new AppError(
      400,
      'VALIDATION',
      `${missing.map((d) => `Bug ${d}`).join(', ')} ${missing.length === 1 ? 'does' : 'do'} not exist, or you do not have access.`
    );
  }
}
