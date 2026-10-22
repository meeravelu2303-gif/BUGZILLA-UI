import { z } from 'zod';
import { CATEGORIES, PRIORITIES, SEVERITIES, SOURCES } from '../lib/classification';
import { normalizeUser, userDetailSchema } from './common';
import { subcomponentName } from '../lib/subcomponents';

/**
 * Loose schema for a raw Bugzilla bug object (list item or detail). Uses
 * .passthrough() because Bugzilla exposes custom/per-product fields we don't
 * want to reject - see docs/API_CONTRACT.md #10.
 */
export const rawBugSchema = z
  .object({
    id: z.number(),
    alias: z.union([z.string(), z.array(z.string())]).optional(),
    summary: z.string(),
    status: z.string(),
    resolution: z.string().default(''),
    is_open: z.boolean(),
    is_confirmed: z.boolean().optional(),
    product: z.string(),
    component: z.string(),
    version: z.string(),
    priority: z.string(),
    severity: z.string(),
    op_sys: z.string(),
    platform: z.string(),
    target_milestone: z.string().optional(),
    classification: z.string().optional(),
    assigned_to: z.string().optional(),
    assigned_to_detail: userDetailSchema.optional(),
    creator: z.string().optional(),
    creator_detail: userDetailSchema.optional(),
    qa_contact: z.string().optional(),
    qa_contact_detail: userDetailSchema.optional(),
    cc: z.array(z.string()).optional(),
    cc_detail: z.array(userDetailSchema).optional(),
    keywords: z.array(z.string()).optional(),
    groups: z.array(z.string()).optional(),
    whiteboard: z.string().optional(),
    url: z.string().optional(),
    see_also: z.array(z.string()).optional(),
    depends_on: z.array(z.number()).optional(),
    blocks: z.array(z.number()).optional(),
    creation_time: z.string(),
    last_change_time: z.string(),
    dupe_of: z.number().nullable().optional(),
    /*
     * Time tracking. Bugzilla only includes these for members of
     * `timetrackinggroup`, so "absent" means "not yours to see" and is kept
     * distinct from 0 - the UI hides the section rather than showing zeros.
     */
    deadline: z.string().nullable().optional(),
    estimated_time: z.number().optional(),
    remaining_time: z.number().optional(),
    actual_time: z.number().optional(),
    is_cc_accessible: z.boolean().optional(),
    is_creator_accessible: z.boolean().optional(),
    flags: z
      .array(
        z
          .object({
            id: z.number(),
            type_id: z.number(),
            name: z.string(),
            status: z.string(),
            setter: z.string().optional(),
            requestee: z.string().optional(),
          })
          .passthrough()
      )
      .optional(),
  })
  .passthrough();

export type RawBug = z.infer<typeof rawBugSchema>;

export interface NormalizedBug {
  id: number;
  alias: string[];
  summary: string;
  status: string;
  resolution: string;
  isOpen: boolean;
  isConfirmed: boolean;
  product: string;
  component: string;
  /** Stored sub-component value (`<name> [<component id>]`), `---` for none. */
  subcomponent: string;
  /** Its display name; '' for none. */
  subcomponentName: string;
  version: string;
  priority: string;
  severity: string;
  opSys: string;
  platform: string;
  targetMilestone: string;
  classification: string;
  assignedTo: { id: number; email: string; name: string } | null;
  creator: { id: number; email: string; name: string } | null;
  qaContact: { id: number; email: string; name: string } | null;
  cc: string[];
  /** The CC list with real names, same order as `cc`. Falls back to the login when no detail. */
  ccDetail: { id: number; email: string; name: string }[];
  keywords: string[];
  groups: string[];
  whiteboard: string;
  url: string;
  seeAlso: string[];
  dependsOn: number[];
  blocks: number[];
  creationTime: string;
  lastChangeTime: string;
  dupeOf: number | null;
  /** `null` when the caller is outside Bugzilla's time-tracking group, not "no deadline". */
  timeTracking: {
    deadline: string | null;
    estimatedTime: number;
    remainingTime: number;
    actualTime: number;
  } | null;
  isCcAccessible: boolean;
  isCreatorAccessible: boolean;
  /** Original Mantis issue number for bugs imported from Mantis (custom field cf_mantis_ref), else ''. */
  mantisRef: string;
  flags: { id: number; typeId: number; name: string; status: string; setter: string; requestee: string }[];
}

