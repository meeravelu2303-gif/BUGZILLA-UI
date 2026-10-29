import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import archiver from 'archiver';
import express, { Router, type Request } from 'express';
import { z } from 'zod';
import type { Env } from '../config/env';
import { requireAuth, requirePermission } from '../middleware/auth';
import { accessSnapshot, scopeToAccessibleProducts } from '../lib/access';
import {
  CATEGORIES,
  SEVERITIES,
  SOURCES,
  browsersOf,
  classify,
  withSourceTag,
  toBugzillaQuery,
  type BugFilters,
  type Category,
  type Severity,
} from '../lib/classification';
import type { BugzillaClient } from '../lib/bugzillaClient';
import { reassignedBugIds } from '../lib/bugHistory';
import { canServeFromSnapshot, getBugSnapshot, inScope, invalidateBugSnapshot, matchesFilters, snapshotSorter, type SnapshotBug } from '../lib/bugSnapshot';
import { accessibleProductNames } from '../lib/access';
import { categoryOf } from '../lib/classification';
import { closedStatuses, narrowStatusFilter } from '../lib/bugStatus';
import { allGroupNames, bugFeatures } from '../lib/bugFeatures';
import { CURRENT_BUG_FIELDS, toBugzillaUpdate, validateBugUpdate, type CurrentBug } from '../lib/bugUpdate';
import { groupNameForProduct } from '../lib/productGroups';
import { allProductNames, describeTargets, directoryClient, loadTransferableBug, parseTransferRoutes, transferBug, transferTargetsFor } from '../lib/productTransfer';
import { clearCategoryIndex } from '../lib/categoryIndex';
import { DELETED_GROUP, DELETED_RESOLUTION, deletedInfoFrom, restoreBugs, softDeleteBugs } from '../lib/softDelete';
import { effectiveReport, isReportRevision, normaliseReport, revisionComment, stripRevision, withCategoryTag } from '../lib/reportRevision';
import { buildBugWorkbook, currentComments, type BugProof, type ExportBug, type ExportContext } from '../lib/bugExport';
import { EMPTY_REPORT, parseDefectReport } from '../lib/defectReport';
import { AppError } from '../lib/errors';
import { proofQueryString, proofSecret, signProof } from '../lib/proofLinks';
import { parseDescription } from '../lib/grouping';
import { displayNameFor, resolveDisplayNames } from '../lib/displayNames';
import { parseInput } from '../lib/validate';
import { NO_SUBCOMPONENT, resolveSubcomponent, subcomponentName } from '../lib/subcomponents';
import { loadBugActivity } from '../lib/bugActivity';
import { announceBugChange } from '../lib/liveUpdates';
import {
  addCommentSchema,
  bugCountRowSchema,
  countBugsQuerySchema,
  createAttachmentSchema,
  createBugSchema,
  exportBugsQuerySchema,
  listBugsQuerySchema,
  bulkReassignSchema,
  normalizeAttachment,
  normalizeBug,
  normalizeComment,
  rawAttachmentSchema,
  rawBugSchema,
  rawCommentSchema,
  updateReportSchema,
  restoreSchema,
  softDeleteSchema,
  transferBugSchema,
  componentOwnerKey,
  reassignmentCandidates,
  tallyBugCounts,
  type ComponentOwners,
  updateAttachmentSchema,
  updateBugSchema,
  updateCommentTagsSchema,
} from '../schemas/bug';

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** The narrow projection /stats asks Bugzilla for - never whole bug records. */
interface StatsRow {
  id: number;
  severity: string;
  priority: string;
  status: string;
  component: string;
  cf_subcomponent?: string;
  product: string;
  resolution?: string;
  whiteboard?: string;
  is_open: boolean;
  assigned_to?: string;
}

/** A counter object with every key present at zero, so absent bands still render. */
/** A snapshot row in the shape `tallyBugCounts` reads. */
function toCountRow(r: SnapshotBug) {
  return { id: r.id, is_open: r.isOpen, status: r.status, severity: r.severity, priority: r.priority, assigned_to: r.assignedTo, product: r.product, component: r.component };
}

function zeroed<T extends readonly string[]>(keys: T): Record<T[number], number> {
  return Object.fromEntries(keys.map((k) => [k, 0])) as Record<T[number], number>;
}

/**
 * Maps the sort keys this API exposes onto the column names Bugzilla's `order`
 * parameter actually accepts.
 *
 * These are NOT the same vocabulary: `order` takes Bugzilla's internal buglist
 * column names, while the rest of the REST API speaks its output field names.
 * Passing an output name (`summary`, `last_change_time`, `id`, ...) is not an
 * error - Bugzilla silently discards the whole order clause and falls back to
 * bug_id ascending, so a sort appears to work while doing nothing. Verified
 * field by field against the live instance; only the names on the right are
 * honoured.
 */
const SORT_FIELDS: Record<string, string> = {
  id: 'bug_id',
  priority: 'priority',
  severity: 'bug_severity',
  status: 'bug_status',
  product: 'product',
  component: 'component',
  assigned_to: 'assigned_to',
  last_change_time: 'changeddate',
  creation_time: 'opendate',
  summary: 'short_desc',
  status_whiteboard: 'status_whiteboard',
  /**
   * Triage order: how important is this bug to fix next.
   *
   * Severity first (the impact of the defect), then priority. Both sort by
   * Bugzilla's per-value `sortkey`, not alphabetically, so ascending genuinely
   * means blocker->trivial and Highest->Lowest rather than an alphabetical
   * jumble. Module criticality is no longer a separate sort axis — it is carried
   * by a defect's severity and shown by its component.
   */
  importance: 'bug_severity,priority',
};

const DEFAULT_SORT = 'last_change_time';

/**
 * Appended after whatever sort the caller asked for, so equal-ranked bugs read in a stable,
 * intuitive order: **ascending by bug id** (KPA-001, KPA-002, …).
 *
 * bug_id is the single tiebreaker on purpose. Within one severity band nearly every defect
 * shares a rank, and a `changeddate DESC` tie made them read newest-first (KPA-352 before
 * KPA-001), which looks mis-ordered. Ascending bug id is what a reader expects and is fully
 * deterministic (bug_id is unique), so each page of an offset query is ordered the same way —
 * no bug appearing on two pages or vanishing between them.
 */
const TIEBREAKERS = [{ field: 'bug_id', clause: 'bug_id ASC' }];

/** Bugzilla's own name for "this bug duplicates another one". */
const DUPLICATE = 'DUPLICATE';

/**
 * The assignee cannot change on a bug that is closed, or that this request is
 * closing.
 *
 * Reassignment means "this person is going to work on it", which is meaningless
 * once the work is finished - and worse, it rewrites the record of who actually
 * fixed it.
 *
 * Both halves matter, because they reach the same end state. Guarding only the
 * already-closed case leaves a loophole: refusing "resolve, then reassign"
 * while allowing "resolve and reassign in one save" blocks the two-step route
 * to a closed-bug-with-a-changed-assignee and waves through the one-step route
 * to exactly the same record. The rule is about the resulting state, not the
 * number of requests used to get there.
 *
 * Enforced here rather than only in the UI: the UI disables the control, but a
 * direct API call would otherwise sail straight through to Bugzilla.
 */
/**
 * `actor` enables the ownership rule: a caller without `canReassignAny` may
 * only move bugs already assigned to them. Since 2026-10-28 developers hold
 * that right too, so in practice this now stops only office reporters.
 *
 * Bugzilla's own `editbugs` says "can edit all bug fields" and draws no line
 * around ownership, so without this any developer could reach across and
 * reassign a colleague's work - which is how a bug quietly leaves the person
 * actually carrying it. Enforced here rather than only by hiding the control:
 * the UI can be bypassed with a direct API call, and this is an authorisation
 * rule, not a convenience.
 */
async function assertReassignable(
  client: BugzillaClient,
  ids: number[],
  targetStatus?: string,
  actor?: { email: string; canReassignAny: boolean }
): Promise<void> {
  const resp = await client.get<{
    bugs: {
      id: number;
      status: string;
      is_open: boolean;
      assigned_to: string;
    }[];
  }>('/bug', {
    id: ids.join(','),
    include_fields: 'id,status,is_open,assigned_to',
    limit: 0,
  });

  if (actor && !actor.canReassignAny) {
    const me = actor.email.toLowerCase();
    const notMine = resp.bugs.filter((b) => (b.assigned_to ?? '').toLowerCase() !== me);
    if (notMine.length > 0) {
      // Named, like the closed-bug case: on a bulk action "some are not yours"
      // leaves the caller guessing which row to deselect.
      const listed = notMine
        .slice(0, 5)
        .map((b) => `#${b.id}`)
        .join(', ');
      const rest = notMine.length > 5 ? `, and ${notMine.length - 5} more` : '';
      const subject = notMine.length === 1 ? 'that bug is' : `${notMine.length} of the selected bugs are`;

      throw new AppError(
        403,
        'FORBIDDEN',
        `Cannot reassign - ${subject} assigned to someone else: ${listed}${rest}. ` +
          `Only the current assignee, a developer or a tester can hand a bug on.`
      );
    }
  }

  const closed = resp.bugs.filter((b) => !b.is_open);
  if (closed.length > 0) {
    // Name the offenders: on a bulk action "some of them are closed" is not
    // actionable, and the caller cannot tell which selection to fix.
    const listed = closed
      .slice(0, 5)
      .map((b) => `#${b.id} (${b.status})`)
      .join(', ');
    const rest = closed.length > 5 ? `, and ${closed.length - 5} more` : '';
    const subject = closed.length === 1 ? 'that bug is' : `${closed.length} of the selected bugs are`;

    throw new AppError(
      409,
      'CONFLICT',
      `Cannot reassign - ${subject} already closed: ${listed}${rest}. Reopen the bug before assigning it to someone else.`
    );
  }

  // The bug is open now, but this same request may be closing it.
  if (targetStatus && (await closedStatuses(client)).has(targetStatus)) {
    throw new AppError(
      409,
      'CONFLICT',
      `Cannot change the assignee while closing a bug - the assignee records who fixed it. ` +
        `Save the reassignment first, then set the status to ${targetStatus}.`
    );
  }
}

/**
 * Filters are translated by lib/classification.ts, which owns the vocabulary in
 * both directions. Shared by the list, count and stats endpoints so a count can
 * never disagree with the list it sits above.
 */
function applyBugFilters(params: Record<string, unknown>, query: BugFilters): void {
  Object.assign(params, toBugzillaQuery(query));
}

/**
 * The Bugzilla `order` clause for a sort key and direction. Shared by the list
 * and the Excel export so a downloaded sheet is in the same order as the table
 * it was exported from.
 */
function buildOrder(sortBy: string, sortDir: 'asc' | 'desc'): string {
  const sortField = SORT_FIELDS[sortBy] ?? SORT_FIELDS[DEFAULT_SORT];
  // A composite sort is several columns, so reversing it has to reverse every
  // one of them - appending a single DESC would only flip the last column.
  const primary =
    sortDir === 'desc'
      ? sortField
          .split(',')
          .map((f) => `${f} DESC`)
          .join(',')
      : sortField;
  // A coarse sort (e.g. severity has four values) leaves hundreds of bugs
  // equal-ranked, so without tiebreakers they come back in an arbitrary order
  // that shifts between pages. Each tiebreaker is skipped when the chosen sort
  // already contains that column, so a column is never named twice.
  const chosen = sortField.split(',');
  return [primary, ...TIEBREAKERS.filter((t) => !chosen.includes(t.field)).map((t) => t.clause)].join(',');
}

/**
 * Bugzilla's own `max_search_results` on this instance. A search past it is
 * truncated silently, so an export that hits the ceiling refuses rather than
 * handing over a spreadsheet that looks complete and is not.
 */
const EXPORT_MAX_ROWS = 10_000;

