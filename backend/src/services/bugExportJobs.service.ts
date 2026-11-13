import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import archiver from 'archiver';
import { type Request } from 'express';
import { z } from 'zod';
import { scopeToAccessibleProducts } from './access.service';
import { classify, type BugFilters, categoryOf } from './classification.service';
import type { BugzillaClient } from '../clients/bugzilla.client';
import { effectiveReport, isReportRevision } from './reportRevision.service';
import {
  buildBugWorkbook,
  currentComments,
  type BugProof,
  type ExportBug,
  type ExportContext,
} from './bugExport.service';
import { EMPTY_REPORT, parseDefectReport } from './defectReport.service';
import { AppError, badRequest, notFound } from '../helpers/errors.helper';
import { proofQueryString, proofSecret, signProof } from './proofLinks.service';
import { parseInput } from '../helpers/validate.helper';
import { subcomponentName } from './subcomponents.service';
import { exportBugsQuerySchema, normalizeBug, rawBugSchema, BugCommentInfo } from '../dto/bug.dto';
import { env } from '../config/app.config';
import { applyBugFilters, buildOrder } from './bugList.service';
import { appOriginOf } from './bugRules.service';

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

const DESCRIPTION_BATCH = 100;

const DESCRIPTION_CONCURRENCY = 4;

class ExportCancelled extends Error {}

interface StepHooks {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ExportCancelled('cancelled');
}

async function fetchDescriptions(
  client: BugzillaClient,
  ids: number[],
  hooks: StepHooks = {},
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
      const response = await client.get<{
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
      for (const [bugId, { comments }] of Object.entries(response.bugs ?? {})) {
        const description = comments.find((comment) => comment.count === 0) ?? comments[0];
        const report = effectiveReport(comments);
        const discussion = comments.filter((comment) => !isReportRevision(comment.text));
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
          history: discussion
            .filter((item) => item !== description && item.text && item.creator && item.creation_time)
            .map((item) => ({ text: item.text!, author: item.creator!, createdAt: item.creation_time! }))
            .reverse(),
        });
      }
      hooks.onProgress?.(Math.min(++finished * DESCRIPTION_BATCH, ids.length), ids.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(DESCRIPTION_CONCURRENCY, batches.length) }, worker));
  return info;
}

async function fetchAttachments(
  client: BugzillaClient,
  ids: number[],
  hooks: StepHooks = {},
): Promise<Map<number, BugProof[]>> {
  const batches: number[][] = [];
  for (let i = 0; i < ids.length; i += DESCRIPTION_BATCH) batches.push(ids.slice(i, i + DESCRIPTION_BATCH));

  const proof = new Map<number, BugProof[]>();
  let next = 0;
  let finished = 0;

  async function worker(): Promise<void> {
    while (next < batches.length) {
      throwIfCancelled(hooks.signal);
      const [first, ...rest] = batches[next++];
      const response = await client.get<{
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
      for (const [bugId, list] of Object.entries(response.bugs ?? {})) {
        proof.set(
          Number(bugId),
          list
            .filter((item) => !item.is_obsolete && item.file_name && item.creation_time)
            .map((item) => ({
              id: item.id,
              fileName: item.file_name!,
              summary: item.summary ?? '',
              createdAt: item.creation_time!,
              contentType: item.content_type ?? 'application/octet-stream',
              size: item.size ?? 0,
            }))
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
        );
      }
      hooks.onProgress?.(Math.min(++finished * DESCRIPTION_BATCH, ids.length), ids.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(DESCRIPTION_CONCURRENCY, batches.length) }, worker));
  return proof;
}

async function fetchAttachmentData(client: BugzillaClient, attachmentId: number): Promise<Buffer> {
  const response = await client.get<{
    attachments: Record<string, { data: string }>;
  }>(`/bug/attachment/${attachmentId}`);
  const attachment = response.attachments[String(attachmentId)];
  if (!attachment) throw notFound(`Attachment ${attachmentId} could not be found.`);
  return Buffer.from(attachment.data, 'base64');
}

const TEXT_PROOF = /^(text\/|application\/json)/i;

const TEXT_PROOF_MAX_FILES = 3;

const TEXT_PROOF_MAX_CHARS = 30_000;

async function fetchTextEvidence(
  client: BugzillaClient,
  proof: Map<number, BugProof[]>,
  hooks: StepHooks = {},
): Promise<Map<number, string>> {
  const jobs: Array<{ bugId: number; file: BugProof }> = [];
  for (const [bugId, files] of proof) {
    for (const file of files.filter((proof) => TEXT_PROOF.test(proof.contentType)).slice(0, TEXT_PROOF_MAX_FILES)) {
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
        .then((buffer) => buffer.toString('utf8'))
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

const THUMBNAIL_MAX_BYTES = 1_500_000;

function isTrace(file: BugProof): boolean {
  return /trace/i.test(file.fileName) && /zip$/i.test(file.contentType + file.fileName);
}

const CRASH_BUG = /JS error|Uncaught|TypeError|ReferenceError|React error|crash/i;

function inPack(bug: ExportBug, file: BugProof): boolean {
  return !isTrace(file) || CRASH_BUG.test(`${bug.summary} ${bug.report.actual}`);
}

function safeFileName(name: string, attachmentId: number): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 150);
  return `${attachmentId}-${cleaned || 'attachment'}`;
}

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
    for (const comment of currentComments(bug.history)) {
      lines.push(
        `### ${comment.author}, ${comment.createdAt.slice(0, 16).replace('T', ' ')} UTC`,
        '',
        comment.text.trim(),
        '',
      );
    }
  }
  lines.push('## Evidence files in this folder', '');
  const inFolder = (bug.proof ?? []).filter((file) => inPack(bug, file));
  for (const file of inFolder) {
    lines.push(
      `- ${safeFileName(file.fileName, file.id)} — ${file.createdAt.slice(0, 10)} — ${file.summary || file.contentType}`,
    );
  }
  const traces = (bug.proof ?? []).length - inFolder.length;
  if (traces) lines.push(`- (${traces} Playwright trace file(s) are in Bugzilla only, not in this pack)`);
  if (!(bug.proof ?? []).length) lines.push('- (none attached)');
  return lines.filter((line, i, all) => !(line === '' && all[i - 1] === '')).join('\n') + '\n';
}

