export interface UserRef {
  id: number;
  email: string;
  name: string;
}

export interface Bug {
  id: number;
  triage?: Classification;
  grouping?: Grouping;
  facts?: DescriptionFacts;
  alias: string[];
  mantisRef?: string;
  summary: string;
  status: string;
  resolution: string;
  isOpen: boolean;
  isConfirmed: boolean;
  product: string;
  component: string;
  subcomponent?: string;
  subcomponentName?: string;
  version: string;
  priority: string;
  severity: string;
  opSys: string;
  platform: string;
  targetMilestone: string;
  classification: string;
  assignedTo: UserRef | null;
  creator: UserRef | null;
  qaContact: UserRef | null;
  cc: string[];
  ccDetail: UserRef[];
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
  timeTracking: TimeTracking | null;
  isCcAccessible: boolean;
  isCreatorAccessible: boolean;
  flags: BugFlag[];
  description?: string;
  availableGroups?: string[];
  reportHistory?: { revisions: number; lastEditedBy: string | null; lastEditedAt: string | null };
  isDeleted?: boolean;
  deleted?: DeletedInfo | null;
}

export interface DeletedInfo {
  deletedBy: string;
  deletedAt: string;
  reason: string;
  previous: { status: string; resolution: string; dupeOf: number | null } | null;
}

export interface TimeTracking {
  deadline: string | null;
  estimatedTime: number;
  remainingTime: number;
  actualTime: number;
}

export interface BugFlag {
  id: number;
  typeId: number;
  name: string;
  status: string;
  setter: string;
  requestee: string;
}

export interface Comment {
  id: number;
  count: number;
  text: string;
  author: string;
  creationTime: string;
  isPrivate: boolean;
  attachmentId: number | null;
  tags: string[];
  isReportRevision?: boolean;
  canEdit?: boolean;
  edited?: { count: number; lastEditedAt: string };
}

/** An earlier version of an edited comment: the text it had until replacedAt. */
export interface CommentVersion {
  replacedAt: string;
  editor: string;
  text: string;
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
  canDelete?: boolean;
}

export interface Product {
  id: number;
  name: string;
  description?: string;
  bugCount?: number;
  isActive: boolean;
  components: ProductComponent[];
  versions: string[];
  milestones: string[];
}

export interface WorkflowTransition {
  status: string;
  isOpen: boolean;
  canChangeTo: string[];
  commentRequiredTo?: string[];
}

export interface BugMeta {
  statuses: string[];
  resolutions: string[];
  severities: string[];
  priorities: string[];
  opSystems: string[];
  platforms: string[];
  keywords: string[];
  workflow: WorkflowTransition[];
  features: BugFeatures;
  currentUser: string;
  bugzillaWebUrl: string;
  transferRoutes?: Record<string, string[]>;
}

export interface TransferTarget {
  product: string;
  components: { name: string; defaultAssignee: string; defaultAssigneeName: string }[];
  versions: string[];
  defaultMilestone: string | null;
  people: { email: string; name: string }[];
}

export interface TransferOptions {
  from: { product: string; component: string };
  targets: TransferTarget[];
}

export interface TransferBugInput {
  product: string;
  component: string;
  version?: string;
  assignee?: string;
  reason: string;
}

/** Optional Bugzilla bug fields, as switched on for this instance. */
export interface BugFeatures {
  qaContact: boolean;
  targetMilestone: boolean;
  seeAlso: boolean;
  privateComments: boolean;
  commentTags: boolean;
  maxAttachmentKb: number;
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
  canTriage?: boolean;
  canReassignAny?: boolean;
  canViewUsers?: boolean;
  canViewProducts?: boolean;
  canCreateComponents?: boolean;
  isReporter?: boolean;
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
  emailEnabled?: boolean;
  groups: string[];
}

export interface CreateUserInput {
  email: string;
  fullName?: string;
  password?: string;
  sendWelcome?: boolean;
  role?: Role;
  products?: string[];
}

