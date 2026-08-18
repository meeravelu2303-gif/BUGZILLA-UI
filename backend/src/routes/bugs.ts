import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../config/env';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../lib/errors';
import { parseInput } from '../lib/validate';
import {
  addCommentSchema,
  bugCountRowSchema,
  countBugsQuerySchema,
  createBugSchema,
  listBugsQuerySchema,
  normalizeAttachment,
  normalizeBug,
  normalizeComment,
  rawAttachmentSchema,
  rawBugSchema,
  rawCommentSchema,
  tallyBugCounts,
  updateBugSchema,
} from '../schemas/bug';

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const SORTABLE_FIELDS = new Set([
  'id',
  'priority',
  'severity',
  'status',
  'product',
  'component',
  'assigned_to',
  'last_change_time',
  'creation_time',
  'summary',
]);

const CAMEL_TO_BUGZILLA_UPDATE: Record<string, string> = {
  summary: 'summary',
  status: 'status',
  resolution: 'resolution',
  priority: 'priority',
  severity: 'severity',
  component: 'component',
  version: 'version',
  opSys: 'op_sys',
  platform: 'platform',
  assignedTo: 'assigned_to',
  targetMilestone: 'target_milestone',
  whiteboard: 'whiteboard',
};

/**
 * Translates this BFF's camelCase filter names into Bugzilla's own search
 * parameters. Shared by the list and count endpoints so the two always agree on
 * what a given filter means - a count that filtered differently from the list
 * it sits above would be worse than no count at all.
 */
function applyBugFilters(
  params: Record<string, string | number>,
  query: Partial<Record<'product' | 'component' | 'status' | 'severity' | 'priority' | 'assignedTo' | 'creator' | 'cc' | 'search', string>>
): void {
  if (query.product) params.product = query.product;
  if (query.component) params.component = query.component;
  if (query.status) params.bug_status = query.status;
  if (query.severity) params.severity = query.severity;
  if (query.priority) params.priority = query.priority;
  if (query.assignedTo) params.assigned_to = query.assignedTo;
  if (query.creator) params.creator = query.creator;
  if (query.cc) params.cc = query.cc;
  if (query.search) params.summary = query.search;
}

export function bugsRouter(env: Env): Router {
  const router = Router();
  const auth = requireAuth(env);

  // GET /api/bugs
  router.get('/', auth, async (req, res, next) => {
    try {
      const query = parseInput(listBugsQuerySchema, req.query);
      const sortField = SORTABLE_FIELDS.has(query.sortBy) ? query.sortBy : 'last_change_time';

      const params: Record<string, string | number> = {
        limit: query.limit + 1, // fetch one extra to detect a next page
        offset: query.offset,
        order: query.sortDir === 'desc' ? `${sortField} DESC` : sortField,
      };
      applyBugFilters(params, query);

      const raw = await req.bugzilla!.get<{ bugs: unknown[] }>('/bug', params);
      const hasMore = raw.bugs.length > query.limit;
      const page = raw.bugs.slice(0, query.limit).map((b) => normalizeBug(rawBugSchema.parse(b)));

      res.json({
        bugs: page,
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
        include_fields: 'id,is_open,status,severity',
      };
      applyBugFilters(params, query);

      const raw = await req.bugzilla!.get<{ bugs: unknown[] }>('/bug', params);
      const rows = raw.bugs.map((b) => bugCountRowSchema.parse(b));

      res.json({ counts: tallyBugCounts(rows) });
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
      const comments = rawComments.map((c) => normalizeComment(rawCommentSchema.parse(c))).sort((a, b) => a.count - b.count);
      const description = comments.find((c) => c.count === 0)?.text ?? '';

      const rawAttachments = attachmentResp.bugs[String(id)] ?? [];
      const attachments = rawAttachments.map((a) => normalizeAttachment(rawAttachmentSchema.parse(a)));

      res.json({ bug: { ...bug, description }, comments, attachments });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/bugs/:id/attachments/:attachmentId  (binary download, streamed)
  router.get('/:id/attachments/:attachmentId', auth, async (req, res, next) => {
    try {
      const { attachmentId } = parseInput(z.object({ attachmentId: z.coerce.number().int().positive() }), req.params);
      const client = req.bugzilla!;
      const resp = await client.get<{ attachments: Record<string, { data: string; file_name: string; content_type: string }> }>(
        `/bug/attachment/${attachmentId}`
      );
      const attachment = resp.attachments[String(attachmentId)];
      if (!attachment) {
        throw new AppError(404, 'NOT_FOUND', 'That attachment could not be found.');
      }
      const buffer = Buffer.from(attachment.data, 'base64');
      res.setHeader('Content-Type', attachment.content_type || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.file_name)}"`);
      res.setHeader('Content-Length', String(buffer.length));
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/bugs
  router.post('/', auth, async (req, res, next) => {
    try {
      const input = parseInput(createBugSchema, req.body);
      const client = req.bugzilla!;

      const payload = {
        product: input.product,
        component: input.component,
        summary: input.summary,
        description: input.description ?? '',
        // Brief-mandated defaults - this Bugzilla instance requires both fields explicitly (API_CONTRACT.md #7).
        version: input.version ?? 'unspecified',
        op_sys: input.opSys ?? 'All',
        platform: input.platform ?? 'All',
        ...(input.severity ? { severity: input.severity } : {}),
        ...(input.priority ? { priority: input.priority } : {}),
      };

      const created = await client.post<{ id: number }>('/bug', payload);

      const bugResp = await client.get<{ bugs: unknown[] }>(`/bug/${created.id}`);
      const bug = normalizeBug(rawBugSchema.parse(bugResp.bugs[0]));
      res.status(201).json({ bug });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/bugs/:id
  router.patch('/:id', auth, async (req, res, next) => {
    try {
      const { id } = parseInput(idParamSchema, req.params);
      const input = parseInput(updateBugSchema, req.body);
      const client = req.bugzilla!;

      const payload: Record<string, string> = {};
      for (const [camelKey, value] of Object.entries(input)) {
        if (value === undefined) continue;
        const bzKey = CAMEL_TO_BUGZILLA_UPDATE[camelKey];
        if (bzKey) payload[bzKey] = value as string;
      }

      await client.put(`/bug/${id}`, payload);

      const bugResp = await client.get<{ bugs: unknown[] }>(`/bug/${id}`);
      const bug = normalizeBug(rawBugSchema.parse(bugResp.bugs[0]));
      res.json({ bug });
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

      await client.post(`/bug/${id}/comment`, { comment: input.comment, is_private: input.isPrivate });

      const commentResp = await client.get<{ bugs: Record<string, { comments: unknown[] }> }>(`/bug/${id}/comment`);
      const rawComments = commentResp.bugs[String(id)]?.comments ?? [];
      const comments = rawComments.map((c) => normalizeComment(rawCommentSchema.parse(c))).sort((a, b) => a.count - b.count);
      const newest = comments[comments.length - 1];

      res.status(201).json({ comment: newest });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
