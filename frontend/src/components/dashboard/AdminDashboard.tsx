import { Activity, AlertTriangle, CheckCircle2, Database, Server, ShieldCheck, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminGroups, useAdminUsers, useBugCounts, useHealth, useProducts } from '../../api/hooks';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';
import { StatCard } from '../ui/StatCard';
import { Hint, TooltipProvider } from '../ui/primitives/tooltip';
import { ROLE_GROUPS, ROLE_LABELS, ROLE_TONES, roleFromGroups as roleOf } from '../../lib/roles';
import { Pill } from '../ui/Pill';

/**
 * The admin board: is the system up, and who can reach what.
 *
 * Roles come from lib/roles.ts, not a local copy. This file carried its own
 * `roleOf` and its own tone map, which is how one account could end up badged
 * a different colour here than on the Users page.
 */

export function AdminDashboard() {
  const health = useHealth();
  const { data: users, isLoading: usersLoading } = useAdminUsers('');
  const { data: groups } = useAdminGroups();
  const { data: products } = useProducts();
  const { data: counts } = useBugCounts();
  const [showDisabled, setShowDisabled] = useState(false);

  const allUsers = users?.users ?? [];
  const visibleUsers = useMemo(
    () => (showDisabled ? allUsers : allUsers.filter((u) => u.isEnabled)),
    [allUsers, showDisabled]
  );

  /*
   * The matrix columns are PRODUCT groups: the instance follows a
   * one-group-per-product convention, so a user can see a product when they
   * hold the same-named group. Matched case-insensitively because Bugzilla
   * compares group names that way - `Kpost Admin UI` does gate `KPost Admin UI`,
   * and an exact match would report the access as missing.
   */
  const productColumns = useMemo(() => {
    const groupNames = new Set((groups?.groups ?? []).map((g) => g.name.toLowerCase()));
    return (products?.products ?? []).map((p) => p.name).filter((name) => groupNames.has(name.toLowerCase()));
  }, [groups, products]);

  const holds = (userGroups: string[], productName: string) =>
    userGroups.some((g) => g.toLowerCase() === productName.toLowerCase());

  const bugzillaUp = health.data?.bugzilla?.ok === true;
  const bffUp = !health.isError && health.data?.ok === true;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Accounts" value={allUsers.length} icon={Users} tone="brand" to="/admin/users" />
          <StatCard label="Products" value={products?.products.length ?? 0} icon={ShieldCheck} tone="slate" />
          <StatCard label="Open defects" value={counts?.counts.open ?? 0} icon={Activity} tone="amber" to="/bugs" />
          <StatCard
            label="Administrators"
            value={allUsers.filter((u) => roleOf(u.groups) === 'admin').length}
            icon={ShieldCheck}
            tone="emerald"
          />
        </div>

        {/* ------------------------------------------------ system metrics */}
        <section className="surface">
          <header className="flex items-center justify-between border-b border-hairline px-5 py-4">
            <h2 className="font-display text-sm font-semibold text-slate-900">System health</h2>
            <span className="text-2xs text-slate-400">
              {health.isFetching ? 'Checking…' : 'Refreshes every 30s'}
            </span>
          </header>

          <div className="grid gap-px bg-slate-100 sm:grid-cols-3">
            <HealthTile
              icon={Server}
              label="BFF"
              ok={bffUp}
              detail={
                health.isLoading
                  ? 'Checking…'
                  : bffUp
                    ? `Up ${formatUptime(health.data?.uptimeSeconds ?? 0)} · sessions: ${health.data?.sessionStore}`
                    : 'Not responding'
              }
            />
            <HealthTile
              icon={Database}
              label="Bugzilla"
              ok={bugzillaUp}
              detail={
                health.isLoading
                  ? 'Checking…'
                  : bugzillaUp
                    ? `Version ${health.data?.bugzilla?.version}`
                    : (health.data?.bugzilla?.error ?? 'Unreachable')
              }
            />
            {/*
              There is no direct database probe, and showing a green light we
              cannot verify would be worse than showing none. The BFF ships with
              no database driver - it proxies Bugzilla's API and nothing else -
              so MariaDB is observed THROUGH Bugzilla: if the database is down,
              Bugzilla's own call fails and the tile beside this one turns red.
            */}
            <HealthTile
              icon={Database}
              label="MariaDB"
              ok={bugzillaUp}
              indirect
              detail={bugzillaUp ? 'Reachable via Bugzilla' : 'Unknown - Bugzilla is down'}
            />
          </div>
        </section>

        {/* ------------------------------------------------ access matrix */}
        <section className="surface overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-4">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900">User access matrix</h2>
              <p className="mt-0.5 text-2xs text-slate-500">
                Role, plus which products each account can reach
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowDisabled((v) => !v)}>
                {showDisabled ? 'Hide disabled' : 'Show disabled'}
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link to="/admin/users">Manage users</Link>
              </Button>
            </div>
          </header>

          {usersLoading && (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          )}

          {!usersLoading && visibleUsers.length === 0 && (
            <EmptyState
              icon={Users}
              title="No accounts to show"
              description="This view needs the editusers permission to list accounts."
            />
          )}

          {!usersLoading && visibleUsers.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-hairline bg-slate-50 text-left">
                    <th className="sticky left-0 z-10 bg-slate-50 px-4 py-2 text-2xs font-semibold uppercase tracking-wide text-slate-500">
                      Account
                    </th>
                    <th className="px-3 py-2 text-2xs font-semibold uppercase tracking-wide text-slate-500">Role</th>
                    {productColumns.map((name) => (
                      <th
                        key={name}
                        className="px-3 py-2 text-center text-2xs font-semibold uppercase tracking-wide text-slate-500"
                      >
                        {name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.map((user) => {
                    const role = roleOf(user.groups);
                    return (
                      <tr key={user.id} className="border-b border-hairline transition-colors duration-200 last:border-0 hover:bg-slate-50/80">
                        <td className="sticky left-0 z-10 bg-white px-5 py-3.5">
                          <Link
                            to={`/admin/users/${user.id}`}
                            className="focus-ring block rounded font-medium text-slate-900 hover:text-brand-700"
                          >
                            {user.fullName || user.email}
                          </Link>
                          <span className="block text-2xs text-slate-500">{user.email}</span>
                          {!user.isEnabled && (
                            <span className="mt-0.5 inline-block rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-2xs font-medium text-rose-700">
                              Disabled
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <Hint label={ROLE_GROUPS[role].join(', ')}>
                            <span className="inline-flex cursor-default">
                              <Pill tone={ROLE_TONES[role]}>{ROLE_LABELS[role]}</Pill>
                            </span>
                          </Hint>
                        </td>
                        {productColumns.map((name) => (
                          <td key={name} className="px-4 py-3.5 text-center">
                            {holds(user.groups, name) ? (
                              <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" aria-label="Has access" />
                            ) : (
                              <span className="text-slate-300" aria-label="No access">
                                —
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {productColumns.length === 0 && !usersLoading && (
            <p className="border-t border-hairline px-4 py-3 text-2xs text-slate-500">
              No product has a same-named Bugzilla group, so per-product access cannot be shown. Roles above are still
              accurate.
            </p>
          )}
        </section>

        {/*
          Active sessions are deliberately absent rather than faked.
          backend/src/lib/sessionRegistry.ts tracks them, but no route exposes
          that registry - `GET /api/auth/me` returns only the current user. The
          panel would need a new read-only BFF endpoint, which is a backend
          change rather than a UI one.
        */}
        <section className="surface flex items-start gap-3 px-5 py-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-xs text-slate-600">
            <span className="font-medium text-slate-900">Active session manager not shown.</span> The BFF tracks
            sessions in <code className="rounded bg-slate-100 px-1 py-0.5 text-2xs">sessionRegistry</code>, but no
            endpoint exposes them yet — so there is nothing honest to display here. It needs a small read-only route on
            the backend.
          </p>
        </section>
      </div>
    </TooltipProvider>
  );
}

function HealthTile({
  icon: Icon,
  label,
  ok,
  detail,
  indirect,
}: {
  icon: typeof Server;
  label: string;
  ok: boolean;
  detail: string;
  indirect?: boolean;
}) {
  return (
    <div className="flex items-start gap-3.5 bg-white px-5 py-4">
      <span
        className={cn(
          'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg',
          ok ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
          {label}
          <span
            className={cn('h-1.5 w-1.5 rounded-full', ok ? 'bg-emerald-500' : 'bg-rose-500')}
            aria-label={ok ? 'healthy' : 'unhealthy'}
          />
          {indirect && <span className="text-2xs font-normal text-slate-400">(indirect)</span>}
        </p>
        <p className="truncate text-2xs text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
