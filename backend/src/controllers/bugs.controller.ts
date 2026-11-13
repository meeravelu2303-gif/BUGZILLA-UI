import type { RequestHandler } from 'express';
import { unlink } from 'node:fs/promises';
import { z } from 'zod';
import { scopeToAccessibleProducts, accessibleProductNames } from '../services/access.service';
import {
  CATEGORIES,
  SEVERITIES,
  SOURCES,
  browsersOf,
  classify,
  withSourceTag,
  type Category,
  type Severity,
  categoryOf,
} from '../services/classification.service';
import { reassignedBugIds } from '../services/bugHistory.service';
import {
  canServeFromSnapshot,
  getBugSnapshot,
  inScope,
  invalidateBugSnapshot,
  matchesFilters,
  snapshotSorter,
} from '../services/bugSnapshot.service';
import { narrowStatusFilter } from '../services/bugStatus.service';
import { allGroupNames, bugFeatures } from '../services/bugFeatures.service';
import {
  CURRENT_BUG_FIELDS,
  toBugzillaUpdate,
  validateBugUpdate,
  type CurrentBug,
} from '../services/bugUpdate.service';
import { groupNameForProduct } from '../services/productGroups.service';
import {
  describeTargets,
  directoryClient,
  loadTransferableBug,
  transferBug,
} from '../services/productTransfer.service';
import { clearCategoryIndex } from '../services/categoryIndex.service';
import {
  DELETED_GROUP,
  DELETED_RESOLUTION,
  deletedInfoFrom,
  restoreBugs,
  softDeleteBugs,
} from '../services/softDelete.service';
import {
  effectiveReport,
  isReportRevision,
  normaliseReport,
  revisionComment,
  stripRevision,
  withCategoryTag,
} from '../services/reportRevision.service';
import { buildBugWorkbook } from '../services/bugExport.service';
import { AppError, badRequest, forbidden, notFound, conflict } from '../helpers/errors.helper';
import { parseDescription } from '../services/grouping.service';
import { displayNameFor, resolveDisplayNames } from '../services/displayNames.service';
import { parseInput } from '../helpers/validate.helper';
import { NO_SUBCOMPONENT, resolveSubcomponent } from '../services/subcomponents.service';
import { loadBugActivity } from '../services/bugActivity.service';
import { announceBugChange } from '../events/liveUpdates.event';
import {
  addCommentSchema,
  bugCountRowSchema,
  countBugsQuerySchema,
  createAttachmentSchema,
  createBugSchema,
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
  reassignmentCandidates,
  tallyBugCounts,
  updateAttachmentSchema,
  updateBugSchema,
  updateCommentTagsSchema,
  idParamSchema,
} from '../dto/bug.dto';
import { asyncHandler, sendNoContent, sendSuccess } from '../helpers/response.helper';
import { env } from '../config/app.config';
import {
  StatsRow,
  applyBugFilters,
  buildOrder,
  componentOwners,
  isQueued,
  toCountRow,
  zeroCounts,
} from '../services/bugList.service';
import {
  buildPack,
  buildSheet,
  collectExport,
  findOwnExportJob,
  packJobs,
  startJob,
} from '../services/bugExportJobs.service';
import {
  DUPLICATE_RESOLUTION,
  actorName,
  assertReassignable,
  canDeleteAttachment,
  canEditComment,
} from '../services/bugRules.service';
import { accessibleProductList, transferRoutes, transferTargetNames } from '../services/bugTransfer.service';

export const announceBugChanges: RequestHandler = (req, res, next) => {
  const requestPath = req.path;
  if (req.method === 'GET' || requestPath.startsWith('/export')) return next();
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const ids = new Set<number>();
    const fromPath = /^\/(\d+)(?:\/|$)/.exec(requestPath);
    if (fromPath) ids.add(Number(fromPath[1]));
    const bodyIds = (req.body as { ids?: unknown } | undefined)?.ids;
    if (Array.isArray(bodyIds))
      for (const bodyId of bodyIds) if (Number.isInteger(Number(bodyId))) ids.add(Number(bodyId));
    for (const id of (res.locals.bugIds as number[] | undefined) ?? []) ids.add(id);
    if (ids.size > 0) void announceBugChange(env, [...ids]);
    else invalidateBugSnapshot();
  });
  next();
};

