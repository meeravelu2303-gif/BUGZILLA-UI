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
  Comment,
  CommentVersion,
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { login: string; password: string }) => api.post<{ user: AuthUser }>('/auth/login', input),
    onSuccess: (data) => {
      queryClient.setQueryData(['me'], data);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<undefined>('/auth/logout'),
    onSuccess: () => {
      queryClient.clear();
      window.location.href = '/login';
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (input: { login: string }) =>
      api.post<{ accepted: true; cooldownMinutes: number; linkValidDays: number; dailyLimit: number }>(
        '/auth/forgot-password',
        input,
      ),
  });
}

/** POST rather than GET so the token travels in a body. */
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
    queryFn: () =>
      api.get<{ users: { email: string; name: string; role: 'admin' | 'tester' | 'reporter' | 'developer' }[] }>(
        '/meta/reporters',
      ),
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
  role?: 'admin' | 'developer' | 'tester' | 'reporter';
}

/** The people a bug can be reassigned to — populates the Assignee dropdown. */
export function useAssignableUsers(product?: string | string[]) {
  const products = (Array.isArray(product) ? product : product ? [product] : []).filter(Boolean).sort();
  return useQuery({
    queryKey: ['meta', 'assignable-users', products.join('|')],
    queryFn: () =>
      api.get<{ users: AssignableUser[]; owners?: string[] }>(
        `/meta/assignable-users${buildQuery(products.length ? { product: products } : {})}`,
      ),
    staleTime: 5 * 60 * 1000,
  });
}

/** Everyone who can hold a bug, for SEARCHING by assignee (Advanced Search). */
export function useSearchableAssignees() {
  return useQuery({
    queryKey: ['meta', 'assignable-users', 'scope:all'],
    queryFn: () =>
      api.get<{ users: AssignableUser[]; owners?: string[] }>(`/meta/assignable-users${buildQuery({ scope: 'all' })}`),
    staleTime: 5 * 60 * 1000,
  });
}

/** Products for the signed-in user. */
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
    placeholderData: (previous) => previous,
    enabled: options?.enabled ?? true,
  });
}

/** Genuine totals for the dashboard stat cards. */
export function useBugCounts(params: BugQueryParams = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['bugs', 'count', params],
    queryFn: () => api.get<{ counts: BugCounts }>(`/bugs/count${buildQuery(params)}`),
    staleTime: 30 * 1000,
    enabled: options?.enabled ?? true,
  });
}

/** Every dashboard and report breakdown in one request. */
export function useBugStats(params: BugQueryParams = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['bugs', 'stats', params],
    queryFn: () => api.get<BugStats>(`/bugs/stats${buildQuery(params)}`),
    staleTime: 30 * 1000,
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

/** A bug's recorded changes and status journey. */
export function useBugActivity(id: number) {
  return useQuery({
    queryKey: ['bugs', id, 'activity'],
    queryFn: () => api.get<BugActivity>(`/bugs/${id}/activity`),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useCreateBug() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBugInput) => api.post<{ bug: BugDetailResponse['bug'] }>('/bugs', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bugs'] });
    },
  });
}

export function useUpdateBug(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateBugInput) =>
      api.patch<{ bug: BugDetailResponse['bug']; changes: BugChanges }>(`/bugs/${id}`, input),
    onSuccess: ({ bug }) => {
      queryClient.setQueryData<BugDetailResponse>(['bugs', id], (previous) =>
        previous ? { ...previous, bug: { ...previous.bug, ...bug } } : previous,
      );
      queryClient.invalidateQueries({ queryKey: ['bugs', id] });
      queryClient.invalidateQueries({ queryKey: ['bugs'], exact: false });
    },
  });
}