export function normalizeBug(raw: RawBug): NormalizedBug {
  return {
    id: raw.id,
    alias: Array.isArray(raw.alias) ? raw.alias : raw.alias ? [raw.alias] : [],
    summary: raw.summary,
    status: raw.status,
    resolution: raw.resolution,
    isOpen: raw.is_open,
    isConfirmed: raw.is_confirmed ?? raw.status !== 'UNCONFIRMED',
    product: raw.product,
    component: raw.component,
    // A custom field, so it only arrives through .passthrough().
    subcomponent: typeof raw.cf_subcomponent === 'string' && raw.cf_subcomponent ? raw.cf_subcomponent : '---',
    subcomponentName: subcomponentName(typeof raw.cf_subcomponent === 'string' ? raw.cf_subcomponent : ''),
    version: raw.version,
    priority: raw.priority,
    severity: raw.severity,
    opSys: raw.op_sys,
    platform: raw.platform,
    targetMilestone: raw.target_milestone ?? '---',
    classification: raw.classification ?? '',
    assignedTo: normalizeUser(raw.assigned_to_detail) ?? (raw.assigned_to ? { id: 0, email: raw.assigned_to, name: raw.assigned_to } : null),
    creator: normalizeUser(raw.creator_detail) ?? (raw.creator ? { id: 0, email: raw.creator, name: raw.creator } : null),
    qaContact: normalizeUser(raw.qa_contact_detail) ?? (raw.qa_contact ? { id: 0, email: raw.qa_contact, name: raw.qa_contact } : null),
    cc: raw.cc ?? [],
    ccDetail: (raw.cc ?? []).map((email) => {
      const detail = raw.cc_detail?.find((d) => d.email === email || d.name === email);
      return normalizeUser(detail) ?? { id: 0, email, name: email };
    }),
    keywords: raw.keywords ?? [],
    groups: raw.groups ?? [],
    whiteboard: raw.whiteboard ?? '',
    url: raw.url ?? '',
    seeAlso: raw.see_also ?? [],
    dependsOn: raw.depends_on ?? [],
    blocks: raw.blocks ?? [],
    creationTime: raw.creation_time,
    lastChangeTime: raw.last_change_time,
    dupeOf: raw.dupe_of ?? null,
    timeTracking:
      raw.estimated_time === undefined
        ? null
        : {
            deadline: raw.deadline ?? null,
            estimatedTime: raw.estimated_time,
            remainingTime: raw.remaining_time ?? 0,
            actualTime: raw.actual_time ?? 0,
          },
    isCcAccessible: raw.is_cc_accessible ?? true,
    isCreatorAccessible: raw.is_creator_accessible ?? true,
    // A custom field, so it only arrives through .passthrough().
    mantisRef: typeof raw.cf_mantis_ref === 'string' ? raw.cf_mantis_ref : '',
    flags: (raw.flags ?? []).map((f) => ({
      id: f.id,
      typeId: f.type_id,
      name: f.name,
      status: f.status,
      setter: f.setter ?? '',
      requestee: f.requestee ?? '',
    })),
  };
}

export const rawCommentSchema = z
  .object({
    id: z.number(),
    count: z.number(),
    text: z.string(),
    creator: z.string(),
    creation_time: z.string(),
    is_private: z.boolean(),
    attachment_id: z.number().nullable(),
    tags: z.array(z.string()).optional(),
  })
  .passthrough();

export interface NormalizedComment {
  id: number;
  count: number;
  text: string;
  author: string;
  creationTime: string;
  isPrivate: boolean;
  attachmentId: number | null;
  tags: string[];
}

export function normalizeComment(raw: z.infer<typeof rawCommentSchema>): NormalizedComment {
  return {
    id: raw.id,
    count: raw.count,
    text: raw.text,
    author: raw.creator,
    creationTime: raw.creation_time,
    isPrivate: raw.is_private,
    attachmentId: raw.attachment_id,
    tags: raw.tags ?? [],
  };
}