interface PackJob {
  id: string;
  kind: 'xlsx' | 'zip';
  userId: number;
  status: 'preparing' | 'ready' | 'failed' | 'cancelled';
  phase: string;
  done: number;
  total: number;
  percent: number;
  createdAt: number;
  controller: AbortController;
  rows?: number;
  file?: string;
  fileName?: string;
  sizeBytes?: number;
  error?: string;
}

interface CollectProgress {
  signal?: AbortSignal;
  report: (phase: string, fraction: number, done?: number, total?: number) => void;
}

function band(job: PackJob, from: number, to: number): CollectProgress['report'] {
  return (phase, fraction, done, total) => {
    job.phase = phase;
    if (done !== undefined) job.done = done;
    if (total !== undefined) job.total = total;
    job.percent = Math.max(job.percent, Math.min(99, Math.round(from + (to - from) * fraction)));
  };
}

export const packJobs = new Map<string, PackJob>();

const PACK_DIR = path.join(os.tmpdir(), 'bugzilla-ui-evidence-packs');

const PACK_TTL_MS = 60 * 60 * 1000;

function sweepPackJobs(): void {
  const now = Date.now();
  for (const [id, job] of packJobs) {
    if (now - job.createdAt <= PACK_TTL_MS) continue;
    packJobs.delete(id);
    if (job.file) void unlink(job.file).catch(() => undefined);
  }
}