export const listBugs = asyncHandler(async (req, res) => {
  const query = parseInput(listBugsQuerySchema, req.query);
  const order = buildOrder(query.sortBy, query.sortDir);

  const filteringByAssignment = query.assignment !== undefined;
  const params: Record<string, string | number> = {
    limit: filteringByAssignment ? 0 : query.limit + 1,
    ...(filteringByAssignment ? {} : { offset: query.offset }),
    order,
  };
  applyBugFilters(params, query);

  if (query.status?.length) {
    const narrowed = await narrowStatusFilter(req.bugzilla!, query.status);
    if (narrowed === null) {
      sendSuccess(res, { bugs: [], hasMore: false, limit: query.limit, offset: query.offset });
      return;
    }
    params.bug_status = narrowed as unknown as string;
  }

  const sorter = canServeFromSnapshot(query) ? await snapshotSorter(env, query.sortBy, query.sortDir) : null;
  let raw: { bugs: unknown[] };
  if (sorter) {
    const [snapshot, names] = await Promise.all([
      getBugSnapshot(env),
      accessibleProductNames(req.bugzilla!, req.sessionUser!.bzUserId),
    ]);
    const effective = params.bug_status ? { ...query, status: params.bug_status as unknown as string[] } : query;
    const rows = snapshot.rows
      .filter((row) => inScope(row, names, effective) && matchesFilters(row, effective))
      .sort(sorter);
    const window = filteringByAssignment ? rows : rows.slice(query.offset, query.offset + query.limit + 1);
    raw = { bugs: window.map((bug) => bug.raw) };
  } else {
    await scopeToAccessibleProducts(params, req.bugzilla!, req.sessionUser!.bzUserId);
    raw = await req.bugzilla!.get<{ bugs: unknown[] }>('/bug', params);
  }

  let hasMore: boolean;
  let page: ReturnType<typeof normalizeBug>[];
  if (filteringByAssignment) {
    const owners = await componentOwners(req);
    const all = raw.bugs.map((bug) => normalizeBug(rawBugSchema.parse(bug)));
    let matching = owners
      ? all.filter(
          (bug) => bug.isOpen && (query.assignment === 'queued' ? isQueued(bug, owners) : !isQueued(bug, owners)),
        )
      : [];

    if (query.assignment === 'reassigned' && matching.length > 0) {
      const changed = await reassignedBugIds(
        req.bugzilla!,
        matching.map((bug) => bug.id),
      );
      matching = matching.filter((bug) => changed.has(bug.id));
    }
    page = matching.slice(query.offset, query.offset + query.limit);
    hasMore = matching.length > query.offset + query.limit;
  } else {
    hasMore = raw.bugs.length > query.limit;
    page = raw.bugs.slice(0, query.limit).map((bug) => normalizeBug(rawBugSchema.parse(bug)));
  }

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

  sendSuccess(res, {
    bugs,
    pageInfo: { limit: query.limit, offset: query.offset, hasMore },
  });
});

export const countBugs = asyncHandler(async (req, res) => {
  const query = parseInput(countBugsQuerySchema, req.query);

  const params: Record<string, string | number> = {
    limit: 0,
    include_fields: 'id,is_open,status,severity,priority,assigned_to,product,component',
  };
  applyBugFilters(params, query);

  if (query.status?.length) {
    const narrowed = await narrowStatusFilter(req.bugzilla!, query.status);
    if (narrowed === null) {
      sendSuccess(res, { counts: tallyBugCounts([]) });
      return;
    }
    params.bug_status = narrowed as unknown as string;
  }

  let rows: ReturnType<typeof bugCountRowSchema.parse>[];
  if (canServeFromSnapshot(query)) {
    const narrowedQuery = { ...query, status: params.bug_status as unknown as string[] | undefined };
    const [snapshot, names] = await Promise.all([
      getBugSnapshot(env),
      accessibleProductNames(req.bugzilla!, req.sessionUser!.bzUserId),
    ]);
    rows = snapshot.rows
      .filter((row) => inScope(row, names, query) && matchesFilters(row, narrowedQuery))
      .map(toCountRow);
  } else {
    await scopeToAccessibleProducts(params, req.bugzilla!, req.sessionUser!.bzUserId);
    const raw = await req.bugzilla!.get<{ bugs: unknown[] }>('/bug', params);
    rows = raw.bugs.map((bug) => bugCountRowSchema.parse(bug));
  }

  const owners = await componentOwners(req);

  const counts = tallyBugCounts(rows, owners);

  if (owners && query.assignment) {
    const candidates = reassignmentCandidates(rows, owners);
    if (candidates.length > 0) {
      try {
        counts.reassigned = (await reassignedBugIds(req.bugzilla!, candidates)).size;
      } catch (err) {
        console.warn(
          '[counts] bug history unavailable; reassigned reported as 0:',
          err instanceof Error ? err.message : err,
        );
      }
    }
  }
  if (query.assignment && owners) {
    const side =
      query.assignment === 'queued'
        ? counts.queued
        : query.assignment === 'reassigned'
          ? counts.reassigned
          : counts.picked;
    sendSuccess(res, { counts: { ...counts, total: side, open: side } });
    return;
  }
  sendSuccess(res, { counts });
});