const EXPORT_FILTER_LABELS: Array<[keyof BugFilters, string]> = [
  ['product', 'Product'],
  ['component', 'Component'],
  ['subcomponent', 'Sub-component'],
  ['status', 'Status'],
  ['resolution', 'Resolution'],
  ['severity', 'Severity'],
  ['priority', 'Priority'],
  ['category', 'Category'],
  ['browser', 'Browser'],
  ['urgent', 'Urgent (Critical or P0)'],
  ['assignedTo', 'Assigned to'],
  ['creator', 'Reported by'],
  ['cc', 'CC'],
  ['search', 'Summary contains'],
];

/** Bugs per comment request: keeps each URL short and each response a sane size. */
const DESCRIPTION_BATCH = 100;
/** Comment requests in flight at once - enough to be quick, not enough to swamp Bugzilla. */
const DESCRIPTION_CONCURRENCY = 4;

/** A bug's description plus its most recent comment, as pulled for the export sheet. */
export interface BugCommentInfo {
  description?: string;
  lastComment?: { text: string; author: string; createdAt: string };
  /** Every comment after the description, newest first. */
  history?: Array<{ text: string; author: string; createdAt: string }>;
}

/**
 * Each bug's description (its first comment) AND its most recent comment, keyed by bug id.
 *
 * A bug search never returns comment text, and the endpoints and Expected /
 * Actual columns live only there. Bugzilla's comment call takes many bug ids
 * at once (`/bug/{first}/comment?ids=…`), so this is a handful of batched
 * requests rather than one per bug. It still enforces access per bug and hides
 * private comments from non-insiders, so nothing leaks into the sheet that the
 * user could not read in the app.
 *
 * The "last comment" is whichever comment is chronologically newest for that bug -
 * when a bug has no comments beyond its own description, that description IS the
 * last comment, so the two fields end up identical rather than one being blank.
 */
/** Thrown between upstream calls once an export job is cancelled; never surfaced as an error. */
class ExportCancelled extends Error {}

/** Progress + cancellation hooks for the export helpers. Both optional: the direct download passes neither. */
interface StepHooks {
  signal?: AbortSignal;
  /** Called after each unit of work with (done, total) for the current step. */
  onProgress?: (done: number, total: number) => void;
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ExportCancelled('cancelled');
}

async function fetchDescriptions(
  client: BugzillaClient,
  ids: number[],
  hooks: StepHooks = {}
): Promise<Map<number, BugCommentInfo>> {
  const batches: number[][] = [];
  for (let i = 0; i < ids.length; i += DESCRIPTION_BATCH) batches.push(ids.slice(i, i + DESCRIPTION_BATCH));

  const info = new Map<number, BugCommentInfo>();
  let next = 0;
  let finished = 0;

  async function worker(): Promise<void> {
    while (next < batches.length) {
      throwIfCancelled(hooks.signal);
      const [first, ...rest] = batches[next++];
      const resp = await client.get<{
        bugs: Record<
          string,
          {
            comments: Array<{
              count?: number;
              text?: string;
              creator?: string;
              creation_time?: string;
            }>;
          }
        >;
      }>(`/bug/${first}/comment`, rest.length > 0 ? { ids: rest.map(String) } : {});
      for (const [bugId, { comments }] of Object.entries(resp.bugs ?? {})) {
        // `count` 0 is the description; fall back to the oldest visible comment
        // when the description itself is private and was filtered out.
        const description = comments.find((c) => c.count === 0) ?? comments[0];
        // An edited report lives in its newest revision comment (lib/reportRevision.ts); those
        // revisions are the report itself, so they are neither "Last Comment" nor thread history.
        const report = effectiveReport(comments);
        const discussion = comments.filter((c) => !isReportRevision(c.text));
        // The newest visible comment, by Bugzilla's own comment ordering (the API
        // already returns them oldest-first) - not necessarily the description.
        const last = discussion[discussion.length - 1];
        info.set(Number(bugId), {
          description: report.text || description?.text,
          lastComment:
            last?.text && last.creator && last.creation_time
              ? {
                  text: last.text,
                  author: last.creator,
                  createdAt: last.creation_time,
                }
              : undefined,
          // A finding QA posts as a comment (a measured root cause, a developer's question answered) is pushed
          // out of "Last Comment" by the next run's dated status note, so the sheet keeps the whole thread too.
          history: discussion
            .filter((c) => c !== description && c.text && c.creator && c.creation_time)
            .map((c) => ({ text: c.text!, author: c.creator!, createdAt: c.creation_time! }))
            .reverse(),
        });
      }
      hooks.onProgress?.(Math.min(++finished * DESCRIPTION_BATCH, ids.length), ids.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(DESCRIPTION_CONCURRENCY, batches.length) }, worker));
  return info;
}

/**
 * Each bug's non-obsolete attachments, newest first, keyed by bug id - metadata only (no file
 * bytes), batched the same way as `fetchDescriptions`. Developers fix bugs from the exported sheet,
 * so the sheet has to show what proof exists and how recent it is, not just the prose.
 */
async function fetchAttachments(client: BugzillaClient, ids: number[], hooks: StepHooks = {}): Promise<Map<number, BugProof[]>> {
  const batches: number[][] = [];
  for (let i = 0; i < ids.length; i += DESCRIPTION_BATCH) batches.push(ids.slice(i, i + DESCRIPTION_BATCH));

  const proof = new Map<number, BugProof[]>();
  let next = 0;
  let finished = 0;

  async function worker(): Promise<void> {
    while (next < batches.length) {
      throwIfCancelled(hooks.signal);
      const [first, ...rest] = batches[next++];
      const resp = await client.get<{
        bugs: Record<
          string,
          Array<{
            id: number;
            file_name?: string;
            summary?: string;
            creation_time?: string;
            is_obsolete?: number | boolean;
            content_type?: string;
            size?: number;
          }>
        >;
      }>(`/bug/${first}/attachment`, {
        ...(rest.length > 0 ? { ids: rest.map(String) } : {}),
        include_fields: 'id,file_name,summary,creation_time,is_obsolete,content_type,size',
      });
      for (const [bugId, list] of Object.entries(resp.bugs ?? {})) {
        proof.set(
          Number(bugId),
          list
            .filter((a) => !a.is_obsolete && a.file_name && a.creation_time)
            .map((a) => ({
              id: a.id,
              fileName: a.file_name!,
              summary: a.summary ?? '',
              createdAt: a.creation_time!,
              contentType: a.content_type ?? 'application/octet-stream',
              size: a.size ?? 0,
            }))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        );
      }
      hooks.onProgress?.(Math.min(++finished * DESCRIPTION_BATCH, ids.length), ids.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(DESCRIPTION_CONCURRENCY, batches.length) }, worker));
  return proof;
}

/** One attachment's bytes, from Bugzilla (base64 in the REST response). */
async function fetchAttachmentData(client: BugzillaClient, attachmentId: number): Promise<Buffer> {
  const resp = await client.get<{
    attachments: Record<string, { data: string }>;
  }>(`/bug/attachment/${attachmentId}`);
  const attachment = resp.attachments[String(attachmentId)];
  if (!attachment) throw new AppError(404, 'NOT_FOUND', `Attachment ${attachmentId} could not be found.`);
  return Buffer.from(attachment.data, 'base64');
}

/** Text evidence (evidence.txt, crash diagnosis, …) is small and worth inlining: Claude reads cell text. */
const TEXT_PROOF = /^(text\/|application\/json)/i;
const TEXT_PROOF_MAX_FILES = 3;
// A full failure diagnosis (stack, steps, console, grouped requests) runs to ~10-15k characters on its own;
// Excel's per-cell ceiling is 32,767, so stay just under it rather than cut the newest file short.
const TEXT_PROOF_MAX_CHARS = 30_000;

/**
 * The CONTENT of each bug's newest text attachments, keyed by bug id — so the sheet carries the
 * evidence itself (request, response, crash diagnosis), not just a file name. A developer handing the
 * sheet to Claude gets everything Claude can read; images and videos cannot be read from a cell.
 */
async function fetchTextEvidence(
  client: BugzillaClient,
  proof: Map<number, BugProof[]>,
  hooks: StepHooks = {}
): Promise<Map<number, string>> {
  const jobs: Array<{ bugId: number; file: BugProof }> = [];
  for (const [bugId, files] of proof) {
    for (const file of files.filter((f) => TEXT_PROOF.test(f.contentType)).slice(0, TEXT_PROOF_MAX_FILES)) {
      jobs.push({ bugId, file });
    }
  }
  const parts = new Map<number, string[]>();
  let next = 0;
  let finished = 0;
  hooks.onProgress?.(0, jobs.length);
  async function worker(): Promise<void> {
    while (next < jobs.length) {
      throwIfCancelled(hooks.signal);
      const { bugId, file } = jobs[next++];
      const text = await fetchAttachmentData(client, file.id)
        .then((b) => b.toString('utf8'))
        .catch(() => '(could not be read)');
      const list = parts.get(bugId) ?? [];
      list.push(`--- ${file.fileName} (${file.createdAt.slice(0, 10)}) ---\n${text.trim()}`);
      parts.set(bugId, list);
      hooks.onProgress?.(++finished, jobs.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(DESCRIPTION_CONCURRENCY, jobs.length) }, worker));
  return new Map([...parts].map(([id, list]) => [id, list.join('\n\n').slice(0, TEXT_PROOF_MAX_CHARS)]));
}

/** Screenshots above this are skipped as thumbnails (still in the bug's folder) so the sheet stays openable. */
const THUMBNAIL_MAX_BYTES = 1_500_000;

/** A Playwright trace archive (the bench names them `…playwright-trace…zip`). */
function isTrace(file: BugProof): boolean {
  return /trace/i.test(file.fileName) && /zip$/i.test(file.contentType + file.fileName);
}

/** A bug whose evidence is a crash / JavaScript error — where a trace is how a developer finds the call site. */
const CRASH_BUG = /JS error|Uncaught|TypeError|ReferenceError|React error|crash/i;

/**
 * Whether this file goes into the pack. Traces were 404 of 672 MB in a 130-bug pack, so they are left
 * out — EXCEPT for crash bugs: the UI developers' review (2026-10-08) asked for "the referenced trace
 * contents … and the exact interaction sequence" on exactly those. Everything else is always included.
 */
function inPack(bug: ExportBug, file: BugProof): boolean {
  return !isTrace(file) || CRASH_BUG.test(`${bug.summary} ${bug.report.actual}`);
}

/** A file name that is safe inside a zip: no folders, no traversal, never empty, never colliding. */
function safeFileName(name: string, attachmentId: number): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 150);
  return `${attachmentId}-${cleaned || 'attachment'}`;
}

/**
 * One bug as a readable text file for its evidence-pack folder — description, latest status and the
 * list of proof files — so a developer can hand Claude a single folder and nothing else.
 */
function bugMarkdown(bug: ExportBug): string {
  const lines = [
    `# Bug ${bug.id}: ${bug.summary}`,
    '',
    `- Product: ${bug.product} / ${bug.component}${bug.subcomponentName ? ` / ${bug.subcomponentName}` : ''}`,
    `- Status: ${bug.status}${bug.resolution ? ` (${bug.resolution})` : ''}`,
    `- Severity: ${bug.triage.severity}, Priority: ${bug.triage.priority}, Category: ${bug.triage.category}`,
    bug.triage.browsers.length ? `- Browsers: ${bug.triage.browsers.join(', ')}` : '',
    bug.assignedTo ? `- Assigned to: ${bug.assignedTo.name ?? ''} <${bug.assignedTo.email ?? ''}>` : '',
    '',
    '## Description (as filed)',
    '',
    bug.description?.trim() || '(no description)',
    '',
  ];
  if (bug.history?.length) {
    lines.push('## Comments (newest first)', '');
    for (const c of currentComments(bug.history)) {
      lines.push(`### ${c.author}, ${c.createdAt.slice(0, 16).replace('T', ' ')} UTC`, '', c.text.trim(), '');
    }
  }
  lines.push('## Evidence files in this folder', '');
  const inFolder = (bug.proof ?? []).filter((file) => inPack(bug, file));
  for (const file of inFolder) {
    lines.push(
      `- ${safeFileName(file.fileName, file.id)} — ${file.createdAt.slice(0, 10)} — ${file.summary || file.contentType}`
    );
  }
  const traces = (bug.proof ?? []).length - inFolder.length;
  if (traces) lines.push(`- (${traces} Playwright trace file(s) are in Bugzilla only, not in this pack)`);
  if (!(bug.proof ?? []).length) lines.push('- (none attached)');
  return lines.filter((l, i, all) => !(l === '' && all[i - 1] === '')).join('\n') + '\n';
}