export async function collectExport(
  req: Request,
  progress?: CollectProgress,
): Promise<{ bugs: ExportBug[]; context: ExportContext; stamp: string }> {
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
    throw badRequest(
      `This export matches ${EXPORT_MAX_ROWS.toLocaleString('en-US')} or more bugs, which is Bugzilla's search limit, ` +
        'so the file would be incomplete. Narrow the filters (for example by product or status) and export again.',
    );
  }

  throwIfCancelled(signal);
  const normalized = raw.bugs.map((bug) => normalizeBug(rawBugSchema.parse(bug)));
  const ids = normalized.map((bug) => bug.id);

  const step = { comments: 0, files: 0 };
  const reading = () =>
    progress?.report(
      'Reading comments and attachments',
      0.1 + 0.45 * ((step.comments + step.files) / Math.max(1, 2 * ids.length)),
      Math.round((step.comments + step.files) / 2),
      ids.length,
    );
  reading();
  const [commentInfo, proofInfo] = await Promise.all([
    fetchDescriptions(req.bugzilla!, ids, { signal, onProgress: (done) => ((step.comments = done), reading()) }),
    fetchAttachments(req.bugzilla!, ids, { signal, onProgress: (done) => ((step.files = done), reading()) }),
  ]);
  const textEvidence = await fetchTextEvidence(req.bugzilla!, proofInfo, {
    signal,
    onProgress: (done, total) =>
      progress?.report('Reading evidence files', 0.55 + 0.45 * (total ? done / total : 1), done, total),
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
    const value =
      key === 'subcomponent'
        ? query.subcomponent?.map((subcomponent) => subcomponentName(subcomponent) || 'None')
        : query[key];
    const text = Array.isArray(value) ? value.join(', ') : value;
    return text ? [{ label, value: String(text) }] : [];
  });

  const dateWord = query.dateField === 'updated' ? 'updated' : 'created';
  let range = '';
  if (query.from || query.to) {
    const [from, to] =
      query.from && query.to && query.from > query.to ? [query.to, query.from] : [query.from, query.to];
    const text =
      from && to ? (from === to ? from : `${from} to ${to}`) : from ? `on or after ${from}` : `on or before ${to}`;
    filters.unshift({ label: dateWord === 'created' ? 'Created' : 'Last updated', value: text });
    range = `-${dateWord}-${from && to ? (from === to ? from : `${from}_to_${to}`) : from ? `from-${from}` : `until-${to}`}`;
  }

  const user = req.sessionUser!;
  const origin = env.PUBLIC_APP_URL ?? appOriginOf(req.get('origin'), req.get('referer'));
  const proofLinksUntil = new Date(Date.now() + env.PROOF_LINK_DAYS * 86_400_000);
  return {
    bugs,
    context: {
      exportedBy: user.realName ? `${user.realName} <${user.email}>` : user.email,
      filters,
      appOrigin: origin,
      proofLink: origin
        ? (bugId: number) =>
            `${origin}/api/proof/bug/${bugId}?${proofQueryString(
              signProof(proofSecret(env), 'bug', bugId, bugId, proofLinksUntil.getTime()),
            )}`
        : undefined,
      proofLinksUntil: origin ? proofLinksUntil : undefined,
    },
    stamp: `${range.slice(1) ? `${range.slice(1)}-` : ''}${new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')}`,
  };
}

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

export async function buildSheet(req: Request, job: PackJob): Promise<void> {
  const signal = job.controller.signal;
  try {
    const { bugs, context, stamp } = await collectExport(req, { signal, report: band(job, 0, 90) });
    job.phase = 'Building the Excel sheet';
    job.done = bugs.length;
    job.total = bugs.length;
    job.percent = 92;
    const workbook = await buildBugWorkbook(bugs, context);
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

export async function buildPack(req: Request, job: PackJob): Promise<void> {
  const signal = job.controller.signal;
  try {
    const { bugs, context, stamp } = await collectExport(req, { signal, report: band(job, 0, 30) });
    job.total = bugs.length;

    job.phase = 'Collecting screenshots for the sheet';
    const thumbnails = new Map<number, { buffer: Buffer; extension: 'png' | 'jpeg' }>();
    const thumbProgress = band(job, 30, 45);
    for (const [i, bug] of bugs.entries()) {
      throwIfCancelled(signal);
      thumbProgress('Collecting screenshots for the sheet', (i + 1) / bugs.length, i + 1, bugs.length);
      const image = bug.proof?.find(
        (proof) => /^image\/(png|jpe?g)$/i.test(proof.contentType) && proof.size <= THUMBNAIL_MAX_BYTES,
      );
      if (!image) continue;
      const buffer = await fetchAttachmentData(req.bugzilla!, image.id).catch(() => null);
      if (buffer) thumbnails.set(bug.id, { buffer, extension: /png$/i.test(image.contentType) ? 'png' : 'jpeg' });
    }

    job.phase = 'Building the Excel sheet';
    job.done = 0;
    job.percent = Math.max(job.percent, 46);
    const workbook = await buildBugWorkbook(bugs, { ...context, thumbnails });
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

export function findOwnExportJob(req: Request): PackJob {
  const { jobId } = parseInput(z.object({ jobId: z.string().uuid() }), req.params);
  const job = packJobs.get(jobId);
  if (!job || job.userId !== req.sessionUser!.bzUserId) {
    throw notFound('That export was not found — it may have expired or been cancelled. Start a new one.');
  }
  return job;
}

export function startJob(req: Request, kind: PackJob['kind']): PackJob {
  parseInput(exportBugsQuerySchema, req.query);
  sweepPackJobs();
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
