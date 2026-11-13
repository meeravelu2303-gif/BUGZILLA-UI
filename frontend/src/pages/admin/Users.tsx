import { Eye, Pencil, Plus, Search, Trash2, Users as UsersIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminUsers, useMe, useProducts } from '../../api/hooks';
import {
  ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_ICONS,
  ROLE_LABELS,
  ROLE_TONES,
  roleFromGroups as roleOf,
  type Role,
} from '../../lib/roles';
import { DeleteUserDialog } from '../../components/admin/DeleteUserDialog';
import { Avatar } from '../../components/ui/Avatar';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Pill } from '../../components/ui/Pill';
import { Select } from '../../components/ui/Field';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { useDebounce } from '../../lib/useDebounce';

export function Users() {
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 150);
  const [productFilter, setProductFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | ''>('');
  const { data, isLoading, isFetching } = useAdminUsers('');
  const { data: productsData } = useProducts();
  const { data: me } = useMe();
  const canManage = Boolean(me?.user.permissions.canManageUsers);

  const everyone = data?.users ?? [];
  const allUsers = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return everyone;
    return everyone.filter((adminUser) => {
      const haystack = `${adminUser.fullName ?? ''} ${adminUser.email}`.toLowerCase();
      return words.every((word) => haystack.includes(word));
    });
  }, [everyone, search]);
  const users = useMemo(
    () =>
      allUsers.filter((user) => {
        if (productFilter && !user.groups.includes(productFilter)) return false;
        if (roleFilter && roleOf(user.groups) !== roleFilter) return false;
        return true;
      }),
    [allUsers, productFilter, roleFilter],
  );

  const roleCounts = useMemo(() => {
    const counts: Record<Role, number> = { reporter: 0, developer: 0, tester: 0, admin: 0 };
    for (const user of allUsers) counts[roleOf(user.groups)] += 1;
    return counts;
  }, [allUsers]);

  return (
    <div className="mx-auto max-w-[66.6667rem] animate-page-in px-4 py-6 sm:px-6 lg:px-8 2xl:px-10">
      <PageHeader
        icon={UsersIcon}
        eyebrow="Administration"
        title="Users"
        description={
          canManage
            ? 'Search, create, edit, disable and delete Bugzilla accounts.'
            : 'Search Bugzilla accounts and see their role and product access.'
        }
        actions={
          canManage && (
            <Link
              to="/admin/users/new"
              className="focus-ring inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-b from-brand-600 to-brand-800 px-5 text-sm font-semibold text-white shadow-glow ring-1 ring-inset ring-white/20 transition-all hover:from-brand-700 hover:to-brand-900 hover:shadow-float"
            >
              <Plus className="h-4 w-4" aria-hidden />
              New user
            </Link>
          )
        }
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-4">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <div className="relative min-w-[11rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Filter by name or email…"
                aria-label="Search users"
                autoFocus
                className="h-10 w-full rounded-xl border border-line bg-white/85 pl-9 pr-3 text-sm text-slate-900 shadow-[inset_0_1px_1px_rgb(15_23_42_/_0.03)] outline-none transition-all placeholder:text-slate-400 hover:border-slate-500/55 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/15"
              />
            </div>
            <Select
              className="w-40 shrink-0"
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value as Role | '')}
              aria-label="Filter by role"
            >
              <option value="">All roles</option>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]} ({roleCounts[role]})
                </option>
              ))}
            </Select>
            <Select
              className="w-44 shrink-0"
              value={productFilter}
              onChange={(event) => setProductFilter(event.target.value)}
              aria-label="Filter by product access"
            >
              <option value="">All products</option>
              {(productsData?.products ?? []).map((product) => (
                <option key={product.name} value={product.name}>
                  {product.name}
                </option>
              ))}
            </Select>
          </div>
          {!isLoading && (
            <p className="shrink-0 whitespace-nowrap text-xs text-slate-500">
              {users.length} {users.length === 1 ? 'account' : 'accounts'}
              {search.trim() || roleFilter || productFilter ? ' matched' : ''}
            </p>
          )}
        </div>

        {isLoading ? (
          <TableSkeleton rows={6} />
        ) : users.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title={search.trim() || productFilter || roleFilter ? 'No users found' : 'No accounts yet'}
            description={
              search.trim() || productFilter || roleFilter
                ? `No accounts match ${[
                    roleFilter ? `role “${ROLE_LABELS[roleFilter]}”` : null,
                    productFilter ? `access to “${productFilter}”` : null,
                    search.trim() ? `the search “${search.trim()}”` : null,
                  ]
                    .filter(Boolean)
                    .join(' and ')}.`
                : canManage
                  ? 'Create the first account with “New user”.'
                  : 'There are no accounts to show.'
            }
            action={
              search.trim() || productFilter || roleFilter ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearchInput('');
                    setProductFilter('');
                    setRoleFilter('');
                  }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className={`divide-y divide-white/30 ${isFetching ? 'opacity-60 transition-opacity' : ''}`}>
            {users.map((user) => (
              <li key={user.id} className="flex items-center gap-2 pr-3 hover:bg-white/50">
                <Link
                  to={`/admin/users/${user.id}`}
                  className="focus-ring flex min-w-0 flex-1 items-center gap-3 px-5 py-3.5"
                >
                  <Avatar name={user.fullName || user.email} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{user.fullName || user.email}</p>
                    <p className="truncate text-xs text-slate-600">{user.email}</p>
                  </div>
                  <Pill
                    tone={ROLE_TONES[roleOf(user.groups)]}
                    icon={ROLE_ICONS[roleOf(user.groups)]}
                    title={ROLE_DESCRIPTIONS[roleOf(user.groups)]}
                  >
                    {ROLE_LABELS[roleOf(user.groups)]}
                  </Pill>
                  <Pill tone={user.isEnabled ? 'emerald' : 'rose'}>{user.isEnabled ? 'Enabled' : 'Disabled'}</Pill>
                </Link>
                <div className="flex shrink-0 items-center gap-1">
                  <Link
                    to={`/admin/users/${user.id}`}
                    className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[0.8667rem] font-medium text-slate-600 hover:bg-white hover:text-slate-900"
                    aria-label={`${canManage ? 'Edit' : 'View'} ${user.fullName || user.email}`}
                  >
                    {canManage ? (
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <Eye className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {canManage ? 'Edit' : 'View'}
                  </Link>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => setDeletingId(user.id)}
                      className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[0.8667rem] font-medium text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      aria-label={`Delete ${user.fullName || user.email}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
                    </button>
                  )}
                </div>
                {canManage && deletingId === user.id && (
                  <DeleteUserDialog open user={user} onClose={() => setDeletingId(null)} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
