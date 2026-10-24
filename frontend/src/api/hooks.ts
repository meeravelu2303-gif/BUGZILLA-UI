import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, buildQuery } from './client';
import type { BugQueryParams } from '../lib/useBugFilters';
import type {
  BugActivity,
  AdminGroup,
  AdminUser,
  Attachment,
  AuthUser,
  BugChanges,
  BugCounts,
  BugDetailResponse,
  BugStats,
  BugListResponse,
  BugMeta,
  CreateBugInput,
  CreateComponentInput,
  CreateSubcomponentInput,
  UpdateComponentInput,
  UpdateSubcomponentInput,
  CreateProductInput,
  CreateUserInput,
  Product,
  TransferBugInput,
  TransferOptions,
  UpdateAttachmentInput,
  UpdateBugInput,
  UpdateProductInput,
  UpdateUserInput,
} from '../types';

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<{ user: AuthUser }>('/auth/me'),
    retry: false,
    staleTime: Infinity,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { login: string; password: string }) => api.post<{ user: AuthUser }>('/auth/login', input),
    onSuccess: (data) => {
      qc.setQueryData(['me'], data);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<undefined>('/auth/logout'),
    onSuccess: () => {
      qc.clear();
      // Hard redirect rather than relying on RequireAuth's reactive Navigate: a
      // security-sensitive transition like logout should guarantee a clean slate
      // (no stale component state, no query-cache observer edge cases) rather than
      // trust SPA cache reactivity to unwind every mounted query correctly.
      window.location.href = '/login';
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (input: { login: string }) =>
      api.post<{ accepted: true; cooldownMinutes: number; linkValidDays: number; dailyLimit: number }>('/auth/forgot-password', input),
  });
}

/**
 * POST rather than GET so the token travels in a body - the reset page has
 * already scrubbed it from its own URL, and it should not reappear in a
 * query string on the way to the server.
 */
export function useValidateResetToken(token: string | null) {
  return useQuery({
    queryKey: ['reset-token', token],
    queryFn: () => api.post<{ valid: boolean }>('/auth/reset-password/validate', { token }),
    enabled: token !== null,
    retry: false,
    staleTime: Infinity,
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (input: { token: string; password: string; confirmPassword: string }) =>
      api.post<undefined>('/auth/reset-password', input),
  });
}

/** Testers and admins - the people who report bugs (QA dashboard reporter filter). */
export function useReporters(enabled = true) {
  return useQuery({
    queryKey: ['meta', 'reporters'],
    queryFn: () => api.get<{ users: { email: string; name: string; role: 'admin' | 'tester' | 'reporter' | 'developer' }[] }>('/meta/reporters'),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string; confirmPassword: string }) =>
      api.post<{ changed: true; otherSessionsSignedOut: number }>('/auth/change-password', input),
  });
}

export function useMeta() {
  return useQuery({
    queryKey: ['meta'],
    queryFn: () => api.get<BugMeta>('/meta'),
    staleTime: 5 * 60 * 1000,
  });
}

export interface AssignableUser {
  email: string;
  name: string;
  /**
   * Derived by the BFF from Bugzilla groups, not stored anywhere. Optional so
   * a client running against an older backend still renders the name.
   */
  role?: 'admin' | 'developer' | 'tester' | 'reporter';
}

/**
 * The people a bug can be reassigned to — populates the Assignee dropdown.
 *
 * `product` scopes the list to that product's team. Without it the dropdown listed every account
 * on the instance, so reassigning a KPost UI bug offered the API team and vice versa — and
 * choosing one hands the bug to somebody who cannot see it. Keyed by product so switching
 * between bugs never serves a cached list belonging to a different team.
 */