export const rawAttachmentSchema = z
  .object({
    id: z.number(),
    bug_id: z.number(),
    file_name: z.string(),
    summary: z.string(),
    content_type: z.string(),
    size: z.number(),
    is_patch: z.union([z.boolean(), z.number()]),
    is_obsolete: z.union([z.boolean(), z.number()]),
    is_private: z.union([z.boolean(), z.number()]),
    creator: z.string(),
    creation_time: z.string(),
  })
  .passthrough();

export interface NormalizedAttachment {
  id: number;
  bugId: number;
  fileName: string;
  summary: string;
  contentType: string;
  size: number;
  isPatch: boolean;
  isObsolete: boolean;
  isPrivate: boolean;
  creator: string;
  creationTime: string;
}

export function normalizeAttachment(raw: z.infer<typeof rawAttachmentSchema>): NormalizedAttachment {
  return {
    id: raw.id,
    bugId: raw.bug_id,
    fileName: raw.file_name,
    summary: raw.summary,
    contentType: raw.content_type,
    size: raw.size,
    isPatch: Boolean(raw.is_patch),
    isObsolete: Boolean(raw.is_obsolete),
    isPrivate: Boolean(raw.is_private),
    creator: raw.creator,
    creationTime: raw.creation_time,
  };
}

// ---- Request payload validation ----

/**
 * A repeatable query parameter. Express gives a bare string for `?x=a` and an
 * array for `?x=a&x=b`; both must validate identically, because multi-select
 * within one axis is expressed as a repeated key. Empty strings are dropped so
 * a cleared dropdown does not become a filter for "".
 */
function repeatable<T extends z.ZodTypeAny>(item: T) {
  return z.preprocess(
    (v) => (v === undefined ? undefined : (Array.isArray(v) ? v : [v]).filter((s) => s !== '')),
    z.array(item).optional()
  );
}

/** Free-text facet values (product/component/status) - user data, not a fixed vocabulary. */
const facetValue = z.string().min(1).max(200);

/** A calendar day, `YYYY-MM-DD`, that actually exists (no 2026-02-30). */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), 'Not a real date.');

