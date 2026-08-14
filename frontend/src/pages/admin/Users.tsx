import { Plus, Search, ShieldCheck, Users as UsersIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminUsers } from '../../api/hooks';
import { Avatar } from '../../components/ui/Avatar';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Pill } from '../../components/ui/Pill';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { useDebounce } from '../../lib/useDebounce';

export function Users() {
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 350);
  const { data, isLoading, isFetching } = useAdminUsers(search);
  const users = data?.users ?? [];

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
        <div className="border-b border-white/30 px-5 py-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name or email…"
              aria-label="Search users"
              autoFocus
              className="focus-ring w-full rounded-xl border border-white/60 bg-white/80 py-2 pl-9 pr-3 text-sm placeholder:text-slate-500 backdrop-blur-sm"
            />
          </div>
        </div>

        {!search.trim() ? (
          <EmptyState icon={Search} title="Search for a user" description="Type a name or email above to find Bugzilla accounts." />
        ) : isLoading ? (
          <TableSkeleton rows={4} />
        ) : users.length === 0 ? (
          <EmptyState icon={UsersIcon} title="No users found" description={`No accounts matched "${search}".`} />
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
