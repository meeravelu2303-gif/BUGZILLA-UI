import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Bug, BugMeta, ListChange, Product, UpdateBugInput } from '../types';

/** Everything editable on a bug, as the form holds it. */
export interface BugDraft {
  summary: string;
  status: string;
  resolution: string;
  dupeOf: string;
  priority: string;
  severity: string;
  product: string;
  component: string;
  subcomponent: string;
  version: string;
  targetMilestone: string;
  opSys: string;
  platform: string;
  assignedTo: string;
  resetAssignedTo: boolean;
  qaContact: string;
  resetQaContact: boolean;
  cc: string[];
  dependsOn: number[];
  blocks: number[];
  seeAlso: string[];
  url: string;
  alias: string[];
  keywords: string[];
  groups: string[];
  deadline: string;
  estimatedTime: string;
  remainingTime: string;
  workTime: string;
  isCcAccessible: boolean;
  isCreatorAccessible: boolean;
  whiteboard: string;
  flags: Record<number, string>;
}

export type DraftKey = keyof BugDraft;

export const FIELD_LABELS: Record<DraftKey, string> = {
  summary: 'Summary',
  status: 'Status',
  resolution: 'Resolution',
  dupeOf: 'Duplicate of',
  priority: 'Priority',
  severity: 'Severity',
  product: 'Product',
  component: 'Component',
  subcomponent: 'Sub-component',
  version: 'Version',
  targetMilestone: 'Milestone',
  opSys: 'OS',
  platform: 'Platform',
  assignedTo: 'Assignee',
  resetAssignedTo: 'Assignee',
  qaContact: 'QA contact',
  resetQaContact: 'QA contact',
  cc: 'CC',
  dependsOn: 'Depends on',
  blocks: 'Blocks',
  seeAlso: 'See also',
  url: 'URL',
  alias: 'Alias',
  keywords: 'Keywords',
  groups: 'Visibility',
  deadline: 'Deadline',
  estimatedTime: 'Estimate',
  remainingTime: 'Remaining',
  workTime: 'Hours worked',
  isCcAccessible: 'CC access',
  isCreatorAccessible: 'Reporter access',
  whiteboard: 'Whiteboard',
  flags: 'Flags',
};

/** Fallback until Bugzilla's workflow has loaded; the live list comes from meta (is_open per status). */
export const OPEN_STATUSES = new Set([
  'UNCONFIRMED',
  'CONFIRMED',
  'PENDING_APPROVAL',
  'AWAITING_REQUIREMENT',
  'IN_PROGRESS',
  'IN_REVIEW',
  'REOPENED',
]);

const LIST_KEYS = ['cc', 'dependsOn', 'blocks', 'seeAlso', 'alias', 'keywords', 'groups'] as const;
type ListKey = (typeof LIST_KEYS)[number];

const hoursText = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, ''));

export function toDraft(bug: Bug): BugDraft {
  return {
    summary: bug.summary,
    status: bug.status,
    resolution: bug.resolution,
    dupeOf: bug.dupeOf === null ? '' : String(bug.dupeOf),
    priority: bug.priority,
    severity: bug.severity,
    product: bug.product,
    component: bug.component,
    subcomponent: bug.subcomponent && bug.subcomponent !== '---' ? bug.subcomponent : '',
    version: bug.version,
    targetMilestone: bug.targetMilestone,
    opSys: bug.opSys,
    platform: bug.platform,
    assignedTo: bug.assignedTo?.email ?? '',
    resetAssignedTo: false,
    qaContact: bug.qaContact?.email ?? '',
    resetQaContact: false,
    cc: bug.cc,
    dependsOn: bug.dependsOn,
    blocks: bug.blocks,
    seeAlso: bug.seeAlso,
    url: bug.url,
    alias: bug.alias,
    keywords: bug.keywords,
    groups: bug.groups,
    deadline: bug.timeTracking?.deadline?.slice(0, 10) ?? '',
    estimatedTime: bug.timeTracking ? hoursText(bug.timeTracking.estimatedTime) : '',
    remainingTime: bug.timeTracking ? hoursText(bug.timeTracking.remainingTime) : '',
    workTime: '',
    isCcAccessible: bug.isCcAccessible,
    isCreatorAccessible: bug.isCreatorAccessible,
    whiteboard: bug.whiteboard,
    flags: Object.fromEntries(bug.flags.map((flag) => [flag.id, flag.status])),
  };
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    const sortedLeft = [...left].map(String).sort();
    const sortedRight = [...right].map(String).sort();
    return sortedLeft.every((candidate, i) => candidate === sortedRight[i]);
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const leftKeys = Object.keys(left as object);
    const rightKeys = Object.keys(right as object);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every((k) => (left as Record<string, unknown>)[k] === (right as Record<string, unknown>)[k])
    );
  }
  return left === right;
}

