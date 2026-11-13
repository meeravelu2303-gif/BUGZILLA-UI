import { z } from 'zod';
import { CATEGORIES, PRIORITIES, SEVERITIES, SOURCES } from '../services/classification.service';
import { normalizeUser, userDetailSchema } from './common.dto';
import { subcomponentName } from '../services/subcomponents.service';

/** Loose schema for a raw Bugzilla bug object (list item or detail). */
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
          .passthrough(),
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
  subcomponent: string;
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
  timeTracking: {
    deadline: string | null;
    estimatedTime: number;
    remainingTime: number;
    actualTime: number;
  } | null;
  isCcAccessible: boolean;
  isCreatorAccessible: boolean;
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
    subcomponent: typeof raw.cf_subcomponent === 'string' && raw.cf_subcomponent ? raw.cf_subcomponent : '---',
    subcomponentName: subcomponentName(typeof raw.cf_subcomponent === 'string' ? raw.cf_subcomponent : ''),
    version: raw.version,
    priority: raw.priority,
    severity: raw.severity,
    opSys: raw.op_sys,
    platform: raw.platform,
    targetMilestone: raw.target_milestone ?? '---',
    classification: raw.classification ?? '',
    assignedTo:
      normalizeUser(raw.assigned_to_detail) ??
      (raw.assigned_to ? { id: 0, email: raw.assigned_to, name: raw.assigned_to } : null),
    creator:
      normalizeUser(raw.creator_detail) ?? (raw.creator ? { id: 0, email: raw.creator, name: raw.creator } : null),
    qaContact:
      normalizeUser(raw.qa_contact_detail) ??
      (raw.qa_contact ? { id: 0, email: raw.qa_contact, name: raw.qa_contact } : null),
    cc: raw.cc ?? [],
    ccDetail: (raw.cc ?? []).map((email) => {
      const detail = raw.cc_detail?.find((item) => item.email === email || item.name === email);
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
    mantisRef: typeof raw.cf_mantis_ref === 'string' ? raw.cf_mantis_ref : '',
    flags: (raw.flags ?? []).map((flag) => ({
      id: flag.id,
      typeId: flag.type_id,
      name: flag.name,
      status: flag.status,
      setter: flag.setter ?? '',
      requestee: flag.requestee ?? '',
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

function repeatable<T extends z.ZodTypeAny>(item: T) {
  return z.preprocess(
    (value) =>
      value === undefined ? undefined : (Array.isArray(value) ? value : [value]).filter((entry) => entry !== ''),
    z.array(item).optional(),
  );
}

const facetValue = z.string().min(1).max(200);

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
  .refine(
    (value) =>
      !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value),
    'Not a real date.',
  );

export const listBugsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(25),
  offset: z.coerce.number().int().min(0).default(0),

  severity: repeatable(z.enum(SEVERITIES)),
  priority: repeatable(z.enum(PRIORITIES)),
  category: repeatable(z.enum(CATEGORIES)),
  browser: repeatable(facetValue),
  source: repeatable(z.enum(SOURCES)),

  product: repeatable(facetValue),
  component: repeatable(facetValue),
  subcomponent: repeatable(facetValue),
  status: repeatable(facetValue),
  resolution: repeatable(facetValue),

  assignedTo: z.string().optional(),
  assignment: z.enum(['picked', 'queued', 'reassigned']).optional(),
  urgent: z
    .enum(['1', 'true'])
    .transform(() => true)
    .optional(),
  creator: z.string().optional(),
  cc: z.string().optional(),
  search: z.string().optional(),
  deleted: z.enum(['exclude', 'only', 'include']).default('exclude'),

  dateField: z.enum(['created', 'updated']).default('created'),
  from: isoDate.optional(),
  to: isoDate.optional(),

  sortBy: z.string().default('last_change_time'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type ListBugsQuery = z.infer<typeof listBugsQuerySchema>;

/** Same filters as the list endpoint, minus pagination and sorting - a count has no page and no order. */
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
  urgent: true,
  creator: true,
  cc: true,
  search: true,
  deleted: true,
  dateField: true,
  from: true,
  to: true,
});

export type CountBugsQuery = z.infer<typeof countBugsQuerySchema>;

/** The list's filters AND its sort. */
export const exportBugsQuerySchema = listBugsQuerySchema.omit({ limit: true, offset: true });

/** The only three fields the dashboard tallies need. */
export const bugCountRowSchema = z
  .object({
    id: z.number(),
    is_open: z.boolean(),
    status: z.string(),
    severity: z.string(),
    priority: z.string().optional(),
    assigned_to: z.string().optional(),
    product: z.string().optional(),
    component: z.string().optional(),
  })
  .passthrough();

export interface BugCounts {
  total: number;
  queued: number;
  picked: number;
  reassigned: number;
  open: number;
  resolved: number;
  blockerCritical: number;
  urgent: number;
  byStatus: Record<string, number>;
  bySeverity: Record<string, number>;
}

const HIGH_SEVERITIES = new Set(['blocker', 'critical']);

/** product::component -> that component's default assignee, lower-cased. */
export type ComponentOwners = Map<string, string>;

export function componentOwnerKey(product: string, component: string): string {
  return `${product.toLowerCase()}::${component.toLowerCase()}`;
}

/** Open bugs whose assignee is NOT the component default. */
export function reassignmentCandidates(
  rows: z.infer<typeof bugCountRowSchema>[],
  defaultOwners: ComponentOwners,
): number[] {
  const ids: number[] = [];
  for (const row of rows) {
    if (!row.is_open || !row.assigned_to || !row.product || !row.component) continue;
    const owner = defaultOwners.get(componentOwnerKey(row.product, row.component));
    if (owner && owner !== row.assigned_to.toLowerCase()) ids.push(row.id);
  }
  return ids;
}

export function tallyBugCounts(rows: z.infer<typeof bugCountRowSchema>[], defaultOwners?: ComponentOwners): BugCounts {
  let open = 0;
  let blockerCritical = 0;
  let urgent = 0;
  let queued = 0;
  let picked = 0;
  const byStatus: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};

  for (const row of rows) {
    if (row.is_open) open += 1;
    if (HIGH_SEVERITIES.has(row.severity)) blockerCritical += 1;
    if (HIGH_SEVERITIES.has(row.severity) || row.priority === 'Highest') urgent += 1;

    if (row.is_open && defaultOwners && row.assigned_to && row.product && row.component) {
      const owner = defaultOwners.get(componentOwnerKey(row.product, row.component));
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
    urgent,
    queued,
    picked,
    reassigned: 0,
    byStatus,
    bySeverity,
  };
}

export const createBugSchema = z.object({
  product: z.string().min(1, 'Product is required'),
  component: z.string().min(1, 'Component is required'),
  subcomponent: z.string().max(80).optional(),
  summary: z.string().min(1, 'Summary is required').max(255),
  description: z.string().optional(),
  version: z.string().optional(),
  opSys: z.string().optional(),
  platform: z.string().optional(),
  severity: z.string().optional(),
  priority: z.string().optional(),
  whiteboard: z.string().max(255).optional(),
  assignedTo: z.string().email('Enter a valid assignee email').optional(),
});

/** One evidence file for a bug, base64-encoded. */
export const createAttachmentSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(100),
  data: z
    .string()
    .min(1)
    .refine(
      (value) => Math.floor((value.length * 3) / 4) <= 15 * 1024 * 1024,
      'Attachments are limited to 15 MB each.',
    ),
  summary: z.string().max(255).optional(),
});

export type CreateBugInput = z.infer<typeof createBugSchema>;

function listChange<T extends z.ZodTypeAny>(item: T) {
  return z
    .object({
      add: z.array(item).max(100).optional(),
      remove: z.array(item).max(100).optional(),
    })
    .refine((value) => (value.add?.length ?? 0) + (value.remove?.length ?? 0) > 0, {
      message: 'Nothing to add or remove',
    })
    .optional();
}

const bugIdValue = z.coerce.number().int().positive();
const hours = z.number().min(0).max(99999.99);

export const updateBugSchema = z
  .object({
    lastChangeTime: z.string().optional(),

    summary: z.string().trim().min(1).max(255).optional(),
    status: z.string().optional(),
    resolution: z.string().optional(),
    priority: z.string().optional(),
    severity: z.string().optional(),

    product: z.string().min(1).optional(),
    component: z.string().optional(),
    subcomponent: z.string().max(80).optional(),
    version: z.string().optional(),
    targetMilestone: z.string().optional(),
    opSys: z.string().optional(),
    platform: z.string().optional(),

    assignedTo: z.string().email().optional(),
    resetAssignedTo: z.literal(true).optional(),
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
        .regex(/^(?!\d+$)[^\s,]+$/, 'An alias cannot contain spaces or commas, and cannot be only digits.'),
    ),
    keywords: listChange(z.string().min(1).max(64)),

    deadline: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.'), z.literal('')]).optional(),
    estimatedTime: hours.optional(),
    remainingTime: hours.optional(),
    workTime: z
      .number()
      .min(-99999.99)
      .max(99999.99)
      .refine((value) => value !== 0, 'Hours worked cannot be 0.')
      .optional(),

    groups: listChange(z.string().min(1).max(255)),
    isCcAccessible: z.boolean().optional(),
    isCreatorAccessible: z.boolean().optional(),

    flags: z
      .array(
        z
          .object({
            id: z.number().int().positive().optional(),
            typeId: z.number().int().positive().optional(),
            status: z.enum(['+', '-', '?', 'X']),
            requestee: z.string().email().optional(),
          })
          .refine((value) => value.id !== undefined || value.typeId !== undefined, 'A flag needs an id or a type id.'),
      )
      .max(50)
      .optional(),

    comment: z
      .object({
        body: z.string().trim().min(1).max(65535),
        isPrivate: z.boolean().optional(),
      })
      .optional(),

    whiteboard: z.string().optional(),
    dupeOf: z.coerce.number().int().positive().optional(),
  })
  .strict()
  .refine((object) => Object.keys(object).some((k) => k !== 'lastChangeTime'), {
    message: 'At least one field must be provided',
  })
  .refine((object) => !(object.assignedTo && object.resetAssignedTo), {
    message: 'Choose an assignee or reset to the default - not both.',
  })
  .refine((object) => !(object.qaContact !== undefined && object.resetQaContact), {
    message: 'Choose a QA contact or reset to the default - not both.',
  });

