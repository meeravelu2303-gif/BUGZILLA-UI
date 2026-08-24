import { AlertCircle, AlertOctagon, Bug as BugIcon, CheckCircle2, CircleDot, Loader2, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useBugStats, useBugs } from '../api/hooks';
import { BarListChart, type BarListItem } from '../components/dashboard/BarListChart';
import { SeverityCategoryMatrix } from '../components/dashboard/SeverityCategoryMatrix';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { CategoryPill, SeverityPill, StatusPill } from '../components/ui/Pill';
import { Skeleton } from '../components/ui/Skeleton';
import { StatCard } from '../components/ui/StatCard';
import { bugDisplayId, timeAgo } from '../lib/utils';
import { CATEGORIES, SEVERITIES, type Category, type Severity } from '../types';

/** "Recently changed" is the only thing here needing bug records, and it shows six. */
const RECENT_LIMIT = 6;

export function Dashboard() {
  const { data: stats, isLoading, isError, error } = useBugStats();
  const { data: recentData, isLoading: recentLoading } = useBugs({
    limit: RECENT_LIMIT,
    offset: 0,
    sortBy: 'last_change_time',
    sortDir: 'desc',
  });
  const recent = recentData?.bugs ?? [];

  /*
   * This page reports *current defect load*, so every breakdown below counts open
   * bugs only. The lifetime tallies (`bySeverity` and friends) stay available for
   * the filter bar, where they describe the result set a filter would return.
   *
   * Mixing the two is what made this page read wrong: with 177 bugs resolved,
   * "Critical (P0)" showed 75 - every Critical ever filed - while 46 were actually
   * open, so resolving tickets moved the Open tile and nothing else.
   *
   * The `??` fallbacks keep the page correct against a backend that predates the
   * open-only fields: it degrades to the old lifetime numbers instead of zeroes.
   */
  const loadBySeverity = stats?.openBySeverity ?? stats?.bySeverity;
  const loadByCategory = stats?.openByCategory ?? stats?.byCategory;
  const loadByComponent = stats?.openByComponent ?? stats?.byComponent;

  const severityItems: BarListItem[] = SEVERITIES.filter((s) => (loadBySeverity?.[s] ?? 0) > 0).map((s) => ({
    label: s,
    value: loadBySeverity?.[s] ?? 0,
    tone: s === 'Critical' ? 'rose' : s === 'Major' ? 'orange' : s === 'Minor' ? 'sky' : 'slate',
  }));

  const categoryItems: BarListItem[] = CATEGORIES.filter((c) => (loadByCategory?.[c] ?? 0) > 0).map((c) => ({
    label: c,
    value: loadByCategory?.[c] ?? 0,
    tone: c === 'Security' ? 'violet' : c === 'Functional' ? 'blue' : c === 'Performance' ? 'amber' : 'emerald',
  }));

  const topComponents: BarListItem[] = Object.entries(loadByComponent ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, value]) => ({ label, value, tone: 'slate' as const }));

  if (isError) {
    return (
      <div className="mx-auto max-w-[1400px] px-8 py-8">
        <EmptyState
          icon={AlertCircle}
          title="Couldn't load the dashboard"
          description={error instanceof Error ? error.message : 'Bugzilla did not answer in time.'}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">Defect load by severity and category, across every product.</p>
      </div>

      {isLoading || !stats ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[84px] rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={BugIcon} label="Total bugs" value={stats.total} tone="brand" />
          <StatCard icon={CircleDot} label="Open" value={stats.open} tone="amber" />
          <StatCard icon={CheckCircle2} label="Resolved" value={stats.resolved} tone="emerald" />
          <StatCard icon={AlertOctagon} label="Critical (P0) open" value={loadBySeverity?.Critical ?? 0} tone="rose" />
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By severity</CardTitle>
            <Link to="/reports" className="focus-ring rounded text-sm font-medium text-brand-800 hover:underline">
              Reports
            </Link>
          </CardHeader>
          <CardBody>
            {isLoading || !stats ? <ChartSkeleton /> : <BarListChart title="" items={severityItems} />}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By category</CardTitle>
          </CardHeader>
          <CardBody>{isLoading || !stats ? <ChartSkeleton /> : <BarListChart title="" items={categoryItems} />}</CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Severity × category</CardTitle>
          <span className="text-xs text-slate-600">Every cell filters the bug list</span>
        </CardHeader>
        <CardBody>{isLoading || !stats ? <ChartSkeleton /> : <SeverityCategoryMatrix stats={stats} />}</CardBody>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Worst-affected components</CardTitle>
          </CardHeader>
          <CardBody>{isLoading || !stats ? <ChartSkeleton /> : <BarListChart title="" items={topComponents} />}</CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recently changed</CardTitle>
            <Link to="/bugs" className="focus-ring rounded text-sm font-medium text-brand-800 hover:underline">
              View all
            </Link>
          </CardHeader>
          <div className="divide-y divide-white/30">
            {recentLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : recent.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-600">No bugs yet.</p>
            ) : (
              recent.map((bug) => (
                <Link
                  key={bug.id}
                  to={`/bugs/${bug.id}`}
                  className="focus-ring flex items-center gap-3 px-5 py-3 hover:bg-slate-50"
                >
                  <span className="w-20 shrink-0 font-mono text-xs text-slate-600">{bugDisplayId(bug)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900" title={bug.summary}>
                    {bug.summary}
                  </span>
                  {bug.triage && <SeverityPill severity={bug.triage.severity} />}
                  <StatusPill status={bug.status} />
                  <span className="w-16 shrink-0 text-right text-xs text-slate-600">{timeAgo(bug.lastChangeTime)}</span>
                </Link>
              ))
            )}
          </div>
        </Card>
      </div>

      {stats && (stats.byCategory.Security ?? 0) > 0 && (
        <Link
          to={`/bugs?category=${encodeURIComponent('Security' satisfies Category)}&severity=${encodeURIComponent(
            'Critical' satisfies Severity
          )}`}
          className="focus-ring mt-6 flex items-center gap-3 rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-900 ring-1 ring-inset ring-violet-700/20 hover:bg-violet-100"
        >
          <Lock className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            <strong className="font-semibold">{stats.byCategory.Security.toLocaleString()}</strong> security defects on record —
            jump to the critical ones
          </span>
          <CategoryPill category="Security" className="ml-auto" />
        </Link>
      )}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-2 w-full" />
      ))}
    </div>
  );
}
