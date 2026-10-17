import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Bug, BugMeta, ListChange, Product, UpdateBugInput } from '../types';

/**
 * Everything editable on a bug, as the form holds it. Numbers stay strings so a
 * half-typed "1." is editable; lists hold the full intended value and are
 * turned into Bugzilla's add/remove deltas only when saving.
 */
export interface BugDraft {
  summary: string;
  status: string;
  resolution: string;
  dupeOf: string;
  priority: string;
  severity: string;
  product: string;
  component: string;
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
  /** Hours worked to ADD; '' when none is being logged. */
  workTime: string;
  isCcAccessible: boolean;
  isCreatorAccessible: boolean;
  whiteboard: string;
  /** Flag id -> status ('+', '-', '?', or 'X' to clear). */
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
export const OPEN_STATUSES = new Set(['UNCONFIRMED', 'CONFIRMED', 'IN_PROGRESS', 'REOPENED']);

const LIST_KEYS = ['cc', 'dependsOn', 'blocks', 'seeAlso', 'alias', 'keywords', 'groups'] as const;
type ListKey = (typeof LIST_KEYS)[number];

const hoursText = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''));

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
    flags: Object.fromEntries(bug.flags.map((f) => [f.id, f.status])),
  };
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const sa = [...a].map(String).sort();
    const sb = [...b].map(String).sort();
    return sa.every((v, i) => v === sb[i]);
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    return ka.length === kb.length && ka.every((k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]);
  }
  return a === b;
}

function delta<T>(before: T[], after: T[]): ListChange<T> | undefined {
  const b = new Set(before.map(String));
  const a = new Set(after.map(String));
  const add = after.filter((v) => !b.has(String(v)));
  const remove = before.filter((v) => !a.has(String(v)));
  if (!add.length && !remove.length) return undefined;
  return { ...(add.length ? { add } : {}), ...(remove.length ? { remove } : {}) };
}