export function useAssignableUsers(product?: string | string[]) {
  // Normalised so ['KPost API'] and 'KPost API' share one cache entry rather
  // than fetching the same list twice under two keys.
  const products = (Array.isArray(product) ? product : product ? [product] : []).filter(Boolean).sort();
  return useQuery({
    queryKey: ['meta', 'assignable-users', products.join('|')],
    queryFn: () =>
      api.get<{ users: AssignableUser[]; owners?: string[] }>(
        `/meta/assignable-users${buildQuery(products.length ? { product: products } : {})}`
      ),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Everyone who can hold a bug, for SEARCHING by assignee (Advanced Search).
 * Unlike useAssignableUsers it keeps testers, reporters and the signed-in user:
 * they are left out of "hand this bug to" pickers, but their bugs still need finding.
 */
export function useSearchableAssignees() {
  return useQuery({
    queryKey: ['meta', 'assignable-users', 'scope:all'],
    queryFn: () => api.get<{ users: AssignableUser[]; owners?: string[] }>(`/meta/assignable-users${buildQuery({ scope: 'all' })}`),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Products for the signed-in user.
 *
 * `forFiling` asks for everything Bugzilla will accept a bug into, rather than
 * the narrower same-named-group scope used for filters and dashboards. The two
 * are cached separately because they are genuinely different answers - sharing
 * a key would let a filter's list leak into the filing form and back.
 */
export function useProducts(options?: { forFiling?: boolean }) {
  const forFiling = options?.forFiling ?? false;
  return useQuery({
    queryKey: ['products', forFiling ? 'filing' : 'scoped'],
    queryFn: () => api.get<{ products: Product[] }>(`/products${forFiling ? '?scope=filing' : ''}`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useBugs(params: BugQueryParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['bugs', params],
    queryFn: () => api.get<BugListResponse>(`/bugs${buildQuery(params)}`),
    placeholderData: (prev) => prev,
    enabled: options?.enabled ?? true,
  });
}

/**
 * Genuine totals for the dashboard stat cards. Separate from useBugs because
 * useBugs is capped at 200 server-side - counting its results understates the
 * real number as soon as there are more bugs than one page.
 */
export function useBugCounts(params: BugQueryParams = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['bugs', 'count', params],
    queryFn: () => api.get<{ counts: BugCounts }>(`/bugs/count${buildQuery(params)}`),
    staleTime: 30 * 1000,
    /*
     * Lets a caller skip a count that cannot be answered truthfully.
     *
     * Bugzilla DROPS a `bug_status` value it does not recognise rather than
     * matching nothing, so counting a status this instance has never heard of
     * returns the caller's ENTIRE accessible scope. A filter that silently
     * becomes "everything" is worse than no filter: it reads as a real number.
     */
    enabled: options?.enabled ?? true,
  });
}

/**
 * Every dashboard and report breakdown in one request: counts by severity, by
 * category, by component, and the severity x category matrix. Computed
 * server-side so drawing a chart never costs 1,283 bug records.
 */
export function useBugStats(params: BugQueryParams = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['bugs', 'stats', params],
    queryFn: () => api.get<BugStats>(`/bugs/stats${buildQuery(params)}`),
    staleTime: 30 * 1000,
    // Callers that only need a scoped breakdown under some condition (the
    // filter bar's browser gate) can skip the request entirely rather than
    // fetching a duplicate of the unscoped stats they already hold.
    enabled: options?.enabled ?? true,
  });
}

export function useBug(id: number) {
  return useQuery({
    queryKey: ['bugs', id],
    queryFn: () => api.get<BugDetailResponse>(`/bugs/${id}`),
    enabled: Number.isFinite(id) && id > 0,
  });
}

/**
 * A bug's recorded changes and status journey. Keyed under ['bugs', id] so
 * every save that refreshes the bug refreshes its activity too.
 */
export function useBugActivity(id: number) {
  return useQuery({
    queryKey: ['bugs', id, 'activity'],
    queryFn: () => api.get<BugActivity>(`/bugs/${id}/activity`),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useCreateBug() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBugInput) => api.post<{ bug: BugDetailResponse['bug'] }>('/bugs', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bugs'] });
    },
  });
}

export function useUpdateBug(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateBugInput) =>
      api.patch<{ bug: BugDetailResponse['bug']; changes: BugChanges }>(`/bugs/${id}`, input),
    onSuccess: ({ bug }) => {
      // The response already carries the saved bug: apply it at once so the
      // editor's baseline moves and the save bar clears without waiting for a
      // refetch (each Bugzilla call costs ~600ms under mod_cgi). The refetch
      // below then fills in the derived fields (triage, description, groups).
      qc.setQueryData<BugDetailResponse>(['bugs', id], (prev) => (prev ? { ...prev, bug: { ...prev.bug, ...bug } } : prev));
      qc.invalidateQueries({ queryKey: ['bugs', id] });
      qc.invalidateQueries({ queryKey: ['bugs'], exact: false });
    },
  });
}