/** The whole bug report, rewritten (see services/reportRevision.service.ts), plus its category. */
export const updateReportSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, 'The report cannot be empty.')
      .max(60000, 'The report is too long (60,000 characters max).'),
    category: z.enum(CATEGORIES).optional(),
    note: z.string().trim().max(1000).optional(),
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

/** Cross-product transfer (services/productTransfer.service.ts). */
export const transferBugSchema = z
  .object({
    product: z.string().trim().min(1).max(200),
    component: z.string().trim().min(1).max(200),
    version: z.string().trim().min(1).max(64).optional(),
    assignee: z.string().trim().email().max(255).optional(),
    reason: z.string().trim().min(10, 'Say why it belongs to the other team - at least a short sentence.').max(2000),
  })
  .strict();

/** Editable attachment properties - Bugzilla's PUT /bug/attachment/{id}. */
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
  .refine((object) => Object.keys(object).some((k) => k !== 'comment'), {
    message: 'At least one field must be provided',
  });

export type UpdateAttachmentInput = z.infer<typeof updateAttachmentSchema>;

/** Comment tags - Bugzilla's PUT /bug/comment/{id}/tags. */
export const updateCommentTagsSchema = z
  .object({
    add: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(24)
          .regex(/^[^\s,]+$/, 'A tag cannot contain spaces or commas.'),
      )
      .max(20)
      .optional(),
    remove: z.array(z.string().min(1).max(24)).max(20).optional(),
  })
  .strict()
  .refine((value) => (value.add?.length ?? 0) + (value.remove?.length ?? 0) > 0, {
    message: 'Nothing to add or remove',
  });

/** Bulk reassignment: one assignee applied to many bugs at once. */
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

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export interface BugCommentInfo {
  description?: string;
  lastComment?: { text: string; author: string; createdAt: string };
  history?: Array<{ text: string; author: string; createdAt: string }>;
}