/** Accepts "806", "#806", "KPA-806", "bug 806" - the label people read is the one they type. */
export function parseBugRef(raw: string): number | null {
  const cleaned = raw.trim().replace(/^(?:kpa[-\s]?|#|bug[-\s]?)/i, '');
  return /^\d+$/.test(cleaned) && Number(cleaned) > 0 ? Number(cleaned) : null;
}

const isHours = (s: string) => s.trim() !== '' && /^\d+(\.\d{1,2})?$/.test(s.trim());

export interface BugEditor {
  draft: BugDraft;
  baseline: BugDraft;
  set: <K extends DraftKey>(key: K, value: BugDraft[K]) => void;
  dirty: DraftKey[];
  isDirty: (key: DraftKey) => boolean;
  errors: Partial<Record<DraftKey, string>>;
  comment: { body: string; isPrivate: boolean };
  setComment: (c: { body: string; isPrivate: boolean }) => void;
  reset: () => void;
  /** After a successful save: clears the one-shot values (hours logged, resets, comment). */
  markSaved: () => void;
  buildPayload: () => UpdateBugInput;
  /** Statuses this bug may move to from its stored status, per the Bugzilla workflow. */
  allowedStatuses: string[];
  /** The product the draft currently points at (for component/version choices). */
  draftProduct?: Product;
  needsResolution: boolean;
  commentRequired: boolean;
  isDuplicate: boolean;
  lockAssignee: boolean;
  isClosed: boolean;
}

export function useBugEditor(bug: Bug, meta: BugMeta | undefined, products: Product[] | undefined, canTriage = false): BugEditor {
  // Which statuses are open, per Bugzilla - so a status added later (REOPENED) needs no code change.
  const openSet = useMemo(
    () => (meta?.workflow.length ? new Set(meta.workflow.filter((w) => w.isOpen).map((w) => w.status)) : OPEN_STATUSES),
    [meta]
  );
  const baseline = useMemo(() => toDraft(bug), [bug]);
  const [draft, setDraft] = useState<BugDraft>(baseline);
  const [comment, setComment] = useState({ body: '', isPrivate: false });
  const previousBaseline = useRef(baseline);

  /*
   * The bug was refetched (after our own save, or to pick up someone else's).
   * Rebase rather than reset: fields the user has not touched follow the new
   * stored value, fields they have edited keep their edit. A plain reset would
   * throw away work-in-progress every time the cache refreshed.
   */
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

  const draftProduct = products?.find((p) => p.name === draft.product);

  const set = useCallback(
    <K extends DraftKey>(key: K, value: BugDraft[K]) => {
      setDraft((prev) => {
        const next = { ...prev, [key]: value };
        // Choosing a closing status drops a pending reassignment: the backend
        // refuses to change the assignee while closing (it records who fixed it).
        if (key === 'status' && !openSet.has(String(value))) {
          next.assignedTo = baseline.assignedTo;
          next.resetAssignedTo = false;
        }
        if (key === 'status' && openSet.has(String(value))) next.resolution = '';
        if (key === 'status' && String(value) === baseline.status) next.resolution = baseline.resolution;
        // A new product invalidates its dependants unless the same name exists there too.
        if (key === 'product') {
          const target = products?.find((p) => p.name === value);
          if (target) {
            if (!target.components.some((c) => c.name === prev.component)) next.component = '';
            if (!target.versions.includes(prev.version)) next.version = target.versions.length === 1 ? target.versions[0] : '';
            if (!target.milestones.includes(prev.targetMilestone)) next.targetMilestone = target.milestones[0] ?? '---';
          }
          if (value === baseline.product) {
            next.component = baseline.component;
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
    [baseline, products, openSet]
  );

  const dirty = useMemo(
    () => (Object.keys(draft) as DraftKey[]).filter((k) => !sameValue(draft[k], baseline[k])),
    [draft, baseline]
  );

  const isClosed = !bug.isOpen;
  const needsResolution = !openSet.has(draft.status);
  /** Bugzilla requires a comment for this move (REOPENED: what still fails). */
  const commentRequired =
    draft.status !== baseline.status &&
    Boolean(meta?.workflow.find((w) => w.status === bug.status)?.commentRequiredTo?.includes(draft.status));
  const isDuplicate = needsResolution && draft.resolution === 'DUPLICATE';
  const lockAssignee = isClosed || needsResolution;

  const errors = useMemo(() => {
    const e: Partial<Record<DraftKey, string>> = {};
    if (!draft.summary.trim()) e.summary = 'A bug needs a summary.';
    else if (draft.summary.length > 255) e.summary = 'Keep the summary under 255 characters.';
    if (needsResolution && !draft.resolution) e.resolution = `Choose how this bug was resolved.`;
    if (commentRequired && !comment.body.trim()) {
      e.status =
        draft.status === 'REOPENED'
          ? 'Reopening needs a comment: say what still fails after the fix.'
          : `Moving to ${draft.status.replace('_', ' ')} needs a comment.`;
    }
    if (isDuplicate) {
      const ref = parseBugRef(draft.dupeOf);
      if (!draft.dupeOf.trim()) e.dupeOf = 'Enter the bug this one duplicates.';
      else if (ref === null) e.dupeOf = 'Enter a bug number, for example 806 or KPA-806.';
      else if (ref === bug.id) e.dupeOf = 'A bug cannot be a duplicate of itself.';
    }
    if (draft.product !== baseline.product) {
      if (!draft.component) e.component = `Choose a component in ${draft.product}.`;
      if (!draft.version) e.version = `Choose a version in ${draft.product}.`;
    }
    if (draft.url.trim() && !/^https?:\/\/\S+$/i.test(draft.url.trim())) e.url = 'Enter a full link starting with http:// or https://.';
    if (bug.timeTracking) {
      if (!isHours(draft.estimatedTime)) e.estimatedTime = 'Hours, e.g. 4 or 2.5.';
      if (!isHours(draft.remainingTime)) e.remainingTime = 'Hours, e.g. 4 or 2.5.';
      if (draft.workTime.trim()) {
        const n = Number(draft.workTime);
        if (!/^-?\d+(\.\d{1,2})?$/.test(draft.workTime.trim()) || n === 0) e.workTime = 'Hours worked, e.g. 1.5.';
      }
    }
    return e;
  }, [draft, baseline, bug.id, bug.timeTracking, needsResolution, isDuplicate, commentRequired, comment.body]);

  const allowedStatuses = useMemo(() => {
    const node = meta?.workflow.find((w) => w.status === bug.status);
    const targets = node ? node.canChangeTo : (meta?.statuses ?? []);
    // Reopening is the tester's call (the backend enforces it too).
    return [bug.status, ...targets.filter((s) => s !== bug.status && (canTriage || s !== 'REOPENED'))];
  }, [meta, bug.status, canTriage]);

  const reset = useCallback(() => {
    setDraft(baseline);
    setComment({ body: '', isPrivate: false });
  }, [baseline]);

  const markSaved = useCallback(() => {
    setDraft((d) => ({ ...d, workTime: '', resetAssignedTo: false, resetQaContact: false }));
    setComment({ body: '', isPrivate: false });
  }, []);

  const buildPayload = useCallback((): UpdateBugInput => {
    const p: UpdateBugInput = { lastChangeTime: bug.lastChangeTime };
    const changed = (k: DraftKey) => !sameValue(draft[k], baseline[k]);

    const scalars = [
      'summary', 'status', 'resolution', 'priority', 'severity', 'product', 'component', 'version',
      'targetMilestone', 'opSys', 'platform', 'url', 'whiteboard',
    ] as const;
    for (const k of scalars) if (changed(k)) (p as Record<string, unknown>)[k] = k === 'summary' ? draft[k].trim() : draft[k];

    // A product move must carry its dependants even when their names happen to match.
    if (changed('product')) {
      p.component = draft.component;
      p.version = draft.version;
      if (meta?.features.targetMilestone) p.targetMilestone = draft.targetMilestone;
    }
    if (!meta?.features.targetMilestone) delete p.targetMilestone;
    // Bugzilla needs the duplicate target with the DUPLICATE resolution, every time.
    if (isDuplicate) p.dupeOf = parseBugRef(draft.dupeOf) ?? undefined;
    if (needsResolution && !changed('resolution') && changed('status')) p.resolution = draft.resolution;

    if (draft.resetAssignedTo) p.resetAssignedTo = true;
    else if (changed('assignedTo') && draft.assignedTo) p.assignedTo = draft.assignedTo;
    if (meta?.features.qaContact) {
      if (draft.resetQaContact) p.resetQaContact = true;
      else if (changed('qaContact')) p.qaContact = draft.qaContact;
    }

    for (const k of LIST_KEYS) {
      const d = delta<string | number>(baseline[k as ListKey] as (string | number)[], draft[k as ListKey] as (string | number)[]);
      if (d) (p as Record<string, unknown>)[k] = d;
    }

    if (bug.timeTracking) {
      if (changed('deadline')) p.deadline = draft.deadline;
      if (changed('estimatedTime')) p.estimatedTime = Number(draft.estimatedTime);
      if (changed('remainingTime')) p.remainingTime = Number(draft.remainingTime);
      if (draft.workTime.trim()) p.workTime = Number(draft.workTime);
    }
    if (changed('isCcAccessible')) p.isCcAccessible = draft.isCcAccessible;
    if (changed('isCreatorAccessible')) p.isCreatorAccessible = draft.isCreatorAccessible;

    const flagChanges = Object.entries(draft.flags)
      .filter(([id, status]) => baseline.flags[Number(id)] !== status)
      .map(([id, status]) => ({ id: Number(id), status: status as '+' | '-' | '?' | 'X' }));
    if (flagChanges.length) p.flags = flagChanges;

    if (comment.body.trim()) p.comment = { body: comment.body.trim(), isPrivate: comment.isPrivate };
    return p;
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