export const listBugsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(25),
  offset: z.coerce.number().int().min(0).default(0),

  // --- the two classification axes; invalid values are rejected with a 400 ---
  severity: repeatable(z.enum(SEVERITIES)),
  priority: repeatable(z.enum(PRIORITIES)),
  category: repeatable(z.enum(CATEGORIES)),
  /*
   * Browser is UI-bench only: it comes from the `[browser:…]` whiteboard tag,
   * which API-bench bugs never carry. Not restricted to the BROWSERS enum on
   * purpose — a Playwright project added to the bench before this list is
   * updated should still be filterable rather than 400.
   */
  browser: repeatable(facetValue),
  /** Automation (filed by a bench) or Manual (filed by a person) - the `[source:…]` tag. */
  source: repeatable(z.enum(SOURCES)),

  // --- multi-select facets over Bugzilla's own values ---
  product: repeatable(facetValue),
  component: repeatable(facetValue),
  /** Stored sub-component values (`<name> [<component id>]`); `---` = bugs with none. */
  subcomponent: repeatable(facetValue),
  status: repeatable(facetValue),
  /*
   * Resolution, so a reader can separate FIXED from INVALID and DUPLICATE among closed bugs.
   * Status alone cannot: all three are RESOLVED, and "what did we actually fix?" is the question
   * a triage review exists to answer. An open bug carries an empty resolution, which Bugzilla
   * matches with the literal `---`.
   */
  resolution: repeatable(facetValue),

  // --- single-valued filters ---
  assignedTo: z.string().optional(),
  /**
   * Narrows by WHO owns the bug, in the sense the dashboard tiles use:
   *
   *   picked  the assignee is a person someone chose
   *   queued  the assignee is still the component's default owner
   *
   * Not expressible as a Bugzilla search term - "unassigned" has no
   * representation there, since `assigned_to` is NOT NULL and a new bug is
   * given the component's `initialowner`. So it is resolved in the BFF against
   * the component owner map, the same way the counts are.
   */
  assignment: z.enum(['picked', 'queued', 'reassigned']).optional(),
  creator: z.string().optional(),
  cc: z.string().optional(),
  search: z.string().optional(),
  /** Soft-deleted bugs: hidden by default; `only` is the testers' "Deleted bugs" view. */
  deleted: z.enum(['exclude', 'only', 'include']).default('exclude'),

  /**
   * Date range, inclusive on both ends: `from=2026-10-01&to=2026-10-31` is October. Applies to
   * the date the bug was filed (`created`) or last changed (`updated`). Either end may be open.
   */
  dateField: z.enum(['created', 'updated']).default('created'),
  from: isoDate.optional(),
  to: isoDate.optional(),

  sortBy: z.string().default('last_change_time'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type ListBugsQuery = z.infer<typeof listBugsQuerySchema>;

/**
 * Same filters as the list endpoint, minus pagination and sorting - a count has
 * no page and no order. Derived from listBugsQuerySchema so the two can't drift.
 */
export const countBugsQuerySchema = listBugsQuerySchema.pick({
  product: true,
  component: true,
  subcomponent: true,
  status: true,
  resolution: true,
  severity: true,
  priority: true,
  category: true,
  browser: true,
  source: true,
  assignedTo: true,
  assignment: true,
  creator: true,
  cc: true,
  search: true,
  deleted: true,
  dateField: true,
  from: true,
  to: true,
});

export type CountBugsQuery = z.infer<typeof countBugsQuerySchema>;

/**
 * The list's filters AND its sort, minus pagination - an export takes every
 * matching bug, in the order the table shows them. Derived from
 * listBugsQuerySchema so a new filter reaches the export without a second edit.
 */
export const exportBugsQuerySchema = listBugsQuerySchema.omit({ limit: true, offset: true });

/**
 * The only three fields the dashboard tallies need. Kept deliberately narrow:
 * the count endpoint asks Bugzilla for these alone via include_fields, so a
 * count over thousands of bugs never pulls descriptions, users, cc or keywords.
 */
export const bugCountRowSchema = z
  .object({
    id: z.number(),
    is_open: z.boolean(),
    status: z.string(),
    severity: z.string(),
    /* For the unassigned tally below - optional so an older caller that does
       not ask for them still parses. */
    assigned_to: z.string().optional(),
    product: z.string().optional(),
    component: z.string().optional(),
  })
  .passthrough();

export interface BugCounts {
  total: number;
  /**
   * Open bugs still sitting with their component's default assignee - parked in
   * that component's queue, not yet routed to a person.
   *
   * NOT called "unassigned": Bugzilla's `assigned_to` is NOT NULL, so there is
   * no unassigned state to count. A bug always has an owner; the question is
   * whether that owner is the component default or a person someone chose.
   *
   * 0 when the caller did not supply the component owner map.
   */
  queued: number;
  /**
   * Open bugs whose assignee differs from the component default.
   *
   * A weak signal on its own: it cannot tell a bug that was REASSIGNED from one
   * that was simply FILED to that person. Use `reassigned` for the strict
   * reading. `queued + picked === open` whenever the owner map is available.
   */
  picked: number;
  /**
   * Open bugs genuinely handed off: the assignee differs from the component
   * default AND `bugs_activity` records an `assigned_to` change since filing.
   *
   * This is the honest "a human routed this to someone" number. It is a subset
   * of `picked` - always less than or equal to it - and is the one safe to put
   * in front of people, because it cannot be inflated by a bench run that fills
   * in an assignee at creation time.
   *
   * 0 when the caller did not resolve bug history.
   */
  reassigned: number;
  open: number;
  resolved: number;
  blockerCritical: number;
  /** Full-population breakdowns for the dashboard charts - every bug, not a page. */
  byStatus: Record<string, number>;
  bySeverity: Record<string, number>;
}

/** Severities the "Blocker / Critical" stat card counts, per Bugzilla's own field values. */
const HIGH_SEVERITIES = new Set(['blocker', 'critical']);

/**
 * `product::component` -> that component's default assignee, lower-cased.
 *
 * Keyed by both because component names repeat across products - "API" exists
 * under more than one - and matching on the component name alone would compare
 * a bug against another product's default owner.
 */
export type ComponentOwners = Map<string, string>;

export function componentOwnerKey(product: string, component: string): string {
  return `${product.toLowerCase()}::${component.toLowerCase()}`;
}

/**
 * Open bugs whose assignee is NOT the component default - the only bugs that
 * could possibly have been reassigned, and so the only ones worth a history
 * lookup. Everything still sitting with its default owner is excluded by
 * definition.
 */
export function reassignmentCandidates(
  rows: z.infer<typeof bugCountRowSchema>[],
  defaultOwners: ComponentOwners
): number[] {
  const ids: number[] = [];
  for (const row of rows) {
    if (!row.is_open || !row.assigned_to || !row.product || !row.component) continue;
    const owner = defaultOwners.get(componentOwnerKey(row.product, row.component));
    if (owner && owner !== row.assigned_to.toLowerCase()) ids.push(row.id);
  }
  return ids;
}

export function tallyBugCounts(
  rows: z.infer<typeof bugCountRowSchema>[],
  defaultOwners?: ComponentOwners
): BugCounts {
  let open = 0;
  let blockerCritical = 0;
  let queued = 0;
  let picked = 0;
  const byStatus: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};

  for (const row of rows) {
    if (row.is_open) open += 1;
    if (HIGH_SEVERITIES.has(row.severity)) blockerCritical += 1;

    /*
     * Open only: a resolved bug still sitting with the default owner was
     * closed by someone, so counting it as "waiting to be picked up" would be
     * wrong - and would make this tile grow forever.
     */
    if (row.is_open && defaultOwners && row.assigned_to && row.product && row.component) {
      const owner = defaultOwners.get(componentOwnerKey(row.product, row.component));
      // An unknown component (owner undefined) counts as neither, rather than
      // being guessed into one bucket and skewing both.
      if (owner) {
        if (owner === row.assigned_to.toLowerCase()) queued += 1;
        else picked += 1;
      }
    }

    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    bySeverity[row.severity] = (bySeverity[row.severity] ?? 0) + 1;
  }

  return {
    total: rows.length,
    open,
    resolved: rows.length - open,
    blockerCritical,
    queued,
    picked,
    // Filled in by the caller, which alone can reach bug history.
    reassigned: 0,
    byStatus,
    bySeverity,
  };
}