export function useUpdateAttachment(bugId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ attachmentId, input }: { attachmentId: number; input: UpdateAttachmentInput }) =>
      api.patch<{ attachment: Attachment }>(`/bugs/${bugId}/attachments/${attachmentId}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bugs', bugId] });
    },
  });
}

/** Adds/removes tags on one comment. Patches the cached comment so the chip appears without a refetch. */
export function useUpdateCommentTags(bugId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, add, remove }: { commentId: number; add?: string[]; remove?: string[] }) =>
      api.put<{ tags: string[] }>(`/bugs/${bugId}/comments/${commentId}/tags`, { add, remove }),
    onSuccess: ({ tags }, { commentId }) => {
      qc.setQueryData<BugDetailResponse>(['bugs', bugId], (prev) =>
        prev ? { ...prev, comments: prev.comments.map((c) => (c.id === commentId ? { ...c, tags } : c)) } : prev
      );
    },
  });
}

/** Tags already used elsewhere, for the tag input's suggestions. */
export function useCommentTagSuggestions(query: string, enabled: boolean) {
  const q = query.trim();
  return useQuery({
    queryKey: ['bugs', 'comment-tags', q.toLowerCase()],
    queryFn: () => api.get<{ tags: string[] }>(`/bugs/comment-tags${buildQuery({ q })}`),
    enabled: enabled && q.length > 0 && /^[^\s,/]+$/.test(q),
    staleTime: 60 * 1000,
  });
}

/** Saves the whole bug report (and its category) as a new report revision. */
export function useUpdateReport(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { text: string; category?: string; note?: string; baseRevisions?: number }) =>
      api.put<{ textChanged: boolean; categoryChanged: boolean }>(`/bugs/${id}/report`, input),
    // Lists too: category, classification and the exported report all follow the new text.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bugs'], exact: false }),
  });
}

/** Soft-deletes bugs (testers and admins). Everything bug-shaped is refetched: lists, counts, the bug itself. */
export function useDeleteBugs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { ids: number[]; reason: string }) => api.post<{ deleted: number }>('/bugs/delete', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bugs'], exact: false }),
  });
}

/** Loaded only when the transfer dialog opens - it costs several Bugzilla calls. */
export function useTransferOptions(id: number, enabled: boolean) {
  return useQuery({
    queryKey: ['bugs', id, 'transfer-options'],
    queryFn: () => api.get<TransferOptions>(`/bugs/${id}/transfer-options`),
    enabled,
    retry: false,
    staleTime: 60_000,
  });
}

export function useTransferBug(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TransferBugInput) =>
      api.post<{ id: number; product: string; component: string; assignee: string; ccAdded: string }>(`/bugs/${id}/transfer`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bugs'], exact: false }),
  });
}

export function useRestoreBugs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { ids: number[] }) => api.post<{ restored: number }>('/bugs/restore', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bugs'], exact: false }),
  });
}

/** Reassigns many bugs to one assignee in a single call. */
export function useBulkReassign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { ids: number[]; assignedTo: string }) =>
      api.patch<{ updated: number }>('/bugs', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bugs'], exact: false });
    },
  });
}

export function useAddComment(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { comment: string; isPrivate?: boolean }) =>
      api.post<{ comment: BugDetailResponse['comments'][number] }>(`/bugs/${id}/comments`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bugs', id] });
    },
  });
}

// ---- Admin: Users ----

export function useAdminUsers(search: string) {
  return useQuery({
    queryKey: ['admin', 'users', search],
    // No search term lists everyone; a term narrows it. Always enabled so the
    // page shows the full list on open.
    queryFn: () => api.get<{ users: AdminUser[] }>(`/admin/users${buildQuery({ search })}`),
    placeholderData: (prev) => prev,
  });
}

export function useAdminUser(id: number) {
  return useQuery({
    queryKey: ['admin', 'users', 'detail', id],
    queryFn: () => api.get<{ user: AdminUser }>(`/admin/users/${id}`),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    // `skippedGroups` names any product with no matching Bugzilla group, so the
    // form can say what was NOT granted instead of implying full setup.
    mutationFn: (input: CreateUserInput) =>
      api.post<{ user: AdminUser; skippedGroups?: string[]; groupError?: string }>('/admin/users', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

/** Read-only: can this account be deleted, and if not, why. Loaded when the dialog opens. */
export function useUserDeleteCheck(id: number, enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'users', 'delete-check', id],
    queryFn: () => api.get<{ deletable: boolean; blockers: string[] }>(`/admin/users/${id}/delete-check`),
    enabled: enabled && id > 0,
    retry: false,
    staleTime: 0,
  });
}

export function useDeleteUser(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (confirmEmail: string) => api.deleteWithBody<undefined>(`/admin/users/${id}`, { confirmEmail }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useUpdateUser(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateUserInput) =>
      api.patch<{ user: AdminUser; skippedGroups?: string[]; groupError?: string }>(`/admin/users/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

// ---- Admin: Products & Components ----

export function useAdminProducts() {
  return useQuery({
    queryKey: ['admin', 'products'],
    queryFn: () => api.get<{ products: Product[] }>('/admin/products'),
    staleTime: 60 * 1000,
  });
}

function invalidateProductLists(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['products'] });
  qc.invalidateQueries({ queryKey: ['admin', 'products'] });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProductInput) => api.post<{ product: Product; warnings?: string[] }>('/admin/products', input),
    onSuccess: () => invalidateProductLists(qc),
  });
}