export interface UpdateUserInput {
  fullName?: string;
  email?: string;
  emailEnabled?: boolean;
  password?: string;
  disabled?: boolean;
  disabledReason?: string;
  role?: Role;
  products?: string[];
}

export interface CreateProductInput {
  name: string;
  description: string;
  version: string;
  component: { name: string; description: string; defaultAssignee: string };
}

export interface UpdateProductInput {
  name?: string;
  description?: string;
  isActive?: boolean;
}

/** A second level under a component (backend/src/services/subcomponents.service.ts). */
export interface Subcomponent {
  id: number;
  value: string;
  name: string;
  isActive: boolean;
  bugCount?: number;
}

export interface ProductComponent {
  id?: number;
  name: string;
  description?: string;
  isActive?: boolean;
  defaultAssignee: string;
  bugCount?: number;
  subcomponents?: Subcomponent[];
}

export interface CreateSubcomponentInput {
  componentId: number;
  name: string;
}

export interface UpdateSubcomponentInput {
  name?: string;
  isActive?: boolean;
}

export interface UpdateComponentInput {
  name?: string;
  description?: string;
  defaultAssignee?: string;
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
  details?: RateLimitDetails & Record<string, unknown>;
}

/** The details block on a RATE_LIMITED error. */
export interface RateLimitDetails {
  retryAfterSeconds?: number;
  retryAt?: string;
  limit?: number;
  remaining?: number;
  windowSeconds?: number;
  unlockAtText?: string;
  scope?: string;
}

/** Real totals from GET /api/bugs/count. */
export interface BugCounts {
  total: number;
  queued: number;
  picked: number;
  reassigned: number;
  open: number;
  resolved: number;
  blockerCritical: number;
  urgent?: number;
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
  whiteboard?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface CreateBugInput {
  product: string;
  component: string;
  subcomponent?: string;
  summary: string;
  description?: string;
  version?: string;
  opSys?: string;
  platform?: string;
  severity?: string;
  priority?: string;
  whiteboard?: string;
  assignedTo?: string;
}

/** Bugzilla's add/remove shape for list fields. */
export interface ListChange<T> {
  add?: T[];
  remove?: T[];
}

export interface UpdateBugInput {
  lastChangeTime?: string;
  summary?: string;
  status?: string;
  resolution?: string;
  dupeOf?: number;
  priority?: string;
  severity?: string;
  product?: string;
  component?: string;
  subcomponent?: string;
  version?: string;
  targetMilestone?: string;
  opSys?: string;
  platform?: string;
  assignedTo?: string;
  resetAssignedTo?: true;
  qaContact?: string;
  resetQaContact?: true;
  cc?: ListChange<string>;
  dependsOn?: ListChange<number>;
  blocks?: ListChange<number>;
  seeAlso?: ListChange<string>;
  url?: string;
  alias?: ListChange<string>;
  keywords?: ListChange<string>;
  deadline?: string;
  estimatedTime?: number;
  remainingTime?: number;
  workTime?: number;
  groups?: ListChange<string>;
  isCcAccessible?: boolean;
  isCreatorAccessible?: boolean;
  flags?: { id?: number; typeId?: number; status: '+' | '-' | '?' | 'X'; requestee?: string }[];
  comment?: { body: string; isPrivate?: boolean };
  whiteboard?: string;
}

/** What Bugzilla recorded for a save, field -> before/after. */
export type BugChanges = Record<string, { added: string; removed: string }>;

export interface UpdateAttachmentInput {
  summary?: string;
  fileName?: string;
  contentType?: string;
  isObsolete?: boolean;
  isPatch?: boolean;
  isPrivate?: boolean;
  comment?: string;
}

/** ---- Two-axis classification (mirrors backend/src/services/classification.service.ts) ----. */
export const SEVERITIES = ['Critical', 'Major', 'Minor', 'Trivial', 'Unclassified'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'Unclassified'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const CATEGORIES = [
  'Functional',
  'Performance',
  'Security',
  'Compatibility',
  'Accessibility',
  'Unclassified',
] as const;
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
  Accessibility: 'A WCAG/assistive-technology violation - screen readers, keyboard-only use, or similar',
  Unclassified: 'No category tag, and no recognised classification in the description',
};

export interface Classification {
  severity: Severity;
  priority: Priority;
  category: Category;
  classification: string | null;
  browsers: string[];
  uiPlatform?: 'Web' | 'Mobile' | null;
  devices?: string[];
  source?: Source;
  testType?: TestType;
}

/** How a bug was filed - the [source:…] whiteboard tag. */
export const SOURCES = ['Automation', 'Manual'] as const;
export type Source = (typeof SOURCES)[number];
export type TestType = 'UI' | 'API';

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
  bySeverity: Record<Severity, number>;
  byCategory: Record<Category, number>;
  byComponent: Record<string, number>;
  bySubcomponent?: Record<string, number>;
  byProduct?: Record<string, number>;
  byStatus?: Record<string, number>;
  byResolution?: Record<string, number>;
  byPriority?: Record<string, number>;
  byBrowser?: Record<string, number>;
  matrix: Record<Severity, Record<Category, number>>;
  openBySeverity?: Record<Severity, number>;
  openByCategory?: Record<Category, number>;
  openByComponent?: Record<string, number>;
  openBySubcomponent?: Record<string, number>;
  openByBrowser?: Record<string, number>;
  openMatrix?: Record<Severity, Record<Category, number>>;
  bySource?: Record<Source, number>;
  openBySource?: Record<Source, number>;
  byAssignee?: Record<string, number>;
  openByAssignee?: Record<string, number>;
  cachedAt: string;
}