export const createBugSchema = z.object({
  product: z.string().min(1, 'Product is required'),
  component: z.string().min(1, 'Component is required'),
  /** Stored value of one of the component's sub-components; omitted or '' = none. */
  subcomponent: z.string().max(80).optional(),
  summary: z.string().min(1, 'Summary is required').max(255),
  description: z.string().optional(),
  version: z.string().optional(),
  opSys: z.string().optional(),
  platform: z.string().optional(),
  severity: z.string().optional(),
  priority: z.string().optional(),
  /** `[cat:Xxx]` (+ `[browser:…]`) - the same tags the test bench writes. */
  whiteboard: z.string().max(255).optional(),
  /**
   * Who to hand the bug to, as a Bugzilla login.
   *
   * Optional, and omitting it is the NORMAL path: Bugzilla then applies the
   * component's `initialowner`, which is how the test bench's bugs reach the
   * right queue without the bench knowing anything about people. A tester
   * filing by hand can route it to a developer immediately instead.
   */
  assignedTo: z.string().email('Enter a valid assignee email').optional(),
});

/**
 * One evidence file for a bug, base64-encoded. 15 MB decoded keeps the JSON body under the route's
 * 25 MB limit; Bugzilla itself accepts up to 50 MB here (maxattachmentsize).
 */
export const createAttachmentSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(100),
  data: z
    .string()
    .min(1)
    .refine((d) => Math.floor((d.length * 3) / 4) <= 15 * 1024 * 1024, 'Attachments are limited to 15 MB each.'),
  summary: z.string().max(255).optional(),
});

export type CreateBugInput = z.infer<typeof createBugSchema>;