function delta<T>(before: T[], after: T[]): ListChange<T> | undefined {
  const beforeSet = new Set(before.map(String));
  const afterSet = new Set(after.map(String));
  const add = after.filter((item) => !beforeSet.has(String(item)));
  const remove = before.filter((item) => !afterSet.has(String(item)));
  if (!add.length && !remove.length) return undefined;
  return { ...(add.length ? { add } : {}), ...(remove.length ? { remove } : {}) };
}

/** Accepts "806", "#806", "KPA-806", "bug 806" - the label people read is the one they type. */
export function parseBugRef(raw: string): number | null {
  const cleaned = raw.trim().replace(/^(?:kpa[-\s]?|#|bug[-\s]?)/i, '');
  return /^\d+$/.test(cleaned) && Number(cleaned) > 0 ? Number(cleaned) : null;
}

const isHours = (value: string) => value.trim() !== '' && /^\d+(\.\d{1,2})?$/.test(value.trim());

export interface BugEditor {
  draft: BugDraft;
  baseline: BugDraft;
  set: <K extends DraftKey>(key: K, value: BugDraft[K]) => void;
  dirty: DraftKey[];
  isDirty: (key: DraftKey) => boolean;
  errors: Partial<Record<DraftKey, string>>;
  comment: { body: string; isPrivate: boolean };
  setComment: (comment: { body: string; isPrivate: boolean }) => void;
  reset: () => void;
  markSaved: () => void;
  buildPayload: () => UpdateBugInput;
  allowedStatuses: string[];
  draftProduct?: Product;
  needsResolution: boolean;
  commentRequired: boolean;
  isDuplicate: boolean;
  lockAssignee: boolean;
  isClosed: boolean;
}

export function useBugEditor(
  bug: Bug,
  meta: BugMeta | undefined,
  products: Product[] | undefined,
  canTriage = false,
): BugEditor {
  const openSet = useMemo(
    () =>
      meta?.workflow.length
        ? new Set(
            meta.workflow.filter((workflow) => workflow.isOpen).map((workflowTransition) => workflowTransition.status),
          )
        : OPEN_STATUSES,
    [meta],
  );
  const baseline = useMemo(() => toDraft(bug), [bug]);
  const [draft, setDraft] = useState<BugDraft>(baseline);
  const [comment, setComment] = useState({ body: '', isPrivate: false });
  const previousBaseline = useRef(baseline);

  useEffect(() => {
    const before = previousBaseline.current;
    previousBaseline.current = baseline;
    setDraft((current) => {
      const next = { ...baseline };
      for (const key of Object.keys(baseline) as DraftKey[]) {
        if (!sameValue(current[key], before[key])) (next as Record<DraftKey, unknown>)[key] = current[key];
      }
      return next;
    });
  }, [baseline]);

  const draftProduct = products?.find((product) => product.name === draft.product);

  const set = useCallback(
    <K extends DraftKey>(key: K, value: BugDraft[K]) => {
      setDraft((previous) => {
        const next = { ...previous, [key]: value };
        if (key === 'status' && !openSet.has(String(value))) {
          next.assignedTo = baseline.assignedTo;
          next.resetAssignedTo = false;
        }
        if (key === 'status' && openSet.has(String(value))) next.resolution = '';
        if (key === 'status' && String(value) === baseline.status) next.resolution = baseline.resolution;
        if (key === 'component' || key === 'product') {
          next.subcomponent =
            next.component === baseline.component && next.product === baseline.product ? baseline.subcomponent : '';
        }
        if (key === 'product') {
          const target = products?.find((product) => product.name === value);
          if (target) {
            if (!target.components.some((component) => component.name === previous.component)) next.component = '';
            if (!target.versions.includes(previous.version))
              next.version = target.versions.length === 1 ? target.versions[0] : '';
            if (!target.milestones.includes(previous.targetMilestone))
              next.targetMilestone = target.milestones[0] ?? '---';
          }
          if (value === baseline.product) {
            next.component = baseline.component;
            next.subcomponent = baseline.subcomponent;
            next.version = baseline.version;
            next.targetMilestone = baseline.targetMilestone;
          }
        }
        if (key === 'resetAssignedTo' && value) next.assignedTo = baseline.assignedTo;
        if (key === 'assignedTo') next.resetAssignedTo = false;
        if (key === 'resetQaContact' && value) next.qaContact = baseline.qaContact;
        if (key === 'qaContact') next.resetQaContact = false;
        return next;
      });
    },
    [baseline, products, openSet],
  );

  const dirty = useMemo(
    () => (Object.keys(draft) as DraftKey[]).filter((k) => !sameValue(draft[k], baseline[k])),
    [draft, baseline],
  );

  const isClosed = !bug.isOpen;
  const needsResolution = !openSet.has(draft.status);
  const commentRequired =
    draft.status !== baseline.status &&
    Boolean(
      meta?.workflow.find((workflow) => workflow.status === bug.status)?.commentRequiredTo?.includes(draft.status),
    );
  const isDuplicate = needsResolution && draft.resolution === 'DUPLICATE';
  const lockAssignee = isClosed || needsResolution;

  const errors = useMemo(() => {
    const validationErrors: Partial<Record<DraftKey, string>> = {};
    if (!draft.summary.trim()) validationErrors.summary = 'A bug needs a summary.';
    else if (draft.summary.length > 255) validationErrors.summary = 'Keep the summary under 255 characters.';
    if (needsResolution && !draft.resolution) validationErrors.resolution = `Choose how this bug was resolved.`;
    if (commentRequired && !comment.body.trim()) {
      validationErrors.status =
        draft.status === 'REOPENED'
          ? 'Reopening needs a comment: say what still fails after the fix.'
          : `Moving to ${draft.status.replace('_', ' ')} needs a comment.`;
    }
    if (isDuplicate) {
      const ref = parseBugRef(draft.dupeOf);
      if (!draft.dupeOf.trim()) validationErrors.dupeOf = 'Enter the bug this one duplicates.';
      else if (ref === null) validationErrors.dupeOf = 'Enter a bug number, for example 806 or KPA-806.';
      else if (ref === bug.id) validationErrors.dupeOf = 'A bug cannot be a duplicate of itself.';
    }
    if (draft.product !== baseline.product) {
      if (!draft.component) validationErrors.component = `Choose a component in ${draft.product}.`;
      if (!draft.version) validationErrors.version = `Choose a version in ${draft.product}.`;
    }
    if (draft.url.trim() && !/^https?:\/\/\S+$/i.test(draft.url.trim()))
      validationErrors.url = 'Enter a full link starting with http:// or https://.';
    if (bug.timeTracking) {
      if (!isHours(draft.estimatedTime)) validationErrors.estimatedTime = 'Hours, e.g. 4 or 2.5.';
      if (!isHours(draft.remainingTime)) validationErrors.remainingTime = 'Hours, e.g. 4 or 2.5.';
      if (draft.workTime.trim()) {
        const hours = Number(draft.workTime);
        if (!/^-?\d+(\.\d{1,2})?$/.test(draft.workTime.trim()) || hours === 0)
          validationErrors.workTime = 'Hours worked, e.g. 1.5.';
      }
    }
    return validationErrors;
  }, [draft, baseline, bug.id, bug.timeTracking, needsResolution, isDuplicate, commentRequired, comment.body]);

  const allowedStatuses = useMemo(() => {
    const node = meta?.workflow.find((workflow) => workflow.status === bug.status);
    const targets = node ? node.canChangeTo : (meta?.statuses ?? []);
    return [bug.status, ...targets.filter((target) => target !== bug.status && (canTriage || target !== 'REOPENED'))];
  }, [meta, bug.status, canTriage]);

  const reset = useCallback(() => {
    setDraft(baseline);
    setComment({ body: '', isPrivate: false });
  }, [baseline]);

  const markSaved = useCallback(() => {
    setDraft((currentDraft) => ({ ...currentDraft, workTime: '', resetAssignedTo: false, resetQaContact: false }));
    setComment({ body: '', isPrivate: false });
  }, []);

  const buildPayload = useCallback((): UpdateBugInput => {
    const updateBugInput: UpdateBugInput = { lastChangeTime: bug.lastChangeTime };
    const changed = (k: DraftKey) => !sameValue(draft[k], baseline[k]);

    const scalars = [
      'summary',
      'status',
      'resolution',
      'priority',
      'severity',
      'product',
      'component',
      'subcomponent',
      'version',
      'targetMilestone',
      'opSys',
      'platform',
      'url',
      'whiteboard',
    ] as const;
    for (const k of scalars)
      if (changed(k)) (updateBugInput as Record<string, unknown>)[k] = k === 'summary' ? draft[k].trim() : draft[k];

    if (changed('product')) {
      updateBugInput.component = draft.component;
      updateBugInput.version = draft.version;
      if (meta?.features.targetMilestone) updateBugInput.targetMilestone = draft.targetMilestone;
    }
    if (!meta?.features.targetMilestone) delete updateBugInput.targetMilestone;
    if (isDuplicate) updateBugInput.dupeOf = parseBugRef(draft.dupeOf) ?? undefined;
    if (needsResolution && !changed('resolution') && changed('status')) updateBugInput.resolution = draft.resolution;

    if (draft.resetAssignedTo) updateBugInput.resetAssignedTo = true;
    else if (changed('assignedTo') && draft.assignedTo) updateBugInput.assignedTo = draft.assignedTo;
    if (meta?.features.qaContact) {
      if (draft.resetQaContact) updateBugInput.resetQaContact = true;
      else if (changed('qaContact')) updateBugInput.qaContact = draft.qaContact;
    }

    for (const k of LIST_KEYS) {
      const listChange = delta<string | number>(
        baseline[k as ListKey] as (string | number)[],
        draft[k as ListKey] as (string | number)[],
      );
      if (listChange) (updateBugInput as Record<string, unknown>)[k] = listChange;
    }

    if (bug.timeTracking) {
      if (changed('deadline')) updateBugInput.deadline = draft.deadline;
      if (changed('estimatedTime')) updateBugInput.estimatedTime = Number(draft.estimatedTime);
      if (changed('remainingTime')) updateBugInput.remainingTime = Number(draft.remainingTime);
      if (draft.workTime.trim()) updateBugInput.workTime = Number(draft.workTime);
    }
    if (changed('isCcAccessible')) updateBugInput.isCcAccessible = draft.isCcAccessible;
    if (changed('isCreatorAccessible')) updateBugInput.isCreatorAccessible = draft.isCreatorAccessible;

    const flagChanges = Object.entries(draft.flags)
      .filter(([id, status]) => baseline.flags[Number(id)] !== status)
      .map(([id, status]) => ({ id: Number(id), status: status as '+' | '-' | '?' | 'X' }));
    if (flagChanges.length) updateBugInput.flags = flagChanges;

    if (comment.body.trim()) updateBugInput.comment = { body: comment.body.trim(), isPrivate: comment.isPrivate };
    return updateBugInput;
  }, [draft, baseline, bug.lastChangeTime, bug.timeTracking, comment, isDuplicate, needsResolution, meta]);

  return {
    draft,
    baseline,
    set,
    dirty,
    isDirty: (k) => dirty.includes(k),
    errors,
    comment,
    setComment,
    reset,
    markSaved,
    buildPayload,
    allowedStatuses,
    draftProduct,
    needsResolution,
    commentRequired,
    isDuplicate,
    lockAssignee,
    isClosed,
  };
}
