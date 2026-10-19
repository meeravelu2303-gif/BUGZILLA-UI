import { Plus, Search, Users as UsersIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminUsers, useProducts } from '../../api/hooks';
import {
  ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_ICONS,
  ROLE_LABELS,
  ROLE_TONES,
  roleFromGroups as roleOf,
  type Role,
} from '../../lib/roles';
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
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 350);
  const [productFilter, setProductFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | ''>('');
  const { data, isLoading, isFetching } = useAdminUsers(search);
  const { data: productsData } = useProducts();

  const allUsers = data?.users ?? [];
  // Product access in Bugzilla is granted through a group; on this instance each product has a
  // group of the same name, so "users with access to product X" = users whose groups include X.
  const users = useMemo(
    () =>
      allUsers.filter((u) => {
        if (productFilter && !u.groups.includes(productFilter)) return false;
        if (roleFilter && roleOf(u.groups) !== roleFilter) return false;
        return true;
      }),
    [allUsers, productFilter, roleFilter]
  );

  /*
   * Counts for the role options, taken from the SEARCH RESULT rather than the
   * filtered list - so "Tester (7)" keeps saying how many testers the current
   * search found, instead of collapsing to the count of whichever role is
   * already selected.
   */
  const roleCounts = useMemo(() => {
    const counts: Record<Role, number> = { developer: 0, tester: 0, admin: 0 };
    for (const u of allUsers) counts[roleOf(u.groups)] += 1;
    return counts;
  }, [allUsers]);

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
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-4">
          {/*
            `max-w-xl` capped this row at 576px, which three controls cannot
            share - so the product select wrapped onto its own line. The row now
            takes the width available and the search absorbs the slack, keeping
            all three on one line until the viewport genuinely cannot hold them.
          */}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <div className="relative min-w-[11rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Filter by name or email…"
                aria-label="Search users"
                autoFocus
                className="h-10 w-full rounded-xl border border-line bg-white/85 pl-9 pr-3 text-sm text-slate-900 shadow-[inset_0_1px_1px_rgb(15_23_42_/_0.03)] outline-none transition-all placeholder:text-slate-400 hover:border-slate-500/55 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/15"
              />
            </div>
            <Select
              className="w-40 shrink-0"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as Role | '')}
              aria-label="Filter by role"
            >
              <option value="">All roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]} ({roleCounts[r]})
                </option>
              ))}
            </Select>
            <Select
              className="w-44 shrink-0"
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
            /*
             * Names every active filter, not just the first one that happens to
             * be set. With three filters it is easy to leave one on from an
             * earlier look and then read "no users have access to X" as a fact
             * about the product rather than about the combination.
             */
            description={
              search.trim() || productFilter || roleFilter
                ? `No accounts match ${[
                    roleFilter ? `role “${ROLE_LABELS[roleFilter]}”` : null,
                    productFilter ? `access to “${productFilter}”` : null,
                    search.trim() ? `the search “${search.trim()}”` : null,
                  ]
                    .filter(Boolean)
                    .join(' and ')}.`
                : 'Create the first account with “New user”.'
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
            {users.map((u) => (
              <li key={u.id}>
                <Link to={`/admin/users/${u.id}`} className="focus-ring flex items-center gap-3 px-5 py-3.5 hover:bg-white/50">
                  <Avatar name={u.fullName || u.email} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{u.fullName || u.email}</p>
                    <p className="truncate text-xs text-slate-600">{u.email}</p>
                  </div>
                  {/*
                    Role on EVERY row, not just a badge on admins.
                    
                    The previous version showed nothing for the other 16
                    accounts, so the list could not answer "who are our
                    testers?" - the one question an admin opens this page with.
                    Derived from the account's groups via lib/roles.ts, the same
                    way the backend derives it, so the label here and the
                    permissions the server enforces cannot drift apart.
                  */}
                  <Pill tone={ROLE_TONES[roleOf(u.groups)]} icon={ROLE_ICONS[roleOf(u.groups)]} title={ROLE_DESCRIPTIONS[roleOf(u.groups)]}>
                    {ROLE_LABELS[roleOf(u.groups)]}
                  </Pill>
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