export const exportBugs = asyncHandler(async (req, res) => {
  const { bugs, context, stamp } = await collectExport(req);
  const buffer = await buildBugWorkbook(bugs, context);
  res
    .status(200)
    .set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="bugs-${stamp}.xlsx"`,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'no-store',
      'X-Export-Rows': String(bugs.length),
    })
    .send(buffer);
});

export const startExportJob = asyncHandler(async (req, res) => {
  const job = startJob(req, 'xlsx');
  sendSuccess(res, { jobId: job.id }, 202);
  void buildSheet(req, job);
});

export const startExportPackJob = asyncHandler(async (req, res) => {
  const job = startJob(req, 'zip');
  sendSuccess(res, { jobId: job.id }, 202);
  void buildPack(req, job);
});

export const getExportJob = asyncHandler(async (req, res) => {
  const job = findOwnExportJob(req);
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
});

export const cancelExportJob = asyncHandler(async (req, res) => {
  const job = findOwnExportJob(req);
  job.controller.abort();
  if (job.status === 'ready') {
    if (job.file) void unlink(job.file).catch(() => undefined);
    packJobs.delete(job.id);
  } else if (job.status === 'preparing') {
    job.status = 'cancelled';
    job.phase = 'Cancelled';
  }
  sendNoContent(res);
});

export const downloadExportJob = asyncHandler(async (req, res) => {
  const job = findOwnExportJob(req);
  if (job.status !== 'ready' || !job.file || !job.fileName) {
    throw conflict('This export is not ready yet.');
  }
  const file = job.file;
  res.download(file, job.fileName, { headers: { 'Cache-Control': 'no-store' } }, () => {
    packJobs.delete(job.id);
    void unlink(file).catch(() => undefined);
  });
});

export const getBugStats = asyncHandler(async (req, res) => {
  const query = parseInput(countBugsQuerySchema, req.query);

  const params: Record<string, unknown> = {
    limit: 0,
    include_fields:
      'id,severity,priority,status,resolution,component,cf_subcomponent,product,whiteboard,is_open,assigned_to',
  };
  applyBugFilters(params, query);

  let raw: { bugs: StatsRow[] };
  let builtAt = Date.now();
  if (canServeFromSnapshot(query)) {
    const [snapshot, names] = await Promise.all([
      getBugSnapshot(env),
      accessibleProductNames(req.bugzilla!, req.sessionUser!.bzUserId),
    ]);
    builtAt = snapshot.builtAt;
    raw = {
      bugs: snapshot.rows
        .filter((row) => inScope(row, names, query) && matchesFilters(row, query))
        .map((row) => ({
          id: row.id,
          severity: row.severity,
          priority: row.priority,
          status: row.status,
          component: row.component,
          cf_subcomponent: row.subcomponent,
          product: row.product,
          resolution: row.resolution,
          whiteboard: row.whiteboard,
          is_open: row.isOpen,
          assigned_to: row.assignedTo,
        })),
    };
  } else {
    await scopeToAccessibleProducts(params, req.bugzilla!, req.sessionUser!.bzUserId);
    raw = await req.bugzilla!.get<{ bugs: StatsRow[] }>('/bug', params as Record<string, string | number>);
  }

  const bySeverity = zeroCounts(SEVERITIES);
  const byCategory = zeroCounts(CATEGORIES);
  const byComponent: Record<string, number> = {};
  const matrix = Object.fromEntries(SEVERITIES.map((severity) => [severity, zeroCounts(CATEGORIES)])) as Record<
    Severity,
    Record<Category, number>
  >;

  const openBySeverity = zeroCounts(SEVERITIES);
  const openByCategory = zeroCounts(CATEGORIES);
  const openByComponent: Record<string, number> = {};
  const bySubcomponent: Record<string, number> = {};
  const byProduct: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byResolution: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  const openBySubcomponent: Record<string, number> = {};
  const openMatrix = Object.fromEntries(SEVERITIES.map((severity) => [severity, zeroCounts(CATEGORIES)])) as Record<
    Severity,
    Record<Category, number>
  >;

  const byBrowser: Record<string, number> = {};
  const openByBrowser: Record<string, number> = {};
  const bySource = zeroCounts(SOURCES);
  const openBySource = zeroCounts(SOURCES);
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
    const subcomponent = row.cf_subcomponent || NO_SUBCOMPONENT;
    bySubcomponent[subcomponent] = (bySubcomponent[subcomponent] ?? 0) + 1;
    const browsers = browsersOf(row.whiteboard);
    for (const browser of browsers) byBrowser[browser] = (byBrowser[browser] ?? 0) + 1;
    if (row.is_open) {
      open += 1;
      openBySeverity[severity] += 1;
      openByCategory[category] += 1;
      openMatrix[severity][category] += 1;
      openByComponent[row.component] = (openByComponent[row.component] ?? 0) + 1;
      openBySubcomponent[subcomponent] = (openBySubcomponent[subcomponent] ?? 0) + 1;
      for (const browser of browsers) openByBrowser[browser] = (openByBrowser[browser] ?? 0) + 1;
    }
  }

  sendSuccess(res, {
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
});

export const getCommentTags = asyncHandler(async (req, res) => {
  const { q } = parseInput(
    z.object({
      q: z
        .string()
        .trim()
        .min(1)
        .max(24)
        .regex(/^[^\s,/]+$/),
    }),
    req.query,
  );
  const tags = await req.bugzilla!.get<string[]>(`/bug/comment/tags/${encodeURIComponent(q)}`, { limit: 10 });
  sendSuccess(res, { tags: Array.isArray(tags) ? tags : [] });
});

export const getBug = asyncHandler(async (req, res) => {
  const { id } = parseInput(idParamSchema, req.params);
  const client = req.bugzilla!;

  const [bugResponse, commentResponse, attachmentResponse, editResponse] = await Promise.all([
    client.get<{ bugs: unknown[] }>(`/bug/${id}`),
    client.get<{ bugs: Record<string, { comments: unknown[] }> }>(`/bug/${id}/comment`),
    client.get<{ bugs: Record<string, unknown[]> }>(`/bug/${id}/attachment`, { exclude_fields: 'data' }),
    client
      .get<{ comments: Record<string, { count: number; last_edit: string }> }>('/comment_edit', { bug_id: id })
      .catch(() => ({ comments: {} as Record<string, { count: number; last_edit: string }> })),
  ]);

  const bug = normalizeBug(rawBugSchema.parse(bugResponse.bugs[0]));
  const rawComments = commentResponse.bugs[String(id)]?.comments ?? [];
  const parsedComments = rawComments
    .map((rawComment) => normalizeComment(rawCommentSchema.parse(rawComment)))
    .sort((left, right) => left.count - right.count);
  const report = effectiveReport(parsedComments);
  const description = report.text;

  const rawAttachments = attachmentResponse.bugs[String(id)] ?? [];
  const parsedAttachments = rawAttachments.map((rawAttachment) =>
    normalizeAttachment(rawAttachmentSchema.parse(rawAttachment)),
  );

  const names = await resolveDisplayNames(client, [
    ...parsedComments.map((parsedComment) => parsedComment.author),
    ...parsedAttachments.map((parsedAttachment) => parsedAttachment.creator),
  ]);
  const comments = parsedComments.map((parsedComment) => ({
    ...parsedComment,
    author: displayNameFor(names, parsedComment.author),
    canEdit: canEditComment(req, parsedComment),
    ...(editResponse.comments[String(parsedComment.id)]
      ? {
          edited: {
            count: editResponse.comments[String(parsedComment.id)].count,
            lastEditedAt: editResponse.comments[String(parsedComment.id)].last_edit,
          },
        }
      : {}),
    isReportRevision: isReportRevision(parsedComment.text),
    text: stripRevision(parsedComment.text),
  }));
  const lastEdit = report.latestRevision
    ? comments.find((comment) => comment.id === (report.latestRevision as { id: number }).id)
    : undefined;
  const attachments = parsedAttachments.map((parsedAttachment) => ({
    ...parsedAttachment,
    creator: displayNameFor(names, parsedAttachment.creator),
    canDelete: canDeleteAttachment(req, parsedAttachment.creator),
  }));

  const facts = parseDescription(description);
  const classification = classify({
    severity: bug.severity,
    priority: bug.priority,
    whiteboard: bug.whiteboard,
    description,
    product: bug.product,
  });

  const productGroup = groupNameForProduct(bug.product, await allGroupNames(env));
  const availableGroups = [...new Set([...bug.groups, ...(productGroup ? [productGroup] : [])])].filter(
    (value) => value !== DELETED_GROUP,
  );
  const deleted = bug.resolution === DELETED_RESOLUTION ? deletedInfoFrom(comments) : null;

  sendSuccess(res, {
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
});

export const downloadAttachment = asyncHandler(async (req, res) => {
  const { attachmentId } = parseInput(z.object({ attachmentId: z.coerce.number().int().positive() }), req.params);
  const forceDownload = req.query.download === '1';
  const client = req.bugzilla!;
  const response = await client.get<{
    attachments: Record<string, { data: string; file_name: string; content_type: string }>;
  }>(`/bug/attachment/${attachmentId}`);
  const attachment = response.attachments[String(attachmentId)];
  if (!attachment) {
    throw notFound('That attachment could not be found.');
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
});

export const createAttachment = asyncHandler(async (req, res) => {
  const { id } = parseInput(z.object({ id: z.coerce.number().int().positive() }), req.params);
  const input = parseInput(createAttachmentSchema, req.body);
  const created = await req.bugzilla!.post<{ ids: number[] }>(`/bug/${id}/attachment`, {
    ids: [id],
    data: input.data,
    file_name: input.fileName,
    content_type: input.contentType,
    summary: input.summary || input.fileName,
  });
  sendSuccess(res, { ids: created.ids }, 201);
});

export const uploadAttachment = asyncHandler(async (req, res) => {
  const { id } = parseInput(idParamSchema, req.params);
  const client = req.bugzilla!;
  const body = req.body as Buffer;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw badRequest('The file is empty.');
  }
  const { maxAttachmentKb } = await bugFeatures(env);
  if (body.length > maxAttachmentKb * 1024) {
    throw new AppError(
      413,
      'VALIDATION',
      `That file is ${(body.length / 1024 / 1024).toFixed(1)} MB; Bugzilla accepts up to ${Math.round(maxAttachmentKb / 1024)} MB per file.`,
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
  const fileName = header('X-File-Name').split(/[\\/]/).pop()?.slice(0, 255) || 'attachment';
  const summary = header('X-Summary').slice(0, 255) || fileName;
  const comment = header('X-Comment').slice(0, 65535);
  const contentType = /^[\w.+-]+\/[\w.+-]+/.exec(req.get('Content-Type') ?? '')?.[0] ?? 'application/octet-stream';

  const current = await client.get<{ bugs: { resolution: string }[] }>(`/bug/${id}`, {
    include_fields: 'resolution',
  });
  if (!current.bugs[0]) throw notFound('That bug could not be found.');
  if (current.bugs[0].resolution === DELETED_RESOLUTION) {
    throw conflict('This bug is deleted. Restore it before adding files.');
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
  sendSuccess(
    res,
    {
      attachment: {
        ...attachment,
        creator: displayNameFor(names, attachment.creator),
        canDelete: canDeleteAttachment(req, attachment.creator),
      },
    },
    201,
  );
});

export const updateAttachment = asyncHandler(async (req, res) => {
  const { id, attachmentId } = parseInput(
    z.object({ id: z.coerce.number().int().positive(), attachmentId: z.coerce.number().int().positive() }),
    req.params,
  );
  const input = parseInput(updateAttachmentSchema, req.body);
  const client = req.bugzilla!;

  const found = await client.get<{ attachments: Record<string, { bug_id: number }> }>(
    `/bug/attachment/${attachmentId}`,
    { include_fields: 'bug_id' },
  );
  if (found.attachments[String(attachmentId)]?.bug_id !== id) {
    throw notFound('That attachment is not on this bug.');
  }
  if (input.isPrivate !== undefined && !(await bugFeatures(env)).privateComments) {
    throw badRequest('Private attachments are not enabled on this Bugzilla.');
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
  sendSuccess(res, {
    attachment: {
      ...attachment,
      creator: displayNameFor(names, attachment.creator),
      canDelete: canDeleteAttachment(req, attachment.creator),
    },
  });
});

export const deleteAttachment = asyncHandler(async (req, res) => {
  const { id, attachmentId } = parseInput(
    z.object({ id: z.coerce.number().int().positive(), attachmentId: z.coerce.number().int().positive() }),
    req.params,
  );
  const client = req.bugzilla!;
  const found = await client.get<{ attachments: Record<string, { bug_id: number; creator: string }> }>(
    `/bug/attachment/${attachmentId}`,
    { include_fields: 'bug_id,creator' },
  );
  const target = found.attachments[String(attachmentId)];
  if (!target || target.bug_id !== id) {
    throw notFound('That attachment is not on this bug.');
  }
  if (!canDeleteAttachment(req, target.creator)) {
    throw forbidden('Only the person who uploaded this file or an administrator can delete it.');
  }
  const result = await client.post<{ removed: { id: number; bug_id: number; file_name: string } }>(
    '/attachment/remove',
    {
      id: attachmentId,
    },
  );
  sendSuccess(res, {
    removed: { id: result.removed.id, bugId: result.removed.bug_id, fileName: result.removed.file_name },
  });
});

export const editComment = asyncHandler(async (req, res) => {
  const { id, commentId } = parseInput(
    z.object({ id: z.coerce.number().int().positive(), commentId: z.coerce.number().int().positive() }),
    req.params,
  );
  const { text } = parseInput(
    z.object({
      text: z
        .string()
        .trim()
        .min(1, 'A comment cannot be empty.')
        .max(65535, 'A comment can be at most 65,535 characters.'),
    }),
    req.body,
  );
  const client = req.bugzilla!;
  const found = await client.get<{
    comments: Record<string, { bug_id: number; creator: string; count: number; text: string }>;
  }>(`/bug/comment/${commentId}`, { include_fields: 'bug_id,creator,count,text' });
  const target = found.comments[String(commentId)];
  if (!target || target.bug_id !== id) throw notFound('That comment is not on this bug.');
  if (!canEditComment(req, { author: target.creator, count: target.count, text: target.text })) {
    throw forbidden(
      'Only the person who wrote a comment can edit it, and the bug report itself is edited with "Edit bug".',
    );
  }
  const result = await client.post<{ changed: boolean; count?: number; last_edit?: string }>('/comment_edit/update', {
    comment_id: commentId,
    text,
  });
  sendSuccess(res, {
    comment: { id: commentId, text },
    ...(result.count ? { edited: { count: result.count, lastEditedAt: result.last_edit } } : {}),
    changed: result.changed,
  });
});

export const getCommentHistory = asyncHandler(async (req, res) => {
  const { id, commentId } = parseInput(
    z.object({ id: z.coerce.number().int().positive(), commentId: z.coerce.number().int().positive() }),
    req.params,
  );
  const client = req.bugzilla!;
  const found = await client.get<{ comments: Record<string, { bug_id: number }> }>(`/bug/comment/${commentId}`, {
    include_fields: 'bug_id',
  });
  if (found.comments[String(commentId)]?.bug_id !== id) throw notFound('That comment is not on this bug.');
  const response = await client.get<{
    versions: { replaced_at: string; editor: string; editor_name: string; text: string }[];
  }>('/comment_edit/history', { comment_id: commentId });
  sendSuccess(res, {
    versions: response.versions.map((version) => ({
      replacedAt: version.replaced_at,
      editor: version.editor_name || version.editor,
      text: version.text,
    })),
  });
});

export const setCommentTags = asyncHandler(async (req, res) => {
  const { id, commentId } = parseInput(
    z.object({ id: z.coerce.number().int().positive(), commentId: z.coerce.number().int().positive() }),
    req.params,
  );
  const input = parseInput(updateCommentTagsSchema, req.body);
  const client = req.bugzilla!;

  if (!(await bugFeatures(env)).commentTags) {
    throw badRequest('Comment tags are not enabled on this Bugzilla.');
  }
  const found = await client.get<{ comments: Record<string, { bug_id: number }> }>(`/bug/comment/${commentId}`, {
    include_fields: 'bug_id',
  });
  if (found.comments[String(commentId)]?.bug_id !== id) {
    throw notFound('That comment is not on this bug.');
  }

  const tags = await client.put<string[]>(`/bug/comment/${commentId}/tags`, {
    comment_id: commentId,
    ...(input.add?.length ? { add: input.add } : {}),
    ...(input.remove?.length ? { remove: input.remove } : {}),
  });
  sendSuccess(res, { tags: Array.isArray(tags) ? tags : [] });
});

export const createBug = asyncHandler(async (req, res) => {
  const input = parseInput(createBugSchema, req.body);
  const client = req.bugzilla!;

  const subcomponent = input.subcomponent
    ? await resolveSubcomponent(env, input.product, input.component, input.subcomponent)
    : NO_SUBCOMPONENT;
  const payload = {
    product: input.product,
    component: input.component,
    ...(subcomponent !== NO_SUBCOMPONENT ? { cf_subcomponent: subcomponent } : {}),
    summary: input.summary,
    description: input.description ?? '',
    version: input.version ?? 'unspecified',
    op_sys: input.opSys ?? 'All',
    platform: input.platform ?? 'All',
    ...(input.severity ? { severity: input.severity } : {}),
    ...(input.priority ? { priority: input.priority } : {}),
    status_whiteboard: withSourceTag(input.whiteboard ?? '', 'Manual'),
    ...(input.assignedTo ? { assigned_to: input.assignedTo } : {}),
  };

  const created = await client.post<{ id: number }>('/bug', payload);
  res.locals.bugIds = [created.id];

  const bugResponse = await client.get<{ bugs: unknown[] }>(`/bug/${created.id}`);
  const bug = normalizeBug(rawBugSchema.parse(bugResponse.bugs[0]));
  sendSuccess(res, { bug }, 201);
});

export const bulkUpdateBugs = asyncHandler(async (req, res) => {
  const { ids, assignedTo } = parseInput(bulkReassignSchema, req.body);
  await assertReassignable(req.bugzilla!, ids, undefined, {
    email: req.sessionUser!.email,
    canReassignAny: req.sessionUser!.permissions.canReassignAny,
  });
  await req.bugzilla!.put(`/bug/${ids[0]}`, {
    ids,
    assigned_to: assignedTo,
  });
  sendSuccess(res, { updated: ids.length });
});

export const updateReport = asyncHandler(async (req, res) => {
  const { id } = parseInput(idParamSchema, req.params);
  const input = parseInput(updateReportSchema, req.body);
  const client = req.bugzilla!;

  const [currentResponse, commentResponse] = await Promise.all([
    client.get<{ bugs: { id: number; last_change_time: string; resolution: string; whiteboard?: string }[] }>(
      `/bug/${id}`,
      {
        include_fields: 'id,last_change_time,resolution,whiteboard',
      },
    ),
    client.get<{ bugs: Record<string, { comments: { text: string; count: number }[] }> }>(`/bug/${id}/comment`),
  ]);
  const current = currentResponse.bugs[0];
  if (!current) throw notFound('That bug could not be found.');
  if (current.resolution === DELETED_RESOLUTION) {
    throw conflict('This bug is deleted. Restore it before editing.');
  }
  const { text: existing, revisions } = effectiveReport(commentResponse.bugs[String(id)]?.comments ?? []);
  if (input.baseRevisions !== undefined && revisions.length !== input.baseRevisions) {
    throw conflict(
      'Someone else edited this bug report while you were editing it. Your edits are kept - save again to replace theirs (theirs stays in the history).',
      undefined,
      { reason: 'MID_AIR_COLLISION', revisions: revisions.length },
    );
  }
  const whiteboard = current.whiteboard ?? '';
  const nextWhiteboard = input.category ? withCategoryTag(whiteboard, input.category) : whiteboard;
  const textChanged = normaliseReport(input.text) !== normaliseReport(existing);
  const categoryChanged = nextWhiteboard !== whiteboard;
  if (!textChanged && !categoryChanged) {
    throw badRequest('Nothing changed - the report and category are the same as before.');
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
  sendSuccess(res, { textChanged, categoryChanged });
});

export const deleteBugs = asyncHandler(async (req, res) => {
  const { ids, reason } = parseInput(softDeleteSchema, req.body);
  const deleted = await softDeleteBugs(req.bugzilla!, [...new Set(ids)], reason, actorName(req));
  sendSuccess(res, { deleted });
});

export const restoreDeletedBugs = asyncHandler(async (req, res) => {
  const { ids } = parseInput(restoreSchema, req.body);
  const client = req.bugzilla!;
  const restored = await restoreBugs(client, [...new Set(ids)], actorName(req), async (id) => {
    const response = await client.get<{ bugs: Record<string, { comments: unknown[] }> }>(`/bug/${id}/comment`);
    return (response.bugs[String(id)]?.comments ?? []).map((comment) => {
      const normalizedComment = normalizeComment(rawCommentSchema.parse(comment));
      return {
        text: normalizedComment.text,
        author: normalizedComment.author,
        creationTime: normalizedComment.creationTime,
      };
    });
  });
  sendSuccess(res, { restored });
});

export const getTransferOptions = asyncHandler(async (req, res) => {
  const { id } = parseInput(idParamSchema, req.params);
  const user = req.sessionUser!;
  const bug = await loadTransferableBug(req.bugzilla!, id, {
    email: user.email,
    canTriage: user.permissions.canTriage,
  });
  const names = transferTargetNames(bug.product, await accessibleProductList(req));
  const targets = await describeTargets(directoryClient(env), names).catch((err: unknown) => {
    console.error(`[transfer] could not describe targets for bug ${id}:`, err instanceof Error ? err.message : err);
    return [];
  });
  res.set('Cache-Control', 'no-store').json({ from: { product: bug.product, component: bug.component }, targets });
});

export const transferBugToProduct = asyncHandler(async (req, res) => {
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
  clearCategoryIndex();
  sendSuccess(res, result);
});

export const updateBug = asyncHandler(async (req, res) => {
  const { id } = parseInput(idParamSchema, req.params);
  const input = parseInput(updateBugSchema, req.body);
  const client = req.bugzilla!;

  const [currentResponse, features] = await Promise.all([
    client.get<{ bugs: CurrentBug[] }>(`/bug/${id}`, { include_fields: CURRENT_BUG_FIELDS }),
    bugFeatures(env),
  ]);
  const current = currentResponse.bugs[0];
  if (!current) throw notFound('That bug could not be found.');

  await validateBugUpdate(client, current, input, features, { canTriage: req.sessionUser!.permissions.canTriage });

  const payload = toBugzillaUpdate(input);

  const nextProduct = input.product ?? current.product;
  const nextComponent = input.component ?? current.component;
  const movesComponent = nextProduct !== current.product || nextComponent !== current.component;
  const unchanged =
    !movesComponent && (input.subcomponent || NO_SUBCOMPONENT) === (current.cf_subcomponent || NO_SUBCOMPONENT);
  if (input.subcomponent !== undefined && !unchanged) {
    payload.cf_subcomponent = await resolveSubcomponent(env, nextProduct, nextComponent, input.subcomponent);
  } else if (movesComponent) {
    payload.cf_subcomponent = NO_SUBCOMPONENT;
  }

  if (input.resolution === DUPLICATE_RESOLUTION) {
    const target = input.dupeOf;
    if (target === undefined) {
      throw badRequest(
        'Resolving a bug as DUPLICATE needs the bug it duplicates. Enter that bug number in "Duplicate of".',
      );
    }
    if (target === id) {
      throw badRequest('A bug cannot be a duplicate of itself.');
    }
    const found = await client
      .get<{ bugs: unknown[] }>('/bug', { id: target, include_fields: 'id' })
      .catch(() => ({ bugs: [] as unknown[] }));
    if (found.bugs.length === 0) {
      throw badRequest(`Bug ${target} does not exist, or you do not have access to it.`);
    }
  } else if (input.dupeOf !== undefined) {
    delete payload.dupe_of;
  }

  if (input.assignedTo !== undefined || input.resetAssignedTo) {
    await assertReassignable(client, [id], input.status, {
      email: req.sessionUser!.email,
      canReassignAny: req.sessionUser!.permissions.canReassignAny,
    });
  }

  const result = await client.put<{
    bugs: { id: number; changes: Record<string, { added: string; removed: string }> }[];
  }>(`/bug/${id}`, payload);

  const bugResponse = await client.get<{ bugs: unknown[] }>(`/bug/${id}`);
  const bug = normalizeBug(rawBugSchema.parse(bugResponse.bugs[0]));
  sendSuccess(res, { bug, changes: result.bugs?.find((updatedBug) => updatedBug.id === id)?.changes ?? {} });
});

export const getBugActivity = asyncHandler(async (req, res) => {
  const { id } = parseInput(idParamSchema, req.params);
  res.set('Cache-Control', 'no-store').json(await loadBugActivity(req.bugzilla!, id));
});

export const addComment = asyncHandler(async (req, res) => {
  const { id } = parseInput(idParamSchema, req.params);
  const input = parseInput(addCommentSchema, req.body);
  const client = req.bugzilla!;

  await client.post(`/bug/${id}/comment`, {
    comment: input.comment,
    is_private: input.isPrivate,
  });

  const commentResponse = await client.get<{
    bugs: Record<string, { comments: unknown[] }>;
  }>(`/bug/${id}/comment`);
  const rawComments = commentResponse.bugs[String(id)]?.comments ?? [];
  const comments = rawComments
    .map((rawComment) => normalizeComment(rawCommentSchema.parse(rawComment)))
    .sort((left, right) => left.count - right.count);
  const newest = comments[comments.length - 1];

  const names = await resolveDisplayNames(client, newest ? [newest.author] : []);

  sendSuccess(
    res,
    {
      comment: newest ? { ...newest, author: displayNameFor(names, newest.author) } : newest,
    },
    201,
  );
});