export function useUpdateAttachment(bugId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ attachmentId, input }: { attachmentId: number; input: UpdateAttachmentInput }) =>
      api.patch<{ attachment: Attachment }>(`/bugs/${bugId}/attachments/${attachmentId}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bugs', bugId] });
    },
  });
}

/** Deletes one attachment for good. */
export function useDeleteAttachment(bugId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: number) =>
      api.delete<{ removed: { id: number; bugId: number; fileName: string } }>(
        `/bugs/${bugId}/attachments/${attachmentId}`,
      ),
    onSuccess: (_result, attachmentId) => {
      queryClient.setQueryData<BugDetailResponse>(['bugs', bugId], (previous) =>
        previous
          ? { ...previous, attachments: previous.attachments.filter((attachment) => attachment.id !== attachmentId) }
          : previous,
      );
      queryClient.invalidateQueries({ queryKey: ['bugs', bugId] });
    },
  });
}

/** The author corrects their comment. */
export function useEditComment(bugId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, text }: { commentId: number; text: string }) =>
      api.patch<{ comment: { id: number; text: string }; edited?: Comment['edited']; changed: boolean }>(
        `/bugs/${bugId}/comments/${commentId}`,
        { text },
      ),
    onSuccess: ({ comment, edited }) => {
      queryClient.setQueryData<BugDetailResponse>(['bugs', bugId], (previous) =>
        previous
          ? {
              ...previous,
              comments: previous.comments.map((commentItem) =>
                commentItem.id === comment.id
                  ? { ...commentItem, text: comment.text, ...(edited ? { edited } : {}) }
                  : commentItem,
              ),
            }
          : previous,
      );
      queryClient.invalidateQueries({ queryKey: ['bugs', bugId] });
      queryClient.invalidateQueries({ queryKey: ['bugs', bugId, 'comment-history', comment.id] });
    },
  });
}

/** Earlier versions of an edited comment, loaded when someone opens them. */
export function useCommentHistory(bugId: number, commentId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['bugs', bugId, 'comment-history', commentId],
    queryFn: () => api.get<{ versions: CommentVersion[] }>(`/bugs/${bugId}/comments/${commentId}/history`),
    enabled,
  });
}

/** Adds/removes tags on one comment. */
export function useUpdateCommentTags(bugId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, add, remove }: { commentId: number; add?: string[]; remove?: string[] }) =>
      api.put<{ tags: string[] }>(`/bugs/${bugId}/comments/${commentId}/tags`, { add, remove }),
    onSuccess: ({ tags }, { commentId }) => {
      queryClient.setQueryData<BugDetailResponse>(['bugs', bugId], (previous) =>
        previous
          ? {
              ...previous,
              comments: previous.comments.map((comment) => (comment.id === commentId ? { ...comment, tags } : comment)),
            }
          : previous,
      );
    },
  });
}

/** Tags already used elsewhere, for the tag input's suggestions. */
export function useCommentTagSuggestions(query: string, enabled: boolean) {
  const normalizedQuery = query.trim();
  return useQuery({
    queryKey: ['bugs', 'comment-tags', normalizedQuery.toLowerCase()],
    queryFn: () => api.get<{ tags: string[] }>(`/bugs/comment-tags${buildQuery({ q: normalizedQuery })}`),
    enabled: enabled && normalizedQuery.length > 0 && /^[^\s,/]+$/.test(normalizedQuery),
    staleTime: 60 * 1000,
  });
}

/** Saves the whole bug report (and its category) as a new report revision. */
export function useUpdateReport(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { text: string; category?: string; note?: string; baseRevisions?: number }) =>
      api.put<{ textChanged: boolean; categoryChanged: boolean }>(`/bugs/${id}/report`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bugs'], exact: false }),
  });
}

/** Soft-deletes bugs (testers and admins). */
export function useDeleteBugs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { ids: number[]; reason: string }) => api.post<{ deleted: number }>('/bugs/delete', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bugs'], exact: false }),
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TransferBugInput) =>
      api.post<{ id: number; product: string; component: string; assignee: string; ccAdded: string }>(
        `/bugs/${id}/transfer`,
        input,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bugs'], exact: false }),
  });
}

export function useRestoreBugs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { ids: number[] }) => api.post<{ restored: number }>('/bugs/restore', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bugs'], exact: false }),
  });
}

/** Reassigns many bugs to one assignee in a single call. */
export function useBulkReassign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { ids: number[]; assignedTo: string }) => api.patch<{ updated: number }>('/bugs', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bugs'], exact: false });
    },
  });
}

export function useAddComment(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { comment: string; isPrivate?: boolean }) =>
      api.post<{ comment: BugDetailResponse['comments'][number] }>(`/bugs/${id}/comments`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bugs', id] });
    },
  });
}

/** ---- Admin: Users ----. */
export function useAdminUsers(search: string) {
  return useQuery({
    queryKey: ['admin', 'users', search],
    queryFn: () => api.get<{ users: AdminUser[] }>(`/admin/users${buildQuery({ search })}`),
    placeholderData: (previous) => previous,
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) =>
      api.post<{
        user: AdminUser;
        skippedGroups?: string[];
        groupError?: string;
        welcome?: { sentTo?: string; error?: string };
      }>('/admin/users', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

/** (Re)sends an account's welcome email with a fresh "Set your password" link. */
export function useSendWelcome(id: number) {
  return useMutation({
    mutationFn: () => api.post<{ welcome: { sentTo: string } }>(`/admin/users/${id}/welcome`, {}),
  });
}

/** Read-only: can this account be deleted, and if not, why. */
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (confirmEmail: string) => api.deleteWithBody<undefined>(`/admin/users/${id}`, { confirmEmail }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useUpdateUser(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateUserInput) =>
      api.patch<{ user: AdminUser; skippedGroups?: string[]; groupError?: string }>(`/admin/users/${id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

/** ---- Admin: Products & Components ----. */
export function useAdminProducts() {
  return useQuery({
    queryKey: ['admin', 'products'],
    queryFn: () => api.get<{ products: Product[] }>('/admin/products'),
    staleTime: 60 * 1000,
  });
}

function invalidateProductLists(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['products'] });
  queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
}

