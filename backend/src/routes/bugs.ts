import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../config/env';
import { requireAuth } from '../middleware/auth';
import { getCategoryIndex } from '../lib/categoryIndex';
import {
  CATEGORIES,
  SEVERITIES,
  classify,
  toBugzillaQuery,
  type BugFilters,
  type Category,
  type Severity,
} from '../lib/classification';
import { AppError } from '../lib/errors';
import { parseDescription } from '../lib/grouping';
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

/** The narrow projection /stats asks Bugzilla for - never whole bug records. */
interface StatsRow {
  id: number;
  severity: string;
  priority: string;
  status: string;
  component: string;
  product: string;
  whiteboard?: string;
  is_open: boolean;
}

/** A counter object with every key present at zero, so absent bands still render. */
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
  // Business tier lives in the Status Whiteboard as `[tier1]`..`[tier3]`, so an
  // alphabetical sort on it is a true tier sort (tier1 < tier2 < tier3).
  status_whiteboard: 'status_whiteboard',
  /**
   * Triage order: how important is this bug to fix next.
   *
   * Tier first (the business criticality of the affected module - tier 1 means
   * the product is broken or data is exposed), then severity, then priority.
   * Severity and priority sort by Bugzilla's per-value `sortkey`, not
   * alphabetically, so ascending genuinely means blocker->trivial and
   * Highest->Lowest rather than an alphabetical jumble.
   */
  importance: 'status_whiteboard,bug_severity,priority',
};

const DEFAULT_SORT = 'last_change_time';

/**
 * Appended after whatever sort the caller asked for, so equal-ranked bugs read
 * newest-first and, ultimately, in a fully determined order.
 *
 * bug_id last is not decorative. Bugs filed in the same second share a
 * changeddate (55 such pairs in the current data), and without a unique final
 * key their relative order is undefined. That is not merely untidy: each page of
 * an offset query is ordered separately, so an undefined order lets the same bug
 * appear on two pages, or vanish between them.
 */
const TIEBREAKERS = [
  { field: SORT_FIELDS[DEFAULT_SORT], clause: `${SORT_FIELDS[DEFAULT_SORT]} DESC` },
  { field: 'bug_id', clause: 'bug_id DESC' },
];

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
 * Filters are translated by lib/classification.ts, which owns the vocabulary in
 * both directions. Shared by the list, count and stats endpoints so a count can
 * never disagree with the list it sits above.
 */
function applyBugFilters(params: Record<string, unknown>, query: BugFilters): void {
  Object.assign(params, toBugzillaQuery(query));
}

export function bugsRouter(env: Env): Router {
  const router = Router();
  const auth = requireAuth(env);

  // GET /api/bugs
  router.get('/', auth, async (req, res, next) => {
    try {
      const query = parseInput(listBugsQuerySchema, req.query);
      const sortField = SORT_FIELDS[query.sortBy] ?? SORT_FIELDS[DEFAULT_SORT];
      // A composite sort is several columns, so reversing it has to reverse every
      // one of them - appending a single DESC would only flip the last column.
      const primary =
        query.sortDir === 'desc'
          ? sortField
              .split(',')
              .map((f) => `${f} DESC`)
              .join(',')
          : sortField;
      // Tier only has three distinct values, so without tiebreakers 700+ bugs in
      // one tier come back in an arbitrary order that shifts between pages. Each
      // tiebreaker is skipped when the chosen sort already contains that column,
      // so a column is never named twice in one order clause.
      const chosen = sortField.split(',');
      const order = [primary, ...TIEBREAKERS.filter((t) => !chosen.includes(t.field)).map((t) => t.clause)].join(',');

      const params: Record<string, string | number> = {
        limit: query.limit + 1, // fetch one extra to detect a next page
        offset: query.offset,
        order,
      };
      applyBugFilters(params, query);

      const raw = await req.bugzilla!.get<{ bugs: unknown[] }>('/bug', params);
      const hasMore = raw.bugs.length > query.limit;
      const page = raw.bugs.slice(0, query.limit).map((b) => normalizeBug(rawBugSchema.parse(b)));

      /*
       * Category needs the description, which a bug search never returns, so it
       * comes from the cached per-user id index instead of one comment fetch per
       * row. Severity/priority come straight off the bug. If the index cannot be
       * built the list still renders - rows degrade to Unclassified rather than
       * the whole page failing over a breakdown that is decoration here.
       */
      const index = await getCategoryIndex(req.bugzilla!, req.sessionUser!.bzUserId, env.STATS_CACHE_TTL_MS).catch(
        () => null
      );

      const bugs = page.map((bug) => ({
        ...bug,
        triage: {
          ...classify({ severity: bug.severity, priority: bug.priority, whiteboard: bug.whiteboard }),
          category: index?.categoryOf(bug.id) ?? 'Unclassified',
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
        include_fields: 'id,severity,priority,status,component,product,whiteboard,is_open',
      };
      applyBugFilters(params, query);

      const [raw, index] = await Promise.all([
        req.bugzilla!.get<{ bugs: StatsRow[] }>('/bug', params as Record<string, string | number>),
        getCategoryIndex(req.bugzilla!, req.sessionUser!.bzUserId, env.STATS_CACHE_TTL_MS),
      ]);

      const bySeverity = zeroed(SEVERITIES);
      const byCategory = zeroed(CATEGORIES);
      const byComponent: Record<string, number> = {};
      const matrix = Object.fromEntries(
        SEVERITIES.map((s) => [s, zeroed(CATEGORIES)])
      ) as Record<Severity, Record<Category, number>>;

      let open = 0;
      for (const row of raw.bugs) {
        const { severity } = classify({ severity: row.severity, priority: row.priority, whiteboard: row.whiteboard });
        const category = index.categoryOf(row.id);
        bySeverity[severity] += 1;
        byCategory[category] += 1;
        matrix[severity][category] += 1;
        byComponent[row.component] = (byComponent[row.component] ?? 0) + 1;
        if (row.is_open) open += 1;
      }

      res.json({
        total: raw.bugs.length,
        open,
        resolved: raw.bugs.length - open,
        bySeverity,
        byCategory,
        byComponent,
        matrix,
        cachedAt: new Date(index.builtAt).toISOString(),
      });
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
      });

      res.json({
        bug: { ...bug, description, triage: classification, grouping: facts.grouping, facts },
        comments,
        attachments,
      });
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