export function useUpdateProduct(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProductInput) =>
      api.patch<{ product: Product; warnings?: string[] }>(`/admin/products/${id}`, input),
    onSuccess: () => invalidateProductLists(qc),
  });
}

/** Deletes an EMPTY product through Bugzilla's own admin page; refused while it has bugs. */
export function useDeleteProduct(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (confirmName: string) => api.deleteWithBody<undefined>(`/admin/products/${id}`, { confirmName }),
    onSuccess: () => {
      invalidateProductLists(qc);
      qc.invalidateQueries({ queryKey: ['meta'] });
    },
  });
}

// ---- Admin: read-only metadata (parameters, groups) ----

export function useAdminParameters() {
  return useQuery({
    queryKey: ['admin', 'parameters'],
    queryFn: () => api.get<{ parameters: Record<string, unknown> }>('/admin/meta/parameters'),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useAdminGroups() {
  return useQuery({
    queryKey: ['admin', 'groups'],
    queryFn: () => api.get<{ groups: AdminGroup[] }>('/admin/meta/groups'),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

/** Sub-components (backend lib/subcomponents.ts). Adding follows the add-component rule; edit and delete are admin-only. */
export function useCreateSubcomponent(productId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSubcomponentInput) => api.post<{ product: Product }>(`/admin/products/${productId}/subcomponents`, input),
    onSuccess: () => invalidateProductLists(qc),
  });
}

export function useUpdateSubcomponent(productId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateSubcomponentInput & { id: number }) =>
      api.patch<{ product: Product }>(`/admin/products/${productId}/subcomponents/${id}`, input),
    onSuccess: () => invalidateProductLists(qc),
  });
}

export function useDeleteSubcomponent(productId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ product: Product }>(`/admin/products/${productId}/subcomponents/${id}`),
    onSuccess: () => invalidateProductLists(qc),
  });
}

/** Admins and testers. A rename carries the component's bugs and sub-components along. */
export function useUpdateComponent(productId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ componentId, ...input }: UpdateComponentInput & { componentId: number }) =>
      api.patch<{ product: Product }>(`/admin/products/${productId}/components/${componentId}`, input),
    onSuccess: () => invalidateProductLists(qc),
  });
}

/** Admins and testers, and only for an empty component that is not the product's last one. */
export function useDeleteComponent(productId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ componentId, confirmName }: { componentId: number; confirmName: string }) =>
      api.deleteWithBody<{ product: Product }>(`/admin/products/${productId}/components/${componentId}`, { confirmName }),
    onSuccess: () => invalidateProductLists(qc),
  });
}

export function useCreateComponent(productId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateComponentInput) => api.post<{ product: Product }>(`/admin/products/${productId}/components`, input),
    onSuccess: () => invalidateProductLists(qc),
  });
}

/**
 * Live service health, for the admin dashboard's system metrics.
 *
 * `?deep=1` makes the BFF additionally call Bugzilla on the SERVICE key, so a
 * green light here means the whole chain is up - the browser reached the BFF,
 * and the BFF reached Bugzilla - not merely that this process is running.
 *
 * Note what it cannot tell you: the BFF holds no database driver (it proxies
 * Bugzilla's API and nothing else), so there is no MariaDB probe to read. A
 * failing database surfaces INDIRECTLY, as `bugzilla.ok === false` with
 * Bugzilla's own error, because Bugzilla is the thing that talks to it.
 *
 * Polled rather than fetched once: this is a status panel, and a stale green
 * light is worse than no light. `retry: false` so an outage shows as an outage
 * instead of spinning.
 */
export interface HealthResponse {
  ok: boolean;
  uptimeSeconds: number;
  sessionStore: string;
  bugzilla?: { ok: boolean; version?: string; error?: string };
}

export function useHealth(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<HealthResponse>('/health?deep=1'),
    refetchInterval: 30 * 1000,
    staleTime: 15 * 1000,
    retry: false,
    enabled: options?.enabled ?? true,
  });
}