/** A person on a team, as the Teams extension describes them. */
export interface TeamPerson {
  id: number;
  email: string;
  name: string;
}

/** A team: one leader and the members who report to them. */
export interface Team {
  id: number;
  name: string;
  leader: TeamPerson | null;
  members: TeamPerson[];
  created: string;
}

export interface TeamInput {
  name: string;
  leader: string;
  members: string[];
}

export function useTeams() {
  return useQuery({
    queryKey: ['admin', 'teams'],
    queryFn: () => api.get<{ teams: Team[] }>('/admin/teams'),
  });
}

export function useSaveTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: TeamInput & { id?: number }) =>
      id ? api.patch<{ team: Team }>(`/admin/teams/${id}`, input) : api.post<{ team: Team }>('/admin/teams', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'teams'] }),
  });
}

export function useDeleteTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/admin/teams/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'teams'] }),
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProductInput) =>
      api.post<{ product: Product; warnings?: string[] }>('/admin/products', input),
    onSuccess: () => invalidateProductLists(queryClient),
  });
}

export function useUpdateProduct(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProductInput) =>
      api.patch<{ product: Product; warnings?: string[] }>(`/admin/products/${id}`, input),
    onSuccess: () => invalidateProductLists(queryClient),
  });
}

/** Deletes an EMPTY product through Bugzilla's own admin page; refused while it has bugs. */
export function useDeleteProduct(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (confirmName: string) => api.deleteWithBody<undefined>(`/admin/products/${id}`, { confirmName }),
    onSuccess: () => {
      invalidateProductLists(queryClient);
      queryClient.invalidateQueries({ queryKey: ['meta'] });
    },
  });
}

/** ---- Admin: read-only metadata (parameters, groups) ----. */
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

/** Sub-components (backend/src/services/subcomponents.service.ts). */
export function useCreateSubcomponent(productId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSubcomponentInput) =>
      api.post<{ product: Product }>(`/admin/products/${productId}/subcomponents`, input),
    onSuccess: () => invalidateProductLists(queryClient),
  });
}

export function useUpdateSubcomponent(productId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateSubcomponentInput & { id: number }) =>
      api.patch<{ product: Product }>(`/admin/products/${productId}/subcomponents/${id}`, input),
    onSuccess: () => invalidateProductLists(queryClient),
  });
}

export function useDeleteSubcomponent(productId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ product: Product }>(`/admin/products/${productId}/subcomponents/${id}`),
    onSuccess: () => invalidateProductLists(queryClient),
  });
}

/** Admins and testers. */
export function useUpdateComponent(productId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ componentId, ...input }: UpdateComponentInput & { componentId: number }) =>
      api.patch<{ product: Product }>(`/admin/products/${productId}/components/${componentId}`, input),
    onSuccess: () => invalidateProductLists(queryClient),
  });
}

/** Admins and testers, and only for an empty component that is not the product's last one. */
export function useDeleteComponent(productId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ componentId, confirmName }: { componentId: number; confirmName: string }) =>
      api.deleteWithBody<{ product: Product }>(`/admin/products/${productId}/components/${componentId}`, {
        confirmName,
      }),
    onSuccess: () => invalidateProductLists(queryClient),
  });
}

export function useCreateComponent(productId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateComponentInput) =>
      api.post<{ product: Product }>(`/admin/products/${productId}/components`, input),
    onSuccess: () => invalidateProductLists(queryClient),
  });
}

/** Live service health, for the admin dashboard's system metrics. */
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