/**
 * Bugzilla's add/remove shape for list fields (cc, keywords, depends_on, ...).
 * Deltas rather than a full replacement list, so two people editing the CC
 * list at once each add their own name instead of the later save silently
 * dropping the earlier one.
 */
function listChange<T extends z.ZodTypeAny>(item: T) {
  return z
    .object({
      add: z.array(item).max(100).optional(),
      remove: z.array(item).max(100).optional(),
    })
    .refine((v) => (v.add?.length ?? 0) + (v.remove?.length ?? 0) > 0, { message: 'Nothing to add or remove' })
    .optional();
}

const bugIdValue = z.coerce.number().int().positive();
const hours = z.number().min(0).max(99999.99);

export const updateBugSchema = z
  .object({
    /**
     * The `lastChangeTime` the editor loaded. When it no longer matches the bug,
     * someone else saved in between and the request is refused with a 409
     * instead of quietly overwriting their change ("mid-air collision").
     */
    lastChangeTime: z.string().optional(),

    summary: z.string().trim().min(1).max(255).optional(),
    status: z.string().optional(),
    resolution: z.string().optional(),
    priority: z.string().optional(),
    severity: z.string().optional(),

    /** Moving products needs a component and version that exist in the new one. */
    product: z.string().min(1).optional(),
    component: z.string().optional(),
    /**
     * Stored sub-component value, or '' to clear. Must belong to the bug's
     * (new) component. Changing product or component without sending this
     * clears it, since the old one belongs to the old component.
     */
    subcomponent: z.string().max(80).optional(),
    version: z.string().optional(),
    targetMilestone: z.string().optional(),
    opSys: z.string().optional(),
    platform: z.string().optional(),

    assignedTo: z.string().email().optional(),
    /** Hand the bug back to the component's default assignee. */
    resetAssignedTo: z.literal(true).optional(),
    /** `''` clears the QA contact. */
    qaContact: z.union([z.string().email(), z.literal('')]).optional(),
    resetQaContact: z.literal(true).optional(),
    cc: listChange(z.string().email()),

    dependsOn: listChange(bugIdValue),
    blocks: listChange(bugIdValue),
    seeAlso: listChange(z.string().trim().min(1).max(255)),
    url: z.union([z.string().trim().url().max(255), z.literal('')]).optional(),
    alias: listChange(
      z
        .string()
        .trim()
        .min(1)
        .max(40)
        .regex(/^(?!\d+$)[^\s,]+$/, 'An alias cannot contain spaces or commas, and cannot be only digits.')
    ),
    keywords: listChange(z.string().min(1).max(64)),

    /** `YYYY-MM-DD`, or `''` to clear it. */
    deadline: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.'), z.literal('')]).optional(),
    estimatedTime: hours.optional(),
    remainingTime: hours.optional(),
    /** Hours worked, ADDED to the total (not a new total). Negative corrects an over-logged entry. */
    workTime: z.number().min(-99999.99).max(99999.99).refine((n) => n !== 0, 'Hours worked cannot be 0.').optional(),

    /** Who can see the bug: the product groups it is restricted to. */
    groups: listChange(z.string().min(1).max(255)),
    isCcAccessible: z.boolean().optional(),
    isCreatorAccessible: z.boolean().optional(),

    flags: z
      .array(
        z
          .object({
            id: z.number().int().positive().optional(),
            typeId: z.number().int().positive().optional(),
            /** `X` clears a flag. */
            status: z.enum(['+', '-', '?', 'X']),
            requestee: z.string().email().optional(),
          })
          .refine((f) => f.id !== undefined || f.typeId !== undefined, 'A flag needs an id or a type id.')
      )
      .max(50)
      .optional(),

    /** Posted with the change, so the bug history says why it was made. */
    comment: z
      .object({
        body: z.string().trim().min(1).max(65535),
        isPrivate: z.boolean().optional(),
      })
      .optional(),

    whiteboard: z.string().optional(),
    /**
     * The bug this one duplicates. Required by Bugzilla whenever the resolution
     * is DUPLICATE - without it the update is rejected with "You must specify a
     * bug id to mark this bug as a duplicate of", which is what the Resolution
     * dropdown used to produce, since it could set DUPLICATE but never name a
     * target.
     */
    dupeOf: z.coerce.number().int().positive().optional(),
  })
  .strict()
  .refine((obj) => Object.keys(obj).some((k) => k !== 'lastChangeTime'), { message: 'At least one field must be provided' })
  .refine((obj) => !(obj.assignedTo && obj.resetAssignedTo), {
    message: 'Choose an assignee or reset to the default - not both.',
  })
  .refine((obj) => !(obj.qaContact !== undefined && obj.resetQaContact), {
    message: 'Choose a QA contact or reset to the default - not both.',
  });

