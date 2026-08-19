import { z } from 'zod';
import { CATEGORIES, PRIORITIES, SEVERITIES } from '../lib/classification';
import { normalizeUser, userDetailSchema } from './common';

/**
 * Loose schema for a raw Bugzilla bug object (list item or detail). Uses
 * .passthrough() because Bugzilla exposes custom/per-product fields we don't
 * want to reject - see API_CONTRACT.md #10.
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
    cc: z.array(z.string()).optional(),
    keywords: z.array(z.string()).optional(),
    groups: z.array(z.string()).optional(),
    whiteboard: z.string().optional(),
    url: z.string().optional(),
    depends_on: z.array(z.number()).optional(),
    blocks: z.array(z.number()).optional(),
    creation_time: z.string(),
    last_change_time: z.string(),
    dupe_of: z.number().nullable().optional(),
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
  version: string;
  priority: string;
  severity: string;
  opSys: string;
  platform: string;
  targetMilestone: string;
  classification: string;
  assignedTo: { id: number; email: string; name: string } | null;
  creator: { id: number; email: string; name: string } | null;
  cc: string[];
  keywords: string[];
  groups: string[];
  whiteboard: string;
  url: string;
  dependsOn: number[];
  blocks: number[];
  creationTime: string;
  lastChangeTime: string;
  dupeOf: number | null;
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
    version: raw.version,
    priority: raw.priority,
    severity: raw.severity,
    opSys: raw.op_sys,
    platform: raw.platform,
    targetMilestone: raw.target_milestone ?? '---',
    classification: raw.classification ?? '',
    assignedTo: normalizeUser(raw.assigned_to_detail) ?? (raw.assigned_to ? { id: 0, email: raw.assigned_to, name: raw.assigned_to } : null),
    creator: normalizeUser(raw.creator_detail) ?? (raw.creator ? { id: 0, email: raw.creator, name: raw.creator } : null),
    cc: raw.cc ?? [],
    keywords: raw.keywords ?? [],
    groups: raw.groups ?? [],
    whiteboard: raw.whiteboard ?? '',
    url: raw.url ?? '',
    dependsOn: raw.depends_on ?? [],
    blocks: raw.blocks ?? [],
    creationTime: raw.creation_time,
    lastChangeTime: raw.last_change_time,
    dupeOf: raw.dupe_of ?? null,
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

export const listBugsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(25),
  offset: z.coerce.number().int().min(0).default(0),

  // --- the two classification axes; invalid values are rejected with a 400 ---
  severity: repeatable(z.enum(SEVERITIES)),
  priority: repeatable(z.enum(PRIORITIES)),
  category: repeatable(z.enum(CATEGORIES)),

  // --- multi-select facets over Bugzilla's own values ---
  product: repeatable(facetValue),
  component: repeatable(facetValue),
  status: repeatable(facetValue),
  /** Business tier of the affected module, from the `[tierN]` whiteboard tag. */
  tier: repeatable(z.coerce.number().int().min(1).max(9)),

  // --- single-valued filters ---
  assignedTo: z.string().optional(),
  creator: z.string().optional(),
  cc: z.string().optional(),
  search: z.string().optional(),

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
  status: true,
  severity: true,
  priority: true,
  category: true,
  tier: true,
  assignedTo: true,
  creator: true,
  cc: true,
  search: true,
});

export type CountBugsQuery = z.infer<typeof countBugsQuerySchema>;

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
  })
  .passthrough();

export interface BugCounts {
  total: number;
  open: number;
  resolved: number;
  blockerCritical: number;
  /** Full-population breakdowns for the dashboard charts - every bug, not a page. */
  byStatus: Record<string, number>;
  bySeverity: Record<string, number>;
}

/** Severities the "Blocker / Critical" stat card counts, per Bugzilla's own field values. */
const HIGH_SEVERITIES = new Set(['blocker', 'critical']);

export function tallyBugCounts(rows: z.infer<typeof bugCountRowSchema>[]): BugCounts {
  let open = 0;
  let blockerCritical = 0;
  const byStatus: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};

  for (const row of rows) {
    if (row.is_open) open += 1;
    if (HIGH_SEVERITIES.has(row.severity)) blockerCritical += 1;
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    bySeverity[row.severity] = (bySeverity[row.severity] ?? 0) + 1;
  }

  return { total: rows.length, open, resolved: rows.length - open, blockerCritical, byStatus, bySeverity };
}

export const createBugSchema = z.object({
  product: z.string().min(1, 'Product is required'),
  component: z.string().min(1, 'Component is required'),
  summary: z.string().min(1, 'Summary is required').max(255),
  description: z.string().optional(),
  version: z.string().optional(),
  opSys: z.string().optional(),
  platform: z.string().optional(),
  severity: z.string().optional(),
  priority: z.string().optional(),
});

export type CreateBugInput = z.infer<typeof createBugSchema>;

export const updateBugSchema = z
  .object({
    summary: z.string().min(1).max(255).optional(),
    status: z.string().optional(),
    resolution: z.string().optional(),
    priority: z.string().optional(),
    severity: z.string().optional(),
    component: z.string().optional(),
    version: z.string().optional(),
    opSys: z.string().optional(),
    platform: z.string().optional(),
    assignedTo: z.string().email().optional(),
    targetMilestone: z.string().optional(),
    whiteboard: z.string().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'At least one field must be provided' });

export type UpdateBugInput = z.infer<typeof updateBugSchema>;

export const addCommentSchema = z.object({
  comment: z.string().min(1, 'Comment text is required'),
  isPrivate: z.boolean().optional().default(false),
});

export type AddCommentInput = z.infer<typeof addCommentSchema>;
