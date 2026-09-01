import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../config/env';
import { requireAuth } from '../middleware/auth';
import { getCategoryIndex } from '../lib/categoryIndex';
import {
  CATEGORIES,
  SEVERITIES,
  browsersOf,
  classify,
  toBugzillaQuery,
  type BugFilters,
  type Category,
  type Severity,
} from '../lib/classification';
import type { BugzillaClient } from '../lib/bugzillaClient';
import { closedStatuses } from '../lib/bugStatus';
import { AppError } from '../lib/errors';
import { parseDescription } from '../lib/grouping';
import { displayNameFor, resolveDisplayNames } from '../lib/displayNames';
import { parseInput } from '../lib/validate';
import {
  addCommentSchema,
  bugCountRowSchema,
  countBugsQuerySchema,
  createBugSchema,
  listBugsQuerySchema,
  bulkReassignSchema,
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
const TIEBREAKERS = [
  { field: 'bug_id', clause: 'bug_id ASC' },
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
 * `actor` enables the ownership rule: a caller who cannot triage may only move
 * bugs already assigned to them.
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
  actor?: { email: string; canTriage: boolean }
): Promise<void> {
  const resp = await client.get<{
    bugs: { id: number; status: string; is_open: boolean; assigned_to: string }[];
  }>('/bug', {
    id: ids.join(','),
    include_fields: 'id,status,is_open,assigned_to',
    limit: 0,
  });

  if (actor && !actor.canTriage) {
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
          `Only the current assignee, or a tester, can hand a bug on.`
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
      // A coarse sort (e.g. severity has four values) leaves hundreds of bugs
      // equal-ranked, so without tiebreakers they come back in an arbitrary order
      // that shifts between pages. Each tiebreaker is skipped when the chosen sort
      // already contains that column, so a column is never named twice.
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
      const openMatrix = Object.fromEntries(
        SEVERITIES.map((s) => [s, zeroed(CATEGORIES)])
      ) as Record<Severity, Record<Category, number>>;

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

      let open = 0;
      for (const row of raw.bugs) {
        const { severity } = classify({ severity: row.severity, priority: row.priority, whiteboard: row.whiteboard });
        const category = index.categoryOf(row.id);
        bySeverity[severity] += 1;
        byCategory[category] += 1;
        matrix[severity][category] += 1;
        byComponent[row.component] = (byComponent[row.component] ?? 0) + 1;
        const browsers = browsersOf(row.whiteboard);
        for (const browser of browsers) byBrowser[browser] = (byBrowser[browser] ?? 0) + 1;
        if (row.is_open) {
          open += 1;
          openBySeverity[severity] += 1;
          openByCategory[category] += 1;
          openMatrix[severity][category] += 1;
          openByComponent[row.component] = (openByComponent[row.component] ?? 0) + 1;
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
        byBrowser,
        matrix,
        openBySeverity,
        openByCategory,
        openByComponent,
        openByBrowser,
        openMatrix,
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
      const parsedComments = rawComments
        .map((c) => normalizeComment(rawCommentSchema.parse(c)))
        .sort((a, b) => a.count - b.count);
      const description = parsedComments.find((c) => c.count === 0)?.text ?? '';

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
      const comments = parsedComments.map((c) => ({ ...c, author: displayNameFor(names, c.author) }));
      const attachments = parsedAttachments.map((a) => ({
        ...a,
        creator: displayNameFor(names, a.creator),
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
      const resp = await client.get<{ attachments: Record<string, { data: string; file_name: string; content_type: string }> }>(
        `/bug/attachment/${attachmentId}`
      );
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
        canTriage: req.sessionUser!.permissions.canTriage,
      });
      // Bugzilla requires an id in the URL; the body `ids` array is what selects every bug to
      // change, so all of them are updated by this one request.
      await req.bugzilla!.put(`/bug/${ids[0]}`, { ids, assigned_to: assignedTo });
      res.json({ updated: ids.length });
    } catch (err) {
      next(err);
    }
  });

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

      // Only guard when the assignee is actually changing: every other edit
      // (adding a resolution, correcting a component) stays legal on a closed bug.
      if (input.assignedTo !== undefined) {
        await assertReassignable(client, [id], input.status, {
          email: req.sessionUser!.email,
          canTriage: req.sessionUser!.permissions.canTriage,
        });
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