/** The whole bug report, rewritten (see lib/reportRevision.ts), plus its category. */
export const updateReportSchema = z
  .object({
    text: z.string().trim().min(1, 'The report cannot be empty.').max(60000, 'The report is too long (60,000 characters max).'),
    category: z.enum(CATEGORIES).optional(),
    /** Why it was edited - appended to the revision comment. */
    note: z.string().trim().max(1000).optional(),
    /**
     * How many report revisions existed when the editor opened. If someone else saved a revision
     * since, the save is refused (409) rather than silently replacing their report. Unrelated
     * activity - a comment, a status change - does not count. Omitted = save regardless.
     */
    baseRevisions: z.number().int().min(0).optional(),
  })
  .strict();

/** Soft delete / restore, one bug or many. */
export const softDeleteSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1).max(100),
  reason: z.string().trim().min(3, 'Say why - at least a few words.').max(1000),
});

export const restoreSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1).max(100),
});

/** Cross-product transfer (lib/productTransfer.ts). `.strict()` so nothing else rides along on the elevated call. */
export const transferBugSchema = z
  .object({
    product: z.string().trim().min(1).max(200),
    component: z.string().trim().min(1).max(200),
    version: z.string().trim().min(1).max(64).optional(),
    assignee: z.string().trim().email().max(255).optional(),
    reason: z.string().trim().min(10, 'Say why it belongs to the other team - at least a short sentence.').max(2000),
  })
  .strict();

/** Editable attachment properties - Bugzilla's `PUT /bug/attachment/{id}`. */
export const updateAttachmentSchema = z
  .object({
    summary: z.string().trim().min(1).max(255).optional(),
    fileName: z.string().trim().min(1).max(255).optional(),
    contentType: z
      .string()
      .trim()
      .regex(/^[\w.+-]+\/[\w.+-]+$/, 'Enter a MIME type such as image/png or text/plain.')
      .optional(),
    isObsolete: z.boolean().optional(),
    isPatch: z.boolean().optional(),
    isPrivate: z.boolean().optional(),
    comment: z.string().trim().min(1).max(65535).optional(),
  })
  .strict()
  .refine((obj) => Object.keys(obj).some((k) => k !== 'comment'), { message: 'At least one field must be provided' });

export type UpdateAttachmentInput = z.infer<typeof updateAttachmentSchema>;

/** Comment tags - Bugzilla's `PUT /bug/comment/{id}/tags`. */
export const updateCommentTagsSchema = z
  .object({
    add: z.array(z.string().trim().min(1).max(24).regex(/^[^\s,]+$/, 'A tag cannot contain spaces or commas.')).max(20).optional(),
    remove: z.array(z.string().min(1).max(24)).max(20).optional(),
  })
  .strict()
  .refine((v) => (v.add?.length ?? 0) + (v.remove?.length ?? 0) > 0, { message: 'Nothing to add or remove' });

/**
 * Bulk reassignment: one assignee applied to many bugs at once. Bugzilla's `Bug.update` accepts
 * an id array, so this maps to a single REST call. Capped at 500 to stay within one request.
 */
export const bulkReassignSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1).max(500),
  assignedTo: z.string().email(),
});

export type UpdateBugInput = z.infer<typeof updateBugSchema>;

export const addCommentSchema = z.object({
  comment: z.string().min(1, 'Comment text is required'),
  isPrivate: z.boolean().optional().default(false),
});

export type AddCommentInput = z.infer<typeof addCommentSchema>;