/**
 * One export build in progress (or ready to collect), held in memory on this server: either the
 * Excel sheet on its own or the evidence pack (.zip). Both run in the background so the browser can
 * show real progress and the person can cancel - the sheet used to be one request that blocked with
 * no feedback and could not be stopped.
 */
interface PackJob {
  id: string;
  kind: 'xlsx' | 'zip';
  userId: number;
  status: 'preparing' | 'ready' | 'failed' | 'cancelled';
  phase: string;
  done: number;
  total: number;
  /** Overall 0-100 across every phase, so the bar never jumps backwards between steps. */
  percent: number;
  createdAt: number;
  /** Aborted by DELETE; every upstream loop checks it before its next Bugzilla call. */
  controller: AbortController;
  rows?: number;
  file?: string;
  fileName?: string;
  sizeBytes?: number;
  error?: string;
}

/** What `collectExport` reports: the step it is on and how far through the WHOLE collection it is (0-1). */
interface CollectProgress {
  signal?: AbortSignal;
  report: (phase: string, fraction: number, done?: number, total?: number) => void;
}

/** Maps a sub-task's 0-1 fraction onto the job's overall [from, to] percent band. */
function band(job: PackJob, from: number, to: number): CollectProgress['report'] {
  return (phase, fraction, done, total) => {
    job.phase = phase;
    if (done !== undefined) job.done = done;
    if (total !== undefined) job.total = total;
    job.percent = Math.max(job.percent, Math.min(99, Math.round(from + (to - from) * fraction)));
  };
}

const packJobs = new Map<string, PackJob>();
const PACK_DIR = path.join(os.tmpdir(), 'bugzilla-ui-evidence-packs');
/** A pack nobody downloads is deleted after this — the server never accumulates old packs. */
const PACK_TTL_MS = 60 * 60 * 1000;

function sweepPackJobs(): void {
  const now = Date.now();
  for (const [id, job] of packJobs) {
    if (now - job.createdAt <= PACK_TTL_MS) continue;
    packJobs.delete(id);
    if (job.file) void unlink(job.file).catch(() => undefined);
  }
}

/** The web app's origin, from the requesting page - used only to link ids back to it. */
function appOriginOf(origin: string | undefined, referer: string | undefined): string | undefined {
  for (const candidate of [origin, referer]) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin;
    } catch {
      // Not a URL - try the next header.
    }
  }
  return undefined;
}

/**
 * Whether the signed-in person may delete an attachment uploaded by `creator`
 * (a login): their own uploads, or anything for a user administrator. The
 * AttachmentDelete extension applies the same rule; this decides whether the
 * page offers the button and refuses early with a clear message.
 */
function canDeleteAttachment(req: Request, creator: string): boolean {
  const user = req.sessionUser!;
  return user.permissions.canManageUsers || creator.toLowerCase() === user.email.toLowerCase();
}