/** The URL/query contract shared by every list view. */
export interface BugFilters {
  severity: Severity[];
  priority: Priority[];
  category: Category[];
  browser: string[];
  source: string[];
  product: string[];
  component: string[];
  subcomponent: string[];
  status: string[];
  resolution: string[];
  search: string;
  dateField: 'created' | 'updated';
  from: string;
  to: string;
}

/** Account roles, mirroring backend/src/services/roles.service.ts. */
export const ROLES = ['reporter', 'developer', 'tester', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  reporter: 'Reporter',
  developer: 'Developer',
  tester: 'Tester',
  admin: 'Administrator',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  reporter: 'Office staff who file and follow bugs. Never assigned work; cannot confirm or triage.',
  developer: 'Files and works bugs in the products they are given. Cannot confirm or triage.',
  tester: 'Files, confirms and triages bugs, and marks duplicates.',
  admin: 'Everything a tester can do, plus managing users and products.',
};

/** Best-fit role for an account, read back from the groups it holds. */
export function roleFromGroups(groups: string[]): Role {
  const held = new Set(groups);
  if (held.has('editusers') || held.has('editcomponents')) return 'admin';
  if (held.has('canconfirm')) return 'tester';
  if (held.has('reporter')) return 'reporter';
  return 'developer';
}

/** One recorded change (backend/src/services/bugActivity.service.ts). */
export type ActivityChangeKind =
  'status' | 'resolution' | 'assignee' | 'placement' | 'priority' | 'people' | 'text' | 'link' | 'visibility' | 'other';

export interface ActivityChange {
  field: string;
  label: string;
  kind: ActivityChangeKind;
  removed: string;
  added: string;
}

export interface ActivityEntry {
  when: string;
  who: string;
  whoName: string;
  changes: ActivityChange[];
}

export interface JourneyStep {
  status: string;
  resolution: string;
  when: string;
  who: string;
  whoName: string;
}

export interface BugActivity {
  created: { when: string; who: string; whoName: string };
  journey: JourneyStep[];
  entries: ActivityEntry[];
}
