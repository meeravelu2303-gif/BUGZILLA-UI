export interface UserRef {
  id: number;
  email: string;
  name: string;
}

export interface Bug {
  id: number;
  /**
   * The two-axis classification, computed by the backend on both list and
   * detail responses. Named `triage` rather than `classification` because
   * `classification` below is Bugzilla's own product-classification string.
   */
  triage?: Classification;
  /** Detail responses only - the list deliberately does not carry grouping. */
  grouping?: Grouping;
  facts?: DescriptionFacts;
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
  assignedTo: UserRef | null;
  creator: UserRef | null;
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
  description?: string;
}

export interface Comment {
  id: number;
  count: number;
  text: string;
  author: string;
  creationTime: string;
  isPrivate: boolean;
  attachmentId: number | null;
}

export interface Attachment {
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

export interface Product {
  id: number;
  name: string;
  isActive: boolean;
  components: { name: string; defaultAssignee: string }[];
  versions: string[];
  milestones: string[];
}

export interface WorkflowTransition {
  status: string;
  isOpen: boolean;
  canChangeTo: string[];
}

export interface BugMeta {
  statuses: string[];
  resolutions: string[];
  severities: string[];
  priorities: string[];
  opSystems: string[];
  platforms: string[];
  workflow: WorkflowTransition[];
  currentUser: string;
  bugzillaWebUrl: string;
}

export interface AdminGroup {
  name: string;
  description: string;
}

export interface PageInfo {
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface BugListResponse {
  bugs: Bug[];
  pageInfo: PageInfo;
}

export interface BugDetailResponse {
  bug: Bug;
  comments: Comment[];
  attachments: Attachment[];
}

export interface Permissions {
  canManageUsers: boolean;
  canManageProducts: boolean;
}

export interface AuthUser {
  id: number;
  email: string;
  realName: string;
  permissions: Permissions;
}

export interface AdminUser {
  id: number;
  email: string;
  fullName: string;
  isEnabled: boolean;
  disabledReason: string;
  groups: string[];
}

export interface CreateUserInput {
  email: string;
  fullName?: string;
  password: string;
}

export interface UpdateUserInput {
  fullName?: string;
  password?: string;
  disabled?: boolean;
  disabledReason?: string;
}

export interface CreateProductInput {
  name: string;
  description: string;
  version: string;
}

export interface UpdateProductInput {
  description?: string;
  isActive?: boolean;
}

export interface CreateComponentInput {
  name: string;
  description: string;
  defaultAssignee: string;
}

export type ErrorCode =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_UNREACHABLE'
  | 'UPSTREAM_ERROR'
  | 'INTERNAL';

export interface ApiErrorBody {
  error: true;
  status: number;
  code: ErrorCode;
  message: string;
  upstream?: { code: number; message: string };
}

/**
 * Real totals from GET /api/bugs/count - not derived from a capped page, so
 * these stay correct past the list endpoint's 200-item limit.
 */
export interface BugCounts {
  total: number;
  open: number;
  resolved: number;
  blockerCritical: number;
  /** Full-population chart data - keyed by Bugzilla's own status/severity values. */
  byStatus: Record<string, number>;
  bySeverity: Record<string, number>;
}

/** Same filters as ListBugsParams, minus pagination and sorting. */
export type CountBugsParams = Omit<ListBugsParams, 'limit' | 'offset' | 'sortBy' | 'sortDir'>;

export interface ListBugsParams {
  limit?: number;
  offset?: number;
  product?: string;
  component?: string;
  status?: string;
  severity?: string;
  priority?: string;
  assignedTo?: string;
  creator?: string;
  cc?: string;
  search?: string;
  /** Substring match on the Status Whiteboard, e.g. "cat:Security". */
  whiteboard?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface CreateBugInput {
  product: string;
  component: string;
  summary: string;
  description?: string;
  version?: string;
  opSys?: string;
  platform?: string;
  severity?: string;
  priority?: string;
}

export interface UpdateBugInput {
  summary?: string;
  status?: string;
  resolution?: string;
  priority?: string;
  severity?: string;
  component?: string;
  version?: string;
  opSys?: string;
  platform?: string;
  assignedTo?: string;
  targetMilestone?: string;
  whiteboard?: string;
}

// ---- Two-axis classification (mirrors backend/src/lib/classification.ts) ----

export const SEVERITIES = ['Critical', 'Major', 'Minor', 'Trivial', 'Unclassified'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'Unclassified'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const CATEGORIES = ['Functional', 'Performance', 'Security', 'Compatibility', 'Unclassified'] as const;
export type Category = (typeof CATEGORIES)[number];

/** Severity paired with its priority, per the classification model. */
export const PRIORITY_FOR_SEVERITY: Record<Severity, Priority> = {
  Critical: 'P0',
  Major: 'P1',
  Minor: 'P2',
  Trivial: 'P3',
  Unclassified: 'Unclassified',
};

export const SEVERITY_MEANING: Record<Severity, string> = {
  Critical: 'System crash, severe data loss, or total feature blockade with no workaround',
  Major: 'Significant loss of core functionality; a difficult workaround may exist',
  Minor: 'Small functional failure or limitation that does not impair basic operations',
  Trivial: 'Cosmetic — minor UI misalignment, spelling error, or visual glitch',
  Unclassified: 'Filed with a severity outside the classification model',
};

export const CATEGORY_MEANING: Record<Category, string> = {
  Functional: 'Incorrect output, logic failure, or a broken workflow',
  Performance: 'Slow responses, excessive resource use, or degradation under stress',
  Security: 'Vulnerability, data leak, or authorization flaw',
  Compatibility: 'Behaviour specific to certain clients, versions, devices or environments',
  Unclassified: 'No category tag, and no recognised classification in the description',
};

export interface Classification {
  severity: Severity;
  priority: Priority;
  category: Category;
  /** The bench's finer-grained flaw label, e.g. "Security/Access Control". */
  classification: string | null;
}

export interface AffectedEndpoint {
  method: string;
  path: string;
  module: string;
  occurrences: number;
}

/** Grouping is absent on bugs filed before the bench grouped them - hence the nulls. */
export interface Grouping {
  occurrences: number | null;
  endpointCount: number | null;
  affectedEndpoints: AffectedEndpoint[];
  truncated: boolean;
  isGrouped: boolean;
}

export interface DescriptionFacts {
  classification: string | null;
  endpoint: string | null;
  module: string | null;
  owner: string | null;
  environment: string | null;
  grouping: Grouping;
}

export interface BugStats {
  total: number;
  open: number;
  resolved: number;
  /** Every matching bug, resolved ones included. Belongs beside a filter option. */
  bySeverity: Record<Severity, number>;
  byCategory: Record<Category, number>;
  byComponent: Record<string, number>;
  matrix: Record<Severity, Record<Category, number>>;
  /**
   * Still-open bugs only — the current defect load, and what the dashboard shows.
   * Optional so a frontend running against an older backend falls back to the
   * lifetime figures rather than rendering zeroes.
   */
  openBySeverity?: Record<Severity, number>;
  openByCategory?: Record<Category, number>;
  openByComponent?: Record<string, number>;
  openMatrix?: Record<Severity, Record<Category, number>>;
  cachedAt: string;
}

/** The URL/query contract shared by every list view. Arrays are repeated params. */
export interface BugFilters {
  severity: Severity[];
  priority: Priority[];
  category: Category[];
  product: string[];
  component: string[];
  status: string[];
  search: string;
}
