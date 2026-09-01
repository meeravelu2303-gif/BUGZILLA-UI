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
  /**
   * May hand a bug to someone else even when it is not theirs - testers and
   * admins. A developer can move their own bugs on, but not a colleague's.
   * Optional so a client running against an older backend degrades to the
   * restrictive behaviour rather than assuming the permission.
   */
  canTriage?: boolean;
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
  /** Capability bundle; the backend maps it to Bugzilla groups. */
  role?: Role;
  /** Products the account may see - one same-named group each. */
  products?: string[];
}

export interface UpdateUserInput {
  fullName?: string;
  password?: string;
  disabled?: boolean;
  disabledReason?: string;
  /** Sent together: role decides capability, products decide access. */
  role?: Role;
  products?: string[];
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
  /**
   * Machine-readable specifics the UI can act on rather than only print.
   * RATE_LIMITED carries the cooldown shape, which is what lets the sign-in
   * form say "try again in 4 minutes" instead of repeating a server sentence.
   */
  details?: RateLimitDetails & Record<string, unknown>;
}

/** The `details` block on a RATE_LIMITED error. Every field is optional: two
 *  different limiters emit this shape - the BFF's own (which knows the exact
 *  window) and Bugzilla's account lockout (which only knows a display time). */
export interface RateLimitDetails {
  retryAfterSeconds?: number;
  /** ISO instant the cooldown ends. Absent for Bugzilla-side lockouts. */
  retryAt?: string;
  limit?: number;
  remaining?: number;
  windowSeconds?: number;
  /** Bugzilla's own unlock time, already rendered in the server's locale. */
  unlockAtText?: string;
  scope?: string;
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
  /**
   * Every browser the bug was observed on, from the `[browser:a,b]` whiteboard
   * tag the UI bench writes. Empty for bugs that carry no tag — every API-bench
   * bug, and any UI bug filed before browser tagging existed. Render empty as
   * absent; never guess a browser onto a bug.
   */
  browsers: string[];
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
  /**
   * Bugs per Playwright project. A key is present only when some bug in scope
   * carries that browser, so an empty object means "this scope has no
   * browser-tagged bugs" — which is what gates the Browser filter control.
   * Optional: an older backend does not send it.
   *
   * A bug naming several browsers counts once per browser, so these sum higher
   * than the bug total. They size a filter option, not the result set.
   */
  byBrowser?: Record<string, number>;
  matrix: Record<Severity, Record<Category, number>>;
  /**
   * Still-open bugs only — the current defect load, and what the dashboard shows.
   * Optional so a frontend running against an older backend falls back to the
   * lifetime figures rather than rendering zeroes.
   */
  openBySeverity?: Record<Severity, number>;
  openByCategory?: Record<Category, number>;
  openByComponent?: Record<string, number>;
  openByBrowser?: Record<string, number>;
  openMatrix?: Record<Severity, Record<Category, number>>;
  cachedAt: string;
}

/** The URL/query contract shared by every list view. Arrays are repeated params. */
export interface BugFilters {
  severity: Severity[];
  priority: Priority[];
  category: Category[];
  /**
   * Playwright project names, from the `[browser:…]` whiteboard tag. UI-bench
   * only — API-bench bugs carry no tag, so this facet narrows an API-only scope
   * to nothing. The filter bar hides the control in that case rather than
   * offering options that all return zero.
   */
  browser: string[];
  product: string[];
  component: string[];
  status: string[];
  /** Bugzilla resolutions. `Unresolved` is translated to Bugzilla's `---` server-side. */
  resolution: string[];
  search: string;
}

/* ------------------------------------------------------------------ roles */

/**
 * Account roles, mirroring backend/src/lib/roles.ts.
 *
 * Duplicated rather than imported because the two builds are separate TypeScript
 * projects with no shared package; the backend is the authority and validates
 * whatever arrives, so a drift here is caught as a 400 rather than silently
 * granting the wrong groups.
 */
export const ROLES = ['developer', 'tester', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  developer: 'Developer',
  tester: 'Tester',
  admin: 'Administrator',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  developer: 'Files and works bugs in the products they are given. Cannot confirm or triage.',
  tester: 'Files, confirms and triages bugs, and marks duplicates.',
  admin: 'Everything a tester can do, plus managing users and products.',
};

/**
 * Best-fit role for an account, read back from the groups it holds.
 * Mirrors roleFromGroups in backend/src/lib/roles.ts.
 */
export function roleFromGroups(groups: string[]): Role {
  const held = new Set(groups);
  // Widest first: an admin also holds `canconfirm`, so testing that first would
  // report every admin as a tester.
  if (held.has('editusers') || held.has('editcomponents')) return 'admin';
  if (held.has('canconfirm')) return 'tester';
  return 'developer';
}
