import { Plus, Search, ShieldCheck, Users as UsersIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminUsers, useProducts } from '../../api/hooks';
import { Avatar } from '../../components/ui/Avatar';
import { Card } from '../../components/ui/Card';
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
    <div className="mx-auto max-w-[1000px] px-8 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Users</h1>
          <p className="mt-1 text-sm text-slate-600">Search, create, and enable or disable Bugzilla accounts.</p>
        </div>
        <Link
          to="/admin/users/new"
          className="focus-ring inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-brand-700 to-brand-800 px-4 py-2 text-sm font-medium text-white shadow-glass hover:from-brand-800 hover:to-brand-900"
        >
          <Plus className="h-4 w-4" />
          New user
        </Link>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/30 px-5 py-4">
          <div className="flex w-full max-w-xl flex-wrap items-center gap-3">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Filter by name or email…"
                aria-label="Search users"
                autoFocus
                className="focus-ring w-full rounded-xl border border-white/60 bg-white/80 py-2 pl-9 pr-3 text-sm placeholder:text-slate-500 backdrop-blur-sm"
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
