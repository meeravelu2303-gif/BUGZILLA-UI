import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, buildQuery } from './client';
import type {
  AdminGroup,
  AdminUser,
  AuthUser,
  BugCounts,
  BugDetailResponse,
  BugListResponse,
  BugMeta,
  CountBugsParams,
  CreateBugInput,
  CreateComponentInput,
  CreateProductInput,
  CreateUserInput,
  ListBugsParams,
  Product,
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

export function useMeta() {
  return useQuery({
    queryKey: ['meta'],
    queryFn: () => api.get<BugMeta>('/meta'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: () => api.get<{ products: Product[] }>('/products'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useBugs(params: ListBugsParams) {
  return useQuery({
    queryKey: ['bugs', params],
    queryFn: () => api.get<BugListResponse>(`/bugs${buildQuery(params as Record<string, string | number | undefined>)}`),
    placeholderData: (prev) => prev,
  });
}

/**
 * Genuine totals for the dashboard stat cards. Separate from useBugs because
 * useBugs is capped at 200 server-side - counting its results understates the
 * real number as soon as there are more bugs than one page.
 */
export function useBugCounts(params: CountBugsParams = {}) {
  return useQuery({
    queryKey: ['bugs', 'count', params],
    queryFn: () => api.get<{ counts: BugCounts }>(`/bugs/count${buildQuery(params as Record<string, string | number | undefined>)}`),
    staleTime: 30 * 1000,
  });
}

export function useBug(id: number) {
  return useQuery({
    queryKey: ['bugs', id],
    queryFn: () => api.get<BugDetailResponse>(`/bugs/${id}`),
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
    mutationFn: (input: UpdateBugInput) => api.patch<{ bug: BugDetailResponse['bug'] }>(`/bugs/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bugs', id] });
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
    mutationFn: (input: CreateUserInput) => api.post<{ user: AdminUser }>('/admin/users', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

export function useUpdateUser(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateUserInput) => api.patch<{ user: AdminUser }>(`/admin/users/${id}`, input),
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
    mutationFn: (input: CreateProductInput) => api.post<{ product: Product }>('/admin/products', input),
    onSuccess: () => invalidateProductLists(qc),
  });
}

export function useUpdateProduct(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProductInput) => api.patch<{ product: Product }>(`/admin/products/${id}`, input),
    onSuccess: () => invalidateProductLists(qc),
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

export function useCreateComponent(productId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateComponentInput) => api.post<{ product: Product }>(`/admin/products/${productId}/components`, input),
    onSuccess: () => invalidateProductLists(qc),
  });
}
