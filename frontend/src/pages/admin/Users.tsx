import { Plus, Search, ShieldCheck, Users as UsersIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminUsers, useProducts } from '../../api/hooks';
import { Avatar } from '../../components/ui/Avatar';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Pill } from '../../components/ui/Pill';
import { Select } from '../../components/ui/Field';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { useDebounce } from '../../lib/useDebounce';

export function Users() {
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 350);
  const [productFilter, setProductFilter] = useState('');
  const { data, isLoading, isFetching } = useAdminUsers(search);
  const { data: productsData } = useProducts();

  const allUsers = data?.users ?? [];
  // Product access in Bugzilla is granted through a group; on this instance each product has a
  // group of the same name, so "users with access to product X" = users whose groups include X.
  const users = useMemo(
    () => (productFilter ? allUsers.filter((u) => u.groups.includes(productFilter)) : allUsers),
    [allUsers, productFilter]
  );

  return (
    <div className="mx-auto max-w-[1000px] animate-page-in px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        icon={UsersIcon}
        eyebrow="Administration"
        title="Users"
        description="Search, create, and enable or disable Bugzilla accounts."
        actions={
          <Link
            to="/admin/users/new"
            className="focus-ring inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-b from-brand-600 to-brand-800 px-5 text-sm font-semibold text-white shadow-glow ring-1 ring-inset ring-white/20 transition-all hover:from-brand-700 hover:to-brand-900 hover:shadow-float"
          >
            <Plus className="h-4 w-4" aria-hidden />
            New user
          </Link>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-900/[0.06] px-5 py-4">
          <div className="flex w-full max-w-xl flex-wrap items-center gap-3">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Filter by name or email…"
                aria-label="Search users"
                autoFocus
                className="h-10 w-full rounded-xl border border-slate-900/10 bg-white/85 pl-9 pr-3 text-sm text-slate-900 shadow-[inset_0_1px_1px_rgb(15_23_42_/_0.03)] outline-none transition-all placeholder:text-slate-400 hover:border-slate-900/20 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/15"
              />
            </div>
            <Select
              className="w-48"
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              aria-label="Filter by product access"
            >
              <option value="">All products</option>
              {(productsData?.products ?? []).map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          {!isLoading && (
            <p className="text-xs text-slate-500">
              {users.length} {users.length === 1 ? 'account' : 'accounts'}
              {search.trim() ? ' matched' : ''}
            </p>
          )}
        </div>

        {isLoading ? (
          <TableSkeleton rows={6} />
        ) : users.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title={search.trim() || productFilter ? 'No users found' : 'No accounts yet'}
            description={
              productFilter
                ? `No users have access to "${productFilter}".`
                : search.trim()
                  ? `No accounts matched "${search}".`
                  : 'Create the first account with “New user”.'
            }
          />
        ) : (
          <ul className={`divide-y divide-white/30 ${isFetching ? 'opacity-60 transition-opacity' : ''}`}>
            {users.map((u) => (
              <li key={u.id}>
                <Link to={`/admin/users/${u.id}`} className="focus-ring flex items-center gap-3 px-5 py-3.5 hover:bg-white/50">
                  <Avatar name={u.fullName || u.email} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{u.fullName || u.email}</p>
                    <p className="truncate text-xs text-slate-600">{u.email}</p>
                  </div>
                  {u.groups.includes('editusers') && (
                    <Pill tone="violet">
                      <ShieldCheck className="h-3 w-3" /> Admin
                    </Pill>
                  )}
                  <Pill tone={u.isEnabled ? 'emerald' : 'rose'}>{u.isEnabled ? 'Enabled' : 'Disabled'}</Pill>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