export function bugsRouter(env: Env): Router {
  const router = Router();

  /*
   * Live updates (lib/liveUpdates.ts). After ANY successful change through this
   * router - edit, comment, attachment, status, transfer, delete, create - the
   * bugs it touched are re-read into the in-memory copy and every connected
   * browser is told, so other people's screens refresh without a reload.
   * Ids come from the path (/:id/...), a body `ids` list (bulk actions), or
   * res.locals.bugIds (create). Exports are reads, despite being POSTs.
   */
  router.use((req, res, next) => {
    if (req.method === 'GET' || req.path.startsWith('/export')) return next();
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      const ids = new Set<number>();
      const fromPath = /^\/(\d+)(?:\/|$)/.exec(req.path);
      if (fromPath) ids.add(Number(fromPath[1]));
      const bodyIds = (req.body as { ids?: unknown } | undefined)?.ids;
      if (Array.isArray(bodyIds)) for (const v of bodyIds) if (Number.isInteger(Number(v))) ids.add(Number(v));
      for (const id of (res.locals.bugIds as number[] | undefined) ?? []) ids.add(id);
      if (ids.size > 0) void announceBugChange(env, [...ids]);
      else invalidateBugSnapshot();
    });
    next();
  });
  const auth = requireAuth(env);

  // GET /api/bugs
  /**
   * `product::component` -> the component's default assignee, for this caller's
   * accessible products.
   *
   * Read from the access snapshot, which is cached per user, so the hot paths
   * pay nothing extra. Returns undefined if the shape is not what we expect -
   * callers then skip the assignment split rather than failing the request over
   * a derived number.
   */
  async function componentOwners(req: Request): Promise<ComponentOwners | undefined> {
    try {
      const snapshot = await accessSnapshot(req.bugzilla!, req.sessionUser!.bzUserId);
      const owners: ComponentOwners = new Map();
      for (const product of snapshot.products) {
        const components =
          (product as { components?: Array<{ name?: string; default_assigned_to?: string }> }).components ?? [];
        for (const c of components) {
          if (c.name && c.default_assigned_to) {
            owners.set(componentOwnerKey(product.name, c.name), c.default_assigned_to.toLowerCase());
          }
        }
      }
      return owners;
    } catch {
      return undefined;
    }
  }

  /** Does this bug's assignee match its component's default owner? */
  function isQueued(
    bug: { product: string; component: string; assignedTo?: { email: string } | null },
    owners: ComponentOwners
  ): boolean {
    const owner = owners.get(componentOwnerKey(bug.product, bug.component));
    return owner !== undefined && owner === (bug.assignedTo?.email ?? '').toLowerCase();
  }

  router.get('/', auth, async (req, res, next) => {
    try {
      const query = parseInput(listBugsQuerySchema, req.query);
      const order = buildOrder(query.sortBy, query.sortDir);

      /*
       * An assignment filter cannot be pushed to Bugzilla - it depends on each
       * bug's component owner, which only this layer knows. So that case fetches
       * the whole matching set and paginates AFTER filtering; anything else
       * keeps the cheap windowed fetch.
       */
      const filteringByAssignment = query.assignment !== undefined;
      const params: Record<string, string | number> = {
        limit: filteringByAssignment ? 0 : query.limit + 1, // one extra detects a next page
        ...(filteringByAssignment ? {} : { offset: query.offset }),
        order,
      };
      applyBugFilters(params, query);

      /*
       * Same guard as the count route, for the same reason - and so the two can
       * never disagree. A list that quietly ignored an unknown status would
       * show every bug under a heading saying "Reopened".
       */
      if (query.status?.length) {
        const narrowed = await narrowStatusFilter(req.bugzilla!, query.status);
        if (narrowed === null) {
          res.json({ bugs: [], hasMore: false, limit: query.limit, offset: query.offset });
          return;
        }
        params.bug_status = narrowed as unknown as string;
      }

      /*
       * From the in-memory snapshot when the filters and sort allow it
       * (lib/bugSnapshot.ts) - the same copy, scope and filter logic the counts
       * use, so a list and the count above it cannot disagree, and a page is
       * served in milliseconds instead of a 1-2 s Bugzilla search. Free-text
       * search and CC still go to Bugzilla.
       */
      const sorter = canServeFromSnapshot(query) ? await snapshotSorter(env, query.sortBy, query.sortDir) : null;
      let raw: { bugs: unknown[] };
      if (sorter) {
        const [snap, names] = await Promise.all([
          getBugSnapshot(env),
          accessibleProductNames(req.bugzilla!, req.sessionUser!.bzUserId),
        ]);
        const effective = params.bug_status ? { ...query, status: params.bug_status as unknown as string[] } : query;
        const rows = snap.rows.filter((r) => inScope(r, names, effective) && matchesFilters(r, effective)).sort(sorter);
        const window = filteringByAssignment ? rows : rows.slice(query.offset, query.offset + query.limit + 1);
        raw = { bugs: window.map((r) => r.raw) };
      } else {
        // Scope to the caller's accessible products so instance-wide totals (dashboard, All Bugs)
        // never count another product's bugs. No-op when an explicit product filter is set.
        await scopeToAccessibleProducts(params, req.bugzilla!, req.sessionUser!.bzUserId);
        raw = await req.bugzilla!.get<{ bugs: unknown[] }>('/bug', params);
      }

      let hasMore: boolean;
      let page: ReturnType<typeof normalizeBug>[];
      if (filteringByAssignment) {
        const owners = await componentOwners(req);
        const all = raw.bugs.map((b) => normalizeBug(rawBugSchema.parse(b)));
        // No owner map means the split cannot be computed; returning everything
        // would be a silent lie, so it returns nothing and the empty state shows.
        /*
         * OPEN only, matching how `tallyBugCounts` tallies queued/picked.
         *
         * Without this the list answered a different question from the count
         * above it: the count said "6 open bugs are picked up" while the list
         * showed every bug ever assigned to a person, resolved ones included -
         * so a tile reading 6 opened a page of long-closed bugs.
         *
         * Open-only is also the honest reading of the filter. Assignment
         * describes who is carrying work NOW; on a resolved bug it is history,
         * and "who picked this up" stops being a live question once it is done.
         */
        let matching = owners
          ? all.filter(
              (bug) =>
                bug.isOpen && (query.assignment === 'queued' ? isQueued(bug, owners) : !isQueued(bug, owners))
            )
          : [];

        /*
         * `reassigned` narrows the `picked` set further to bugs with a real
         * assigned_to change in their history - the same rule the stat card
         * uses, so the tile and the list it links to cannot disagree.
         */
        if (query.assignment === 'reassigned' && matching.length > 0) {
          const changed = await reassignedBugIds(req.bugzilla!, matching.map((b) => b.id));
          matching = matching.filter((b) => changed.has(b.id));
        }
        page = matching.slice(query.offset, query.offset + query.limit);
        hasMore = matching.length > query.offset + query.limit;
      } else {
        hasMore = raw.bugs.length > query.limit;
        page = raw.bugs.slice(0, query.limit).map((b) => normalizeBug(rawBugSchema.parse(b)));
      }

      /*
       * Category needs the description, which a bug search never returns, so it
       * comes from the cached per-user id index instead of one comment fetch per
       * row. Severity/priority come straight off the bug. If the index cannot be
       * built the list still renders - rows degrade to Unclassified rather than
       * the whole page failing over a breakdown that is decoration here.
       */

      const bugs = page.map((bug) => ({
        ...bug,
        triage: {
          ...classify({
            severity: bug.severity,
            priority: bug.priority,
            whiteboard: bug.whiteboard,
            product: bug.product,
          }),
          category: categoryOf(bug.whiteboard, undefined),
        },
      }));

      res.json({
        bugs,
        pageInfo: { limit: query.limit, offset: query.offset, hasMore },
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/bugs/count
  //
  // Registered before '/:id' so the literal path wins the match. Exists because the
  // list endpoint caps `limit` at 200: counting the bugs it returns silently stops
  // being the real total the moment a product outgrows one page. This asks Bugzilla
  // for every matching bug with `limit=0` ("no limit") but only four fields, so the
  // totals and the per-status/per-severity breakdowns are genuine without pulling
  // full bug records - one upstream call serves every number on the dashboard.
  router.get('/count', auth, async (req, res, next) => {
    try {
      const query = parseInput(countBugsQuerySchema, req.query);

      const params: Record<string, string | number> = {
        limit: 0,
        // assigned_to/product/component feed the "unassigned" tally - the bugs
        // still sitting with their component's default owner.
        include_fields: 'id,is_open,status,severity,priority,assigned_to,product,component',
      };
      applyBugFilters(params, query);

      /*
       * A status this instance does not define cannot match anything - and
       * Bugzilla would DROP it rather than say so, turning the filter into "no
       * filter" and the count into the caller's whole accessible scope. That is
       * a wrong number presented as a real one, so it is answered here instead
       * of being forwarded.
       */
      if (query.status?.length) {
        const narrowed = await narrowStatusFilter(req.bugzilla!, query.status);
        if (narrowed === null) {
          res.json({ counts: tallyBugCounts([]) });
          return;
        }
        params.bug_status = narrowed as unknown as string;
      }

      /*
       * Served from the in-memory snapshot whenever the filters allow it (see
       * lib/bugSnapshot.ts): a count then costs a millisecond instead of a
       * full pass through Bugzilla's CGI layer. Free-text and CC filters
       * still go to Bugzilla. Either way the caller's accessible products
       * scope the result, so instance-wide totals never count another
       * product's bugs; an explicit product filter wins.
       */
      let rows: ReturnType<typeof bugCountRowSchema.parse>[];
      if (canServeFromSnapshot(query)) {
        const narrowedQuery = { ...query, status: params.bug_status as unknown as string[] | undefined };
        const [snap, names] = await Promise.all([
          getBugSnapshot(env),
          accessibleProductNames(req.bugzilla!, req.sessionUser!.bzUserId),
        ]);
        rows = snap.rows.filter((r) => inScope(r, names, query) && matchesFilters(r, narrowedQuery)).map(toCountRow);
      } else {
        await scopeToAccessibleProducts(params, req.bugzilla!, req.sessionUser!.bzUserId);
        const raw = await req.bugzilla!.get<{ bugs: unknown[] }>('/bug', params);
        rows = raw.bugs.map((b) => bugCountRowSchema.parse(b));
      }

      /*
       * The component default-owner map, for the unassigned tally.
       *
       * Read from the access snapshot, which is already cached per user and was
       * just populated by scopeToAccessibleProducts above - so this costs no
       * extra upstream call on the hot path.
       *
       * Best effort: if the product shapes are not what we expect, the tally is
       * simply 0 rather than the whole count failing over one derived number.
       */
      const owners = await componentOwners(req);

      const counts = tallyBugCounts(rows, owners);

      /*
       * The strict hand-off number: of the bugs whose assignee is not the
       * component default, how many were actually CHANGED rather than filed
       * that way.
       *
       * Only the candidates are looked up - typically a handful - so this is
       * one extra upstream call, and none at all when nothing qualifies.
       * Best effort: a history failure leaves the figure at 0 rather than
       * failing the whole count, because every other tile on the page depends
       * on this response.
       *
       * Computed only when the assignment filter asks for it: it is the one
       * reader, and the history call is a Bugzilla CGI round trip that would
       * otherwise be paid by every count on every dashboard card.
       */
      if (owners && query.assignment) {
        const candidates = reassignmentCandidates(rows, owners);
        if (candidates.length > 0) {
          try {
            counts.reassigned = (await reassignedBugIds(req.bugzilla!, candidates)).size;
          } catch (err) {
            console.warn('[counts] bug history unavailable; reassigned reported as 0:', err instanceof Error ? err.message : err);
          }
        }
      }
      /*
       * With an assignment filter the caller asked about ONE side of the split,
       * so `total` must describe that side rather than the whole result set -
       * otherwise the number above the list counts rows the list will not show.
       */
      if (query.assignment && owners) {
        const side =
          query.assignment === 'queued'
            ? counts.queued
            : query.assignment === 'reassigned'
              ? counts.reassigned
              : counts.picked;
        res.json({ counts: { ...counts, total: side, open: side } });
        return;
      }
      res.json({ counts });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Everything both exports need, gathered once: every matching bug (same filters, sort and access
   * scoping as the list) with its full description, latest comment, proof files and the TEXT of its
   * evidence files. Not wrapped in a fallback — a sheet that quietly lost its description or evidence
   * on a Bugzilla hiccup would read as "this bug has no evidence". Better to fail loudly and retry.
   */
  async function collectExport(
    req: Request,
    progress?: CollectProgress
  ): Promise<{ bugs: ExportBug[]; ctx: ExportContext; stamp: string }> {
    const query = parseInput(exportBugsQuerySchema, req.query);
    const signal = progress?.signal;
    progress?.report('Finding the matching bugs', 0);

    const params: Record<string, string | number> = {
      limit: EXPORT_MAX_ROWS,
      order: buildOrder(query.sortBy, query.sortDir),
    };
    applyBugFilters(params, query);
    await scopeToAccessibleProducts(params, req.bugzilla!, req.sessionUser!.bzUserId);

    const raw = await req.bugzilla!.get<{ bugs: unknown[] }>('/bug', params);

    if (raw.bugs.length >= EXPORT_MAX_ROWS) {
      throw new AppError(
        400,
        'VALIDATION',
        `This export matches ${EXPORT_MAX_ROWS.toLocaleString('en-US')} or more bugs, which is Bugzilla's search limit, ` +
          'so the file would be incomplete. Narrow the filters (for example by product or status) and export again.'
      );
    }

    throwIfCancelled(signal);
    const normalized = raw.bugs.map((b) => normalizeBug(rawBugSchema.parse(b)));
    const ids = normalized.map((b) => b.id);

    // Comments and attachments are read in parallel; their progress is summed into one step.
    const step = { comments: 0, files: 0 };
    const reading = () =>
      progress?.report('Reading comments and attachments', 0.1 + 0.45 * ((step.comments + step.files) / Math.max(1, 2 * ids.length)), Math.round((step.comments + step.files) / 2), ids.length);
    reading();
    const [commentInfo, proofInfo] = await Promise.all([
      fetchDescriptions(req.bugzilla!, ids, { signal, onProgress: (done) => ((step.comments = done), reading()) }),
      fetchAttachments(req.bugzilla!, ids, { signal, onProgress: (done) => ((step.files = done), reading()) }),
    ]);
    const textEvidence = await fetchTextEvidence(req.bugzilla!, proofInfo, {
      signal,
      onProgress: (done, total) => progress?.report('Reading evidence files', 0.55 + 0.45 * (total ? done / total : 1), done, total),
    });
    throwIfCancelled(signal);

    const bugs: ExportBug[] = normalized.map((bug) => {
      const triage = classify({
        severity: bug.severity,
        priority: bug.priority,
        whiteboard: bug.whiteboard,
        product: bug.product,
      });
      const info = commentInfo.get(bug.id);
      return {
        ...bug,
        triage: {
          severity: triage.severity,
          priority: triage.priority,
          category: categoryOf(bug.whiteboard, undefined),
          browsers: triage.browsers,
          source: triage.source,
          testType: triage.testType,
        },
        report: info?.description ? parseDefectReport(info.description) : EMPTY_REPORT,
        description: info?.description,
        lastComment: info?.lastComment,
        history: info?.history,
        proof: proofInfo.get(bug.id) ?? [],
        evidenceText: textEvidence.get(bug.id),
      };
    });

    const filters = EXPORT_FILTER_LABELS.flatMap(([key, label]) => {
      // Sub-components travel as stored values (`Login [42]`); the sheet names them.
      const value = key === 'subcomponent' ? query.subcomponent?.map((v) => subcomponentName(v) || 'None') : query[key];
      const text = Array.isArray(value) ? value.join(', ') : value;
      return text ? [{ label, value: String(text) }] : [];
    });

    /*
     * The date range is what makes a sheet a "monthly" or "daily" report, so it is stated in the
     * Export info sheet and carried in the file name: `bugs-created-2026-10-01_to_2026-10-31-…xlsx`
     * reads as October's report in a folder of them, without opening each one.
     */
    const dateWord = query.dateField === 'updated' ? 'updated' : 'created';
    let range = '';
    if (query.from || query.to) {
      const [from, to] = query.from && query.to && query.from > query.to ? [query.to, query.from] : [query.from, query.to];
      const text = from && to ? (from === to ? from : `${from} to ${to}`) : from ? `on or after ${from}` : `on or before ${to}`;
      filters.unshift({ label: dateWord === 'created' ? 'Created' : 'Last updated', value: text });
      range = `-${dateWord}-${from && to ? (from === to ? from : `${from}_to_${to}`) : from ? `from-${from}` : `until-${to}`}`;
    }

    const user = req.sessionUser!;
    // The sheet is opened on OTHER machines: links must use the app's network address, never whatever
    // this user happened to type (often "localhost", which on a developer's machine points at nothing).
    const origin = env.PUBLIC_APP_URL ?? appOriginOf(req.get('origin'), req.get('referer'));
    const proofLinksUntil = new Date(Date.now() + env.PROOF_LINK_DAYS * 86_400_000);
    return {
      bugs,
      ctx: {
        exportedBy: user.realName ? `${user.realName} <${user.email}>` : user.email,
        filters,
        appOrigin: origin,
        proofLink: origin
          ? (bugId: number) =>
              `${origin}/api/proof/bug/${bugId}?${proofQueryString(
                signProof(proofSecret(env), 'bug', bugId, bugId, proofLinksUntil.getTime())
              )}`
          : undefined,
        proofLinksUntil: origin ? proofLinksUntil : undefined,
      },
      stamp: `${range.slice(1) ? `${range.slice(1)}-` : ''}${new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')}`,
    };
  }

  /*
   * GET /api/bugs/export - the filtered bug list as an Excel workbook.
   *
   * Registered before '/:id' so the literal path wins the match.
   *
   * Takes exactly the list's filters and sort, and exports EVERY matching bug -
   * not the 20 on screen. Text only (no embedded pictures), so the file stays small
   * enough to hand to Claude, which reads every cell — descriptions, curl, server
   * replies and the text of every evidence file.
   */
  router.get('/export', auth, async (req, res, next) => {
    try {
      const { bugs, ctx, stamp } = await collectExport(req);
      const buffer = await buildBugWorkbook(bugs, ctx);
      res
        .status(200)
        .set({
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="bugs-${stamp}.xlsx"`,
          'Content-Length': String(buffer.length),
          // The file holds access-scoped data for one user; never let a proxy keep a copy.
          'Cache-Control': 'no-store',
          'X-Export-Rows': String(bugs.length),
        })
        .send(buffer);
    } catch (err) {
      next(err);
    }
  });

  /*
   * The evidence pack (.zip), in two steps so people can SEE it progressing:
   *
   *   1. POST /api/bugs/export-pack/jobs            start building it on the server   → { jobId }
   *      GET  /api/bugs/export-pack/jobs/:jobId     progress → { status, phase, done, total, sizeBytes }
   *   2. GET  /api/bugs/export-pack/jobs/:jobId/download
   *      the finished file WITH its size, so the browser's own download bar shows % and time left.
   *
   * Streaming it straight out (the first version) meant minutes of nothing — the browser shows no
   * download until the first byte — and then no percentage, because a streamed zip has no known size.
   *
   * Contents:
   *   bugs-<stamp>.xlsx          the sheet, with each bug's newest screenshot as a thumbnail
   *   bug-<id>/BUG-<id>.md       the bug's full description + latest comment, as readable text
   *   bug-<id>/<file>            every non-obsolete attachment (screenshots, videos, evidence files)
   *
   * Built straight from Bugzilla, never from the test bench's local files. The zip is a temporary file:
   * deleted as soon as it has been downloaded, or after PACK_TTL_MS if nobody collects it.
   */
  /** A cancelled job ends quietly; anything else is reported as a failure the person can retry. */
  function finishWithError(job: PackJob, err: unknown, what: string): void {
    if (job.file) void unlink(job.file).catch(() => undefined);
    if (err instanceof ExportCancelled || job.controller.signal.aborted) {
      job.status = 'cancelled';
      job.phase = 'Cancelled';
      return;
    }
    job.status = 'failed';
    job.error = err instanceof AppError ? err.message : `The ${what} could not be built. Please try again.`;
  }

  /** The Excel sheet as a background job, so it can show progress and be cancelled. */
  async function buildSheet(req: Request, job: PackJob): Promise<void> {
    const signal = job.controller.signal;
    try {
      const { bugs, ctx, stamp } = await collectExport(req, { signal, report: band(job, 0, 90) });
      job.phase = 'Building the Excel sheet';
      job.done = bugs.length;
      job.total = bugs.length;
      job.percent = 92;
      const workbook = await buildBugWorkbook(bugs, ctx);
      throwIfCancelled(signal);

      await mkdir(PACK_DIR, { recursive: true });
      const file = path.join(PACK_DIR, `${job.id}.xlsx`);
      job.file = file;
      await new Promise<void>((resolve, reject) => {
        const out = createWriteStream(file);
        out.on('error', reject);
        out.end(workbook, resolve);
      });
      throwIfCancelled(signal);

      job.rows = bugs.length;
      job.fileName = `bugs-${stamp}.xlsx`;
      job.sizeBytes = (await stat(file)).size;
      job.phase = 'Ready to download';
      job.percent = 100;
      job.status = 'ready';
    } catch (err) {
      finishWithError(job, err, 'spreadsheet');
    }
  }

  async function buildPack(req: Request, job: PackJob): Promise<void> {
    const signal = job.controller.signal;
    try {
      const { bugs, ctx, stamp } = await collectExport(req, { signal, report: band(job, 0, 30) });
      job.total = bugs.length;

      // Thumbnails: the newest image per bug, capped so the sheet stays openable.
      job.phase = 'Collecting screenshots for the sheet';
      const thumbnails = new Map<number, { buffer: Buffer; extension: 'png' | 'jpeg' }>();
      const thumbProgress = band(job, 30, 45);
      for (const [i, bug] of bugs.entries()) {
        throwIfCancelled(signal);
        thumbProgress('Collecting screenshots for the sheet', (i + 1) / bugs.length, i + 1, bugs.length);
        const image = bug.proof?.find(
          (p) => /^image\/(png|jpe?g)$/i.test(p.contentType) && p.size <= THUMBNAIL_MAX_BYTES
        );
        if (!image) continue;
        const buffer = await fetchAttachmentData(req.bugzilla!, image.id).catch(() => null);
        if (buffer) thumbnails.set(bug.id, { buffer, extension: /png$/i.test(image.contentType) ? 'png' : 'jpeg' });
      }

      job.phase = 'Building the Excel sheet';
      job.done = 0;
      job.percent = Math.max(job.percent, 46);
      const workbook = await buildBugWorkbook(bugs, { ...ctx, thumbnails });
      throwIfCancelled(signal);

      job.phase = 'Packing every proof file';
      const packProgress = band(job, 50, 99);
      await mkdir(PACK_DIR, { recursive: true });
      const file = path.join(PACK_DIR, `${job.id}.zip`);
      job.file = file;
      const out = createWriteStream(file);
      const archive = archiver('zip', { zlib: { level: 6 } });
      const written = new Promise<void>((resolve, reject) => {
        out.on('close', resolve);
        out.on('error', reject);
        archive.on('error', reject);
      });
      // Observed here as well as awaited below: a cancel throws before the await, and an archive
      // error after that point must not become an unhandled rejection that takes the server down.
      written.catch(() => undefined);
      archive.on('warning', () => undefined);
      archive.pipe(out);

      archive.append(workbook, { name: `bugs-${stamp}.xlsx` });
      for (const [i, bug] of bugs.entries()) {
        if (signal.aborted) {
          archive.abort();
          throw new ExportCancelled('cancelled');
        }
        packProgress('Packing every proof file', (i + 1) / bugs.length, i + 1, bugs.length);
        const folder = `bug-${bug.id}`;
        archive.append(bugMarkdown(bug), { name: `${folder}/BUG-${bug.id}.md` });
        for (const proof of bug.proof ?? []) {
          if (!inPack(bug, proof)) continue;
          const data = await fetchAttachmentData(req.bugzilla!, proof.id).catch(() => null);
          if (!data) continue;
          archive.append(data, {
            name: `${folder}/${safeFileName(proof.fileName, proof.id)}`,
            date: new Date(proof.createdAt),
          });
          // One attachment in memory at a time: wait for the archiver to take it before fetching the next.
          await new Promise<void>((resolve) => archive.once('entry', () => resolve()));
        }
      }
      await archive.finalize();
      await written;

      throwIfCancelled(signal);
      job.fileName = `bug-evidence-${stamp}.zip`;
      job.sizeBytes = (await stat(file)).size;
      job.phase = 'Ready to download';
      job.percent = 100;
      job.status = 'ready';
    } catch (err) {
      finishWithError(job, err, 'evidence pack');
    }
  }

  /** The caller's own pack job, or a 404 — one user can never see or download another user's pack. */
  function ownJob(req: Request): PackJob {
    const { jobId } = parseInput(z.object({ jobId: z.string().uuid() }), req.params);
    const job = packJobs.get(jobId);
    if (!job || job.userId !== req.sessionUser!.bzUserId) {
      throw new AppError(404, 'NOT_FOUND', 'That export was not found — it may have expired or been cancelled. Start a new one.');
    }
    return job;
  }

  /** Starts an export job of either kind. Bad filters are rejected now, not as a broken download later. */
  function startJob(req: Request, kind: PackJob['kind']): PackJob {
    parseInput(exportBugsQuerySchema, req.query);
    sweepPackJobs();
    // One export of each kind per person at a time: a second click cancels the first rather than
    // doubling the load on Bugzilla for a file nobody will collect.
    for (const other of packJobs.values()) {
      if (other.userId === req.sessionUser!.bzUserId && other.kind === kind && other.status === 'preparing') {
        other.controller.abort();
      }
    }
    const job: PackJob = {
      id: randomUUID(),
      kind,
      userId: req.sessionUser!.bzUserId,
      status: 'preparing',
      phase: 'Finding the matching bugs',
      done: 0,
      total: 0,
      percent: 0,
      createdAt: Date.now(),
      controller: new AbortController(),
    };
    packJobs.set(job.id, job);
    return job;
  }

  // POST /api/bugs/export/jobs - the Excel sheet, built in the background (progress + cancel).
  router.post('/export/jobs', auth, async (req, res, next) => {
    try {
      const job = startJob(req, 'xlsx');
      res.status(202).json({ jobId: job.id });
      void buildSheet(req, job);
    } catch (err) {
      next(err);
    }
  });

  router.post('/export-pack/jobs', auth, async (req, res, next) => {
    try {
      const job = startJob(req, 'zip');
      res.status(202).json({ jobId: job.id });
      void buildPack(req, job);
    } catch (err) {
      next(err);
    }
  });

  router.get('/export-pack/jobs/:jobId', auth, (req, res, next) => {
    try {
      const job = ownJob(req);
      res.set('Cache-Control', 'no-store').json({
        kind: job.kind,
        status: job.status,
        phase: job.phase,
        done: job.done,
        total: job.total,
        percent: job.percent,
        rows: job.rows ?? null,
        sizeBytes: job.sizeBytes ?? null,
        error: job.error ?? null,
      });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/bugs/export-pack/jobs/:jobId - cancel. The build stops before its next Bugzilla
  // call, and any partial file is removed. Cancelling a finished job just discards its file.
  router.delete('/export-pack/jobs/:jobId', auth, (req, res, next) => {
    try {
      const job = ownJob(req);
      job.controller.abort();
      if (job.status === 'ready') {
        if (job.file) void unlink(job.file).catch(() => undefined);
        packJobs.delete(job.id);
      } else if (job.status === 'preparing') {
        job.status = 'cancelled';
        job.phase = 'Cancelled';
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.get('/export-pack/jobs/:jobId/download', auth, (req, res, next) => {
    try {
      const job = ownJob(req);
      if (job.status !== 'ready' || !job.file || !job.fileName) {
        throw new AppError(409, 'CONFLICT', 'This export is not ready yet.');
      }
      const file = job.file;
      // res.download sends Content-Length, so the browser shows a real progress bar. The temp file is
      // removed once it has been sent (or the transfer fails) — nothing is kept on this server.
      res.download(file, job.fileName, { headers: { 'Cache-Control': 'no-store' } }, () => {
        packJobs.delete(job.id);
        void unlink(file).catch(() => undefined);
      });
    } catch (err) {
      next(err);
    }
  });

  /*
   * GET /api/bugs/stats - every dashboard/report breakdown in one call.
   *
   * Registered before '/:id' so the literal path wins the match.
   *
   * Deliberately not one query per cell: a severity x category matrix is 16
   * cells, and asking Bugzilla 16 times would make the dashboard the slowest
   * page in the app. Instead this is *one* search returning four fields for
   * every matching bug, joined against the cached per-user category index -
   * five upstream calls on a cold cache, one on a warm one, regardless of how
   * many cells the matrix has.
   */
  router.get('/stats', auth, async (req, res, next) => {
    try {
      const query = parseInput(countBugsQuerySchema, req.query);

      const params: Record<string, unknown> = {
        limit: 0,
        include_fields: 'id,severity,priority,status,resolution,component,cf_subcomponent,product,whiteboard,is_open,assigned_to',
      };
      applyBugFilters(params, query);

      /*
       * From the in-memory snapshot when the filters allow (lib/bugSnapshot.ts);
       * otherwise the Bugzilla search as before. Both are scoped to the
       * caller's accessible products (an explicit product filter wins).
       *
       * Category is read straight from each bug's whiteboard tag: every bug on
       * this instance carries one (verified 2026-10-20: 0 untagged of 13,171),
       * so the ten-query category index that used to be rebuilt per user per
       * minute is no longer consulted here.
       */
      let raw: { bugs: StatsRow[] };
      let builtAt = Date.now();
      if (canServeFromSnapshot(query)) {
        const [snap, names] = await Promise.all([
          getBugSnapshot(env),
          accessibleProductNames(req.bugzilla!, req.sessionUser!.bzUserId),
        ]);
        builtAt = snap.builtAt;
        raw = {
          bugs: snap.rows
            .filter((r) => inScope(r, names, query) && matchesFilters(r, query))
            .map((r) => ({
              id: r.id,
              severity: r.severity,
              priority: r.priority,
              status: r.status,
              component: r.component,
              cf_subcomponent: r.subcomponent,
              product: r.product,
              resolution: r.resolution,
              whiteboard: r.whiteboard,
              is_open: r.isOpen,
              assigned_to: r.assignedTo,
            })),
        };
      } else {
        await scopeToAccessibleProducts(params, req.bugzilla!, req.sessionUser!.bzUserId);
        raw = await req.bugzilla!.get<{ bugs: StatsRow[] }>('/bug', params as Record<string, string | number>);
      }

      const bySeverity = zeroed(SEVERITIES);
      const byCategory = zeroed(CATEGORIES);
      const byComponent: Record<string, number> = {};
      const matrix = Object.fromEntries(SEVERITIES.map((s) => [s, zeroed(CATEGORIES)])) as Record<
        Severity,
        Record<Category, number>
      >;

      /*
       * The same four breakdowns, restricted to bugs that are still open.
       *
       * Both sets are needed and they answer different questions. The all-bugs
       * tallies belong beside a filter option: an option reading "Critical (46)"
       * that returns 75 rows once the status filter is cleared misdescribes its
       * own result set. The open-only tallies are what a *defect load* dashboard
       * means - how much is broken now.
       *
       * Reporting the lifetime figure as current load is why this endpoint read
       * wrong on 2026-08-24. 177 bugs had been resolved, yet "Critical (P0)"
       * still showed 75 - every bug ever filed at that severity - while only 46
       * were open. The Open tile moved and nothing else did, so an afternoon of
       * closing tickets looked like it had changed nothing.
       */
      const openBySeverity = zeroed(SEVERITIES);
      const openByCategory = zeroed(CATEGORIES);
      const openByComponent: Record<string, number> = {};
      // Keyed by stored value (`Login [42]`, or `---` for none) - unambiguous across components.
      const bySubcomponent: Record<string, number> = {};
      /*
       * Per-value counts for the remaining filter facets, so every dropdown can
       * list only the values present in the current view, each with its count.
       * Resolution uses the filter's own spelling: 'Unresolved' for an open bug.
       */
      const byProduct: Record<string, number> = {};
      const byStatus: Record<string, number> = {};
      const byResolution: Record<string, number> = {};
      const byPriority: Record<string, number> = {};
      const openBySubcomponent: Record<string, number> = {};
      const openMatrix = Object.fromEntries(SEVERITIES.map((s) => [s, zeroed(CATEGORIES)])) as Record<
        Severity,
        Record<Category, number>
      >;

      /*
       * Browser counts, from the whiteboard this endpoint already fetches - no
       * extra upstream call. Deliberately NOT pre-seeded with the known project
       * names: an absent key means "no bug in this scope was seen on it", which
       * is what lets the filter bar hide the Browser control entirely for an
       * API-only scope rather than offering four options that all return zero.
       *
       * A bug naming several browsers counts once per browser, so these tally
       * higher than the bug count. They size a filter option, not the result set.
       */
      const byBrowser: Record<string, number> = {};
      const openByBrowser: Record<string, number> = {};
      // Automation vs Manual, sizing the Source filter's two options.
      const bySource = zeroed(SOURCES);
      const openBySource = zeroed(SOURCES);
      // Bugs per assignee (lower-cased login), so the developer picker can show
      // each person's load without one count request per developer.
      const byAssignee: Record<string, number> = {};
      const openByAssignee: Record<string, number> = {};

      let open = 0;
      for (const row of raw.bugs) {
        const assignee = (row.assigned_to ?? '').toLowerCase();
        if (assignee) {
          byAssignee[assignee] = (byAssignee[assignee] ?? 0) + 1;
          if (row.is_open) openByAssignee[assignee] = (openByAssignee[assignee] ?? 0) + 1;
        }
        byProduct[row.product] = (byProduct[row.product] ?? 0) + 1;
        byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
        const resolutionKey = row.resolution ? row.resolution : 'Unresolved';
        byResolution[resolutionKey] = (byResolution[resolutionKey] ?? 0) + 1;
        const { severity, source, priority } = classify({
          severity: row.severity,
          priority: row.priority,
          whiteboard: row.whiteboard,
          product: row.product,
        });
        bySource[source] += 1;
        byPriority[priority] = (byPriority[priority] ?? 0) + 1;
        if (row.is_open) openBySource[source] += 1;
        const category = categoryOf(row.whiteboard, undefined);
        bySeverity[severity] += 1;
        byCategory[category] += 1;
        matrix[severity][category] += 1;
        byComponent[row.component] = (byComponent[row.component] ?? 0) + 1;
        const sub = row.cf_subcomponent || NO_SUBCOMPONENT;
        bySubcomponent[sub] = (bySubcomponent[sub] ?? 0) + 1;
        const browsers = browsersOf(row.whiteboard);
        for (const browser of browsers) byBrowser[browser] = (byBrowser[browser] ?? 0) + 1;
        if (row.is_open) {
          open += 1;
          openBySeverity[severity] += 1;
          openByCategory[category] += 1;
          openMatrix[severity][category] += 1;
          openByComponent[row.component] = (openByComponent[row.component] ?? 0) + 1;
          openBySubcomponent[sub] = (openBySubcomponent[sub] ?? 0) + 1;
          for (const browser of browsers) openByBrowser[browser] = (openByBrowser[browser] ?? 0) + 1;
        }
      }

      res.json({
        total: raw.bugs.length,
        open,
        resolved: raw.bugs.length - open,
        bySeverity,
        byCategory,
        byComponent,
        bySubcomponent,
        byProduct,
        byStatus,
        byResolution,
        byPriority,
        byBrowser,
        bySource,
        byAssignee,
        openByAssignee,
        matrix,
        openBySeverity,
        openByCategory,
        openByComponent,
        openBySubcomponent,
        openByBrowser,
        openBySource,
        openMatrix,
        cachedAt: new Date(builtAt).toISOString(),
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/bugs/comment-tags?q=ui - tags already in use, for the tag input's suggestions.
  // Registered before '/:id' so it is not read as a bug id.
  router.get('/comment-tags', auth, async (req, res, next) => {
    try {
      const { q } = parseInput(z.object({ q: z.string().trim().min(1).max(24).regex(/^[^\s,/]+$/) }), req.query);
      const tags = await req.bugzilla!.get<string[]>(`/bug/comment/tags/${encodeURIComponent(q)}`, { limit: 10 });
      res.json({ tags: Array.isArray(tags) ? tags : [] });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/bugs/:id
  router.get('/:id', auth, async (req, res, next) => {
    try {
      const { id } = parseInput(idParamSchema, req.params);
      const client = req.bugzilla!;

      const [bugResp, commentResp, attachmentResp] = await Promise.all([
        client.get<{ bugs: unknown[] }>(`/bug/${id}`),
        client.get<{ bugs: Record<string, { comments: unknown[] }> }>(`/bug/${id}/comment`),
        client.get<{ bugs: Record<string, unknown[]> }>(`/bug/${id}/attachment`, { exclude_fields: 'data' }),
      ]);

      const bug = normalizeBug(rawBugSchema.parse(bugResp.bugs[0]));
      const rawComments = commentResp.bugs[String(id)]?.comments ?? [];
      const parsedComments = rawComments
        .map((c) => normalizeComment(rawCommentSchema.parse(c)))
        .sort((a, b) => a.count - b.count);
      // The newest report revision, if the report was ever edited - else the original description.
      const report = effectiveReport(parsedComments);
      const description = report.text;

      const rawAttachments = attachmentResp.bugs[String(id)] ?? [];
      const parsedAttachments = rawAttachments.map((a) => normalizeAttachment(rawAttachmentSchema.parse(a)));

      /*
       * Comments and attachments arrive carrying only a login (`jagan@kpost.in`),
       * while the bug header carries a full `creator_detail` with a real name.
       * Rendering each as it arrives put "Jaganathan Murthy" in the sidebar and
       * his e-mail address on every comment and attachment right beside it.
       * Resolve both through the same lookup so one page refers to a person one
       * way. See `lib/displayNames.ts` for why Bugzilla makes this necessary.
       */
      const names = await resolveDisplayNames(client, [
        ...parsedComments.map((c) => c.author),
        ...parsedAttachments.map((a) => a.creator),
      ]);
      const comments = parsedComments.map((c) => ({
        ...c,
        author: displayNameFor(names, c.author),
        // Revisions are shown as "edited the report" entries, with the version they hold.
        isReportRevision: isReportRevision(c.text),
        text: stripRevision(c.text),
      }));
      const lastEdit = report.latestRevision
        ? comments.find((c) => c.id === (report.latestRevision as { id: number }).id)
        : undefined;
      const attachments = parsedAttachments.map((a) => ({
        ...a,
        creator: displayNameFor(names, a.creator),
        canDelete: canDeleteAttachment(req, a.creator),
      }));

      /*
       * The detail view has the description in hand, so classification and the
       * grouping block are both resolved directly here - no category index, and
       * no regex in the browser. A bug filed before grouping existed returns an
       * explicit empty shape (isGrouped false, endpoints []), never a partial one.
       */
      const facts = parseDescription(description);
      const classification = classify({
        severity: bug.severity,
        priority: bug.priority,
        whiteboard: bug.whiteboard,
        description,
        product: bug.product,
      });

      /*
       * Visibility groups the editor may offer: the ones already on the bug plus
       * the product's own same-named group. Bugzilla's REST API does not expose
       * a product's group controls, and on this instance each product's bugs are
       * restricted by exactly that one group - so listing every group would
       * mostly offer choices Bugzilla then refuses.
       */
      const productGroup = groupNameForProduct(bug.product, await allGroupNames(env));
      // The deletion group is managed by Delete/Restore, never ticked by hand.
      const availableGroups = [...new Set([...bug.groups, ...(productGroup ? [productGroup] : [])])].filter(
        (g) => g !== DELETED_GROUP
      );
      const deleted = bug.resolution === DELETED_RESOLUTION ? deletedInfoFrom(comments) : null;

      res.json({
        bug: {
          ...bug,
          description,
          triage: classification,
          grouping: facts.grouping,
          facts,
          availableGroups,
          isDeleted: bug.resolution === DELETED_RESOLUTION,
          deleted,
          reportHistory: {
            revisions: report.revisions.length,
            lastEditedBy: lastEdit?.author ?? null,
            lastEditedAt: lastEdit?.creationTime ?? null,
          },
        },
        comments,
        attachments,
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/bugs/:id/attachments/:attachmentId  (binary, streamed)
  // Video and image attachments are served `inline` by default so the browser
  // can play/render them directly; everything else (traces, unknown binaries)
  // defaults to `attachment` since there's nothing useful to render inline.
  // Pass ?download=1 to force a save-as regardless of content type.
  router.get('/:id/attachments/:attachmentId', auth, async (req, res, next) => {
    try {
      const { attachmentId } = parseInput(z.object({ attachmentId: z.coerce.number().int().positive() }), req.params);
      const forceDownload = req.query.download === '1';
      const client = req.bugzilla!;
      const resp = await client.get<{
        attachments: Record<string, { data: string; file_name: string; content_type: string }>;
      }>(`/bug/attachment/${attachmentId}`);
      const attachment = resp.attachments[String(attachmentId)];
      if (!attachment) {
        throw new AppError(404, 'NOT_FOUND', 'That attachment could not be found.');
      }
      const buffer = Buffer.from(attachment.data, 'base64');
      const contentType = attachment.content_type || 'application/octet-stream';
      const isInlineViewable = /^(video|image)\//.test(contentType);
      const disposition = !forceDownload && isInlineViewable ? 'inline' : 'attachment';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(attachment.file_name)}"`);
      res.setHeader('Content-Length', String(buffer.length));
      res.setHeader('Accept-Ranges', 'bytes');
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/bugs/:id/attachments  - one evidence file (screenshot, video, log) per request.
  router.post('/:id/attachments', auth, async (req, res, next) => {
    try {
      const { id } = parseInput(z.object({ id: z.coerce.number().int().positive() }), req.params);
      const input = parseInput(createAttachmentSchema, req.body);
      const created = await req.bugzilla!.post<{ ids: number[] }>(`/bug/${id}/attachment`, {
        ids: [id],
        data: input.data,
        file_name: input.fileName,
        content_type: input.contentType,
        summary: input.summary || input.fileName,
      });
      res.status(201).json({ ids: created.ids });
    } catch (err) {
      next(err);
    }
  });

  /*
   * POST /api/bugs/:id/attachments/upload - one file, sent as the raw request body.
   *
   * The JSON route above needs the browser to base64 the file first (a third bigger, held in
   * memory twice) and caps it at 15 MB, which most screen recordings exceed. Here the body is the
   * file itself, so the browser can report real upload progress, and the cap is Bugzilla's own
   * `maxattachmentsize` (50 MB on this instance). Metadata rides in headers:
   *   Content-Type    the file's type          X-File-Name  the name, URI-encoded
   *   X-Summary       description (optional)   X-Comment    a comment to post with it (optional)
   */
  router.post(
    '/:id/attachments/upload',
    auth,
    express.raw({ type: () => true, limit: '60mb' }),
    async (req, res, next) => {
      try {
        const { id } = parseInput(idParamSchema, req.params);
        const client = req.bugzilla!;
        const body = req.body as Buffer;
        if (!Buffer.isBuffer(body) || body.length === 0) {
          throw new AppError(400, 'VALIDATION', 'The file is empty.');
        }
        const { maxAttachmentKb } = await bugFeatures(env);
        if (body.length > maxAttachmentKb * 1024) {
          throw new AppError(
            413,
            'VALIDATION',
            `That file is ${(body.length / 1024 / 1024).toFixed(1)} MB; Bugzilla accepts up to ${Math.round(maxAttachmentKb / 1024)} MB per file.`
          );
        }

        const header = (name: string) => {
          const raw = req.get(name);
          if (!raw) return '';
          try {
            return decodeURIComponent(raw).trim();
          } catch {
            return raw.trim();
          }
        };
        // Only the base name: a path in the name would end up in Bugzilla and in exported zips.
        const fileName = header('X-File-Name').split(/[\\/]/).pop()?.slice(0, 255) || 'attachment';
        const summary = header('X-Summary').slice(0, 255) || fileName;
        const comment = header('X-Comment').slice(0, 65535);
        const contentType = /^[\w.+-]+\/[\w.+-]+/.exec(req.get('Content-Type') ?? '')?.[0] ?? 'application/octet-stream';

        const current = await client.get<{ bugs: { resolution: string }[] }>(`/bug/${id}`, { include_fields: 'resolution' });
        if (!current.bugs[0]) throw new AppError(404, 'NOT_FOUND', 'That bug could not be found.');
        if (current.bugs[0].resolution === DELETED_RESOLUTION) {
          throw new AppError(409, 'CONFLICT', 'This bug is deleted. Restore it before adding files.');
        }

        const created = await client.post<{ ids: number[] }>(`/bug/${id}/attachment`, {
          ids: [id],
          data: body.toString('base64'),
          file_name: fileName,
          content_type: contentType,
          summary,
          ...(comment ? { comment } : {}),
        });
        const attachmentId = created.ids?.[0];
        const after = await client.get<{ attachments: Record<string, unknown> }>(`/bug/attachment/${attachmentId}`, {
          exclude_fields: 'data',
        });
        const attachment = normalizeAttachment(rawAttachmentSchema.parse(after.attachments[String(attachmentId)]));
        const names = await resolveDisplayNames(client, [attachment.creator]);
        res.status(201).json({
          attachment: { ...attachment, creator: displayNameFor(names, attachment.creator), canDelete: canDeleteAttachment(req, attachment.creator) },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // PATCH /api/bugs/:id/attachments/:attachmentId - description, file name, type, obsolete/patch/private.
  router.patch('/:id/attachments/:attachmentId', auth, async (req, res, next) => {
    try {
      const { id, attachmentId } = parseInput(
        z.object({ id: z.coerce.number().int().positive(), attachmentId: z.coerce.number().int().positive() }),
        req.params
      );
      const input = parseInput(updateAttachmentSchema, req.body);
      const client = req.bugzilla!;

      /*
       * The attachment id alone selects what Bugzilla changes, so confirm it
       * belongs to the bug in the URL. Otherwise a request "for bug 5" could
       * edit an attachment on any bug the caller can reach, and the bug page it
       * came from would show nothing changed.
       */
      const found = await client.get<{ attachments: Record<string, { bug_id: number }> }>(
        `/bug/attachment/${attachmentId}`,
        { include_fields: 'bug_id' }
      );
      if (found.attachments[String(attachmentId)]?.bug_id !== id) {
        throw new AppError(404, 'NOT_FOUND', 'That attachment is not on this bug.');
      }
      if (input.isPrivate !== undefined && !(await bugFeatures(env)).privateComments) {
        throw new AppError(400, 'VALIDATION', 'Private attachments are not enabled on this Bugzilla.');
      }

      await client.put(`/bug/attachment/${attachmentId}`, {
        ids: [attachmentId],
        ...(input.summary !== undefined ? { summary: input.summary } : {}),
        ...(input.fileName !== undefined ? { file_name: input.fileName } : {}),
        ...(input.contentType !== undefined ? { content_type: input.contentType } : {}),
        ...(input.isObsolete !== undefined ? { is_obsolete: input.isObsolete } : {}),
        ...(input.isPatch !== undefined ? { is_patch: input.isPatch } : {}),
        ...(input.isPrivate !== undefined ? { is_private: input.isPrivate } : {}),
        ...(input.comment ? { comment: input.comment } : {}),
      });

      const after = await client.get<{ attachments: Record<string, unknown> }>(`/bug/attachment/${attachmentId}`, {
        exclude_fields: 'data',
      });
      const attachment = normalizeAttachment(rawAttachmentSchema.parse(after.attachments[String(attachmentId)]));
      const names = await resolveDisplayNames(client, [attachment.creator]);
      res.json({
        attachment: { ...attachment, creator: displayNameFor(names, attachment.creator), canDelete: canDeleteAttachment(req, attachment.creator) },
      });
    } catch (err) {
      next(err);
    }
  });

  /*
   * DELETE /api/bugs/:id/attachments/:attachmentId - removes the file for good
   * (hard delete in the database, through the AttachmentDelete extension), so a
   * wrong upload can be replaced with the right one. Sent with the caller's own
   * key: the extension also allows only the uploader or a user administrator,
   * and checks the caller can see the bug.
   */
  router.delete('/:id/attachments/:attachmentId', auth, async (req, res, next) => {
    try {
      const { id, attachmentId } = parseInput(
        z.object({ id: z.coerce.number().int().positive(), attachmentId: z.coerce.number().int().positive() }),
        req.params
      );
      const client = req.bugzilla!;
      // Same reasoning as PATCH: the attachment id alone selects the target.
      const found = await client.get<{ attachments: Record<string, { bug_id: number; creator: string }> }>(
        `/bug/attachment/${attachmentId}`,
        { include_fields: 'bug_id,creator' }
      );
      const target = found.attachments[String(attachmentId)];
      if (!target || target.bug_id !== id) {
        throw new AppError(404, 'NOT_FOUND', 'That attachment is not on this bug.');
      }
      if (!canDeleteAttachment(req, target.creator)) {
        throw new AppError(403, 'FORBIDDEN', 'Only the person who uploaded this file or an administrator can delete it.');
      }
      const result = await client.post<{ removed: { id: number; bug_id: number; file_name: string } }>('/attachment/remove', {
        id: attachmentId,
      });
      res.json({ removed: { id: result.removed.id, bugId: result.removed.bug_id, fileName: result.removed.file_name } });
    } catch (err) {
      next(err);
    }
  });

  // PUT /api/bugs/:id/comments/:commentId/tags - add/remove tags on one comment.
  router.put('/:id/comments/:commentId/tags', auth, async (req, res, next) => {
    try {
      const { id, commentId } = parseInput(
        z.object({ id: z.coerce.number().int().positive(), commentId: z.coerce.number().int().positive() }),
        req.params
      );
      const input = parseInput(updateCommentTagsSchema, req.body);
      const client = req.bugzilla!;

      if (!(await bugFeatures(env)).commentTags) {
        throw new AppError(400, 'VALIDATION', 'Comment tags are not enabled on this Bugzilla.');
      }
      // Same reasoning as attachments: the comment id alone selects the target.
      const found = await client.get<{ comments: Record<string, { bug_id: number }> }>(`/bug/comment/${commentId}`, {
        include_fields: 'bug_id',
      });
      if (found.comments[String(commentId)]?.bug_id !== id) {
        throw new AppError(404, 'NOT_FOUND', 'That comment is not on this bug.');
      }

      const tags = await client.put<string[]>(`/bug/comment/${commentId}/tags`, {
        comment_id: commentId,
        ...(input.add?.length ? { add: input.add } : {}),
        ...(input.remove?.length ? { remove: input.remove } : {}),
      });
      res.json({ tags: Array.isArray(tags) ? tags : [] });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/bugs
  router.post('/', auth, async (req, res, next) => {
    try {
      const input = parseInput(createBugSchema, req.body);
      const client = req.bugzilla!;

      // Must be a live sub-component of the chosen component (lib/subcomponents.ts).
      const subcomponent = input.subcomponent ? await resolveSubcomponent(env, input.product, input.component, input.subcomponent) : NO_SUBCOMPONENT;
      const payload = {
        product: input.product,
        component: input.component,
        ...(subcomponent !== NO_SUBCOMPONENT ? { cf_subcomponent: subcomponent } : {}),
        summary: input.summary,
        description: input.description ?? '',
        // Brief-mandated defaults - this Bugzilla instance requires both fields explicitly (docs/API_CONTRACT.md #7).
        version: input.version ?? 'unspecified',
        op_sys: input.opSys ?? 'All',
        platform: input.platform ?? 'All',
        ...(input.severity ? { severity: input.severity } : {}),
        ...(input.priority ? { priority: input.priority } : {}),
        // Every bug filed through this form is a person's work: tag it so the
        // Source filter and the "Manual … test" badge do not have to guess.
        status_whiteboard: withSourceTag(input.whiteboard ?? '', 'Manual'),
        /*
         * Omitted unless the filer chose someone. Bugzilla then falls back to
         * the component's `initialowner` - which is exactly what the automated
         * bench relies on, so leaving this out keeps bench filing unchanged.
         */
        ...(input.assignedTo ? { assigned_to: input.assignedTo } : {}),
      };

      const created = await client.post<{ id: number }>('/bug', payload);
      res.locals.bugIds = [created.id];

      const bugResp = await client.get<{ bugs: unknown[] }>(`/bug/${created.id}`);
      const bug = normalizeBug(rawBugSchema.parse(bugResp.bugs[0]));
      res.status(201).json({ bug });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/bugs/:id
  /**
   * PATCH /api/bugs — bulk reassignment.
   *
   * Applies one assignee to many bugs in a single Bugzilla `Bug.update` call (it accepts an id
   * array). Registered before `/:id` so the collection route is not shadowed by the item route.
   */
  router.patch('/', auth, async (req, res, next) => {
    try {
      const { ids, assignedTo } = parseInput(bulkReassignSchema, req.body);
      // All-or-nothing: Bugzilla applies the whole id array in one call, so a
      // partial success is not expressible. Refusing the batch and naming the
      // closed bugs is better than silently reassigning some of them.
      await assertReassignable(req.bugzilla!, ids, undefined, {
        email: req.sessionUser!.email,
        canReassignAny: req.sessionUser!.permissions.canReassignAny,
      });
      // Bugzilla requires an id in the URL; the body `ids` array is what selects every bug to
      // change, so all of them are updated by this one request.
      await req.bugzilla!.put(`/bug/${ids[0]}`, {
        ids,
        assigned_to: assignedTo,
      });
      res.json({ updated: ids.length });
    } catch (err) {
      next(err);
    }
  });

  /*
   * POST /api/bugs/delete and /api/bugs/restore - soft delete (see lib/softDelete.ts).
   * Testers and admins only. Bugzilla enforces the same line independently:
   * only they are members of the "Deleted bugs" group it refuses to let anyone
   * else add or remove.
   */
  const triage = requirePermission('canTriage');
  const actorName = (req: Request) => {
    const u = req.sessionUser!;
    return u.realName ? `${u.realName} (${u.email})` : u.email;
  };

  /*
   * PUT /api/bugs/:id/report - rewrite the bug report (Expected, Actual, curl, How to fix, ...).
   * Stored as a revision comment, since Bugzilla cannot edit the description itself; the category
   * goes to the whiteboard's [cat:] tag in the same update, so the history shows ONE change.
   */
  router.put('/:id/report', auth, async (req, res, next) => {
    try {
      const { id } = parseInput(idParamSchema, req.params);
      const input = parseInput(updateReportSchema, req.body);
      const client = req.bugzilla!;

      const [currentResp, commentResp] = await Promise.all([
        client.get<{ bugs: { id: number; last_change_time: string; resolution: string; whiteboard?: string }[] }>(`/bug/${id}`, {
          include_fields: 'id,last_change_time,resolution,whiteboard',
        }),
        client.get<{ bugs: Record<string, { comments: { text: string; count: number }[] }> }>(`/bug/${id}/comment`),
      ]);
      const current = currentResp.bugs[0];
      if (!current) throw new AppError(404, 'NOT_FOUND', 'That bug could not be found.');
      if (current.resolution === DELETED_RESOLUTION) {
        throw new AppError(409, 'CONFLICT', 'This bug is deleted. Restore it before editing.');
      }
      const { text: existing, revisions } = effectiveReport(commentResp.bugs[String(id)]?.comments ?? []);
      if (input.baseRevisions !== undefined && revisions.length !== input.baseRevisions) {
        throw new AppError(
          409,
          'CONFLICT',
          'Someone else edited this bug report while you were editing it. Your edits are kept - save again to replace theirs (theirs stays in the history).',
          undefined,
          { reason: 'MID_AIR_COLLISION', revisions: revisions.length }
        );
      }
      const whiteboard = current.whiteboard ?? '';
      const nextWhiteboard = input.category ? withCategoryTag(whiteboard, input.category) : whiteboard;
      const textChanged = normaliseReport(input.text) !== normaliseReport(existing);
      const categoryChanged = nextWhiteboard !== whiteboard;
      if (!textChanged && !categoryChanged) {
        throw new AppError(400, 'VALIDATION', 'Nothing changed - the report and category are the same as before.');
      }

      const report = normaliseReport(input.text);
      await client.put(`/bug/${id}`, {
        ids: [id],
        ...(categoryChanged ? { whiteboard: nextWhiteboard } : {}),
        ...(textChanged
          ? { comment: { body: revisionComment(input.note ? `${report}\n\nEdit note: ${input.note}` : report) } }
          : input.note
            ? { comment: { body: input.note } }
            : {}),
      });
      res.json({ textChanged, categoryChanged });
    } catch (err) {
      next(err);
    }
  });

  router.post('/delete', auth, triage, async (req, res, next) => {
    try {
      const { ids, reason } = parseInput(softDeleteSchema, req.body);
      const deleted = await softDeleteBugs(req.bugzilla!, [...new Set(ids)], reason, actorName(req));
      res.json({ deleted });
    } catch (err) {
      next(err);
    }
  });

  router.post('/restore', auth, triage, async (req, res, next) => {
    try {
      const { ids } = parseInput(restoreSchema, req.body);
      const client = req.bugzilla!;
      const restored = await restoreBugs(client, [...new Set(ids)], actorName(req), async (id) => {
        const resp = await client.get<{ bugs: Record<string, { comments: unknown[] }> }>(`/bug/${id}/comment`);
        return (resp.bugs[String(id)]?.comments ?? []).map((c) => {
          const n = normalizeComment(rawCommentSchema.parse(c));
          return { text: n.text, author: n.author, creationTime: n.creationTime };
        });
      });
      res.json({ restored });
    } catch (err) {
      next(err);
    }
  });

  /*
   * Cross-product transfer - see lib/productTransfer.ts for why this exists and
   * what each credential is used for. The options call answers only for a bug
   * the caller can see and may hand on, so it cannot be used to read another
   * product's component list or team on its own.
   */
  const transferRoutes = parseTransferRoutes(env.PRODUCT_TRANSFER_ROUTES);

  /*
   * Where a bug may be transferred: EVERY active product, whether or not the
   * person transferring has access to it - a developer must be able to hand a
   * bug to another team. Only the destination list widens: their own product
   * access is unchanged, the move runs on the service key, and they are CC'd so
   * they can keep following the bug. Never the bug's own product.
   */
  async function accessibleProductList(_req: Request): Promise<string[]> {
    return allProductNames(env);
  }
  function transferTargetNames(from: string, accessible: string[]): string[] {
    const byKey = new Map<string, string>();
    for (const name of [...accessible, ...transferTargetsFor(from, transferRoutes)]) {
      if (name.toLowerCase() !== from.toLowerCase()) byKey.set(name.toLowerCase(), name);
    }
    return [...byKey.values()];
  }

  router.get('/:id/transfer-options', auth, async (req, res, next) => {
    try {
      const { id } = parseInput(idParamSchema, req.params);
      const user = req.sessionUser!;
      const bug = await loadTransferableBug(req.bugzilla!, id, { email: user.email, canTriage: user.permissions.canTriage });
      const names = transferTargetNames(bug.product, await accessibleProductList(req));
      const targets = await describeTargets(directoryClient(env), names).catch((err: unknown) => {
        // Logged, not swallowed: an empty target list with no reason is undiagnosable.
        console.error(`[transfer] could not describe targets for bug ${id}:`, err instanceof Error ? err.message : err);
        return [];
      });
      res.set('Cache-Control', 'no-store').json({ from: { product: bug.product, component: bug.component }, targets });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/transfer', auth, async (req, res, next) => {
    try {
      const { id } = parseInput(idParamSchema, req.params);
      const request = parseInput(transferBugSchema, req.body);
      const user = req.sessionUser!;
      const features = await bugFeatures(env);
      const result = await transferBug({
        env,
        userClient: req.bugzilla!,
        actor: { email: user.email, realName: user.realName, canTriage: user.permissions.canTriage },
        id,
        request,
        routes: transferRoutes,
        accessibleProducts: await accessibleProductList(req),
        useTargetMilestone: features.targetMilestone,
      });
      // The bug changed product: per-user category / stats caches must not keep counting it where it was.
      clearCategoryIndex();
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', auth, async (req, res, next) => {
    try {
      const { id } = parseInput(idParamSchema, req.params);
      const input = parseInput(updateBugSchema, req.body);
      const client = req.bugzilla!;

      const [currentResp, features] = await Promise.all([
        client.get<{ bugs: CurrentBug[] }>(`/bug/${id}`, { include_fields: CURRENT_BUG_FIELDS }),
        bugFeatures(env),
      ]);
      const current = currentResp.bugs[0];
      if (!current) throw new AppError(404, 'NOT_FOUND', 'That bug could not be found.');

      await validateBugUpdate(client, current, input, features, { canTriage: req.sessionUser!.permissions.canTriage });

      const payload = toBugzillaUpdate(input);

      /*
       * Sub-component. It belongs to one component, so it is checked against the
       * bug's component AFTER this edit; moving product or component without
       * naming a new one clears it rather than leaving a value from elsewhere.
       */
      const nextProduct = input.product ?? current.product;
      const nextComponent = input.component ?? current.component;
      const movesComponent = nextProduct !== current.product || nextComponent !== current.component;
      const unchanged = !movesComponent && (input.subcomponent || NO_SUBCOMPONENT) === (current.cf_subcomponent || NO_SUBCOMPONENT);
      if (input.subcomponent !== undefined && !unchanged) {
        payload.cf_subcomponent = await resolveSubcomponent(env, nextProduct, nextComponent, input.subcomponent);
      } else if (movesComponent) {
        payload.cf_subcomponent = NO_SUBCOMPONENT;
      }

      /*
       * Resolving as DUPLICATE needs the bug being duplicated.
       *
       * Checked here rather than left to Bugzilla for two reasons. Its own
       * refusal ("You must specify a bug id to mark this bug as a duplicate
       * of") arrives as a generic error with no indication of WHICH field is
       * missing, and - more importantly - the id has to be verified anyway: a
       * bug cannot duplicate itself, and pointing at a bug that does not exist
       * or that the user cannot see produces an upstream error that reads like
       * a permissions failure rather than a typo.
       */
      if (input.resolution === DUPLICATE) {
        const target = input.dupeOf;
        if (target === undefined) {
          throw new AppError(
            400,
            'VALIDATION',
            'Resolving a bug as DUPLICATE needs the bug it duplicates. Enter that bug number in "Duplicate of".'
          );
        }
        if (target === id) {
          throw new AppError(400, 'VALIDATION', 'A bug cannot be a duplicate of itself.');
        }
        // Readable to THIS user, on their own token - so a bug they cannot see
        // is reported as not found rather than silently accepted.
        const found = await client
          .get<{ bugs: unknown[] }>('/bug', { id: target, include_fields: 'id' })
          .catch(() => ({ bugs: [] as unknown[] }));
        if (found.bugs.length === 0) {
          throw new AppError(400, 'VALIDATION', `Bug ${target} does not exist, or you do not have access to it.`);
        }
      } else if (input.dupeOf !== undefined) {
        /*
         * `dupe_of` with any other resolution is contradictory, and Bugzilla
         * silently FLIPS the resolution to DUPLICATE rather than refusing -
         * so a stray value here would quietly close the bug as a duplicate
         * while the form showed something else.
         */
        delete payload.dupe_of;
      }

      // Only guard when the assignee is actually changing: every other edit
      // (adding a resolution, correcting a component) stays legal on a closed bug.
      // "Reset to default" changes the assignee just as surely as naming one.
      if (input.assignedTo !== undefined || input.resetAssignedTo) {
        await assertReassignable(client, [id], input.status, {
          email: req.sessionUser!.email,
          canReassignAny: req.sessionUser!.permissions.canReassignAny,
        });
      }

      const result = await client.put<{
        bugs: { id: number; changes: Record<string, { added: string; removed: string }> }[];
      }>(`/bug/${id}`, payload);

      const bugResp = await client.get<{ bugs: unknown[] }>(`/bug/${id}`);
      const bug = normalizeBug(rawBugSchema.parse(bugResp.bugs[0]));
      // What Bugzilla actually recorded, so the UI can confirm the change rather
      // than echo what was asked for - a no-op edit returns an empty map.
      res.json({ bug, changes: result.bugs?.find((b) => b.id === id)?.changes ?? {} });
    } catch (err) {
      next(err);
    }
  });

  /*
   * GET /api/bugs/:id/activity - every recorded change, who and when, plus the
   * status journey (lib/bugActivity.ts). On the caller's own session, so it
   * shows exactly what Bugzilla lets them see of this bug.
   */
  router.get('/:id/activity', auth, async (req, res, next) => {
    try {
      const { id } = parseInput(idParamSchema, req.params);
      res.set('Cache-Control', 'no-store').json(await loadBugActivity(req.bugzilla!, id));
    } catch (err) {
      next(err);
    }
  });

  // POST /api/bugs/:id/comments
  router.post('/:id/comments', auth, async (req, res, next) => {
    try {
      const { id } = parseInput(idParamSchema, req.params);
      const input = parseInput(addCommentSchema, req.body);
      const client = req.bugzilla!;

      await client.post(`/bug/${id}/comment`, {
        comment: input.comment,
        is_private: input.isPrivate,
      });

      const commentResp = await client.get<{
        bugs: Record<string, { comments: unknown[] }>;
      }>(`/bug/${id}/comment`);
      const rawComments = commentResp.bugs[String(id)]?.comments ?? [];
      const comments = rawComments
        .map((c) => normalizeComment(rawCommentSchema.parse(c)))
        .sort((a, b) => a.count - b.count);
      const newest = comments[comments.length - 1];

      // Resolve the author here too, or a freshly posted comment appears under
      // an e-mail address until the page is reloaded and the rest appear under
      // real names — the same inconsistency, just briefer.
      const names = await resolveDisplayNames(client, newest ? [newest.author] : []);

      res.status(201).json({
        comment: newest ? { ...newest, author: displayNameFor(names, newest.author) } : newest,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
