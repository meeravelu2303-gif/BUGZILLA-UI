export interface UserRef {
  id: number;
  email: string;
  name: string;
}

export interface Bug {
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
