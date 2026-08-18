import { AlertTriangle, Bug as BugIcon, CheckCircle2, CircleDot, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useBugCounts, useBugs } from '../api/hooks';
import { BarListChart, type BarListItem } from '../components/dashboard/BarListChart';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { StatCard } from '../components/ui/StatCard';
import { StatusPill, SeverityPill, STATUS_TONE, SEVERITY_TONE } from '../components/ui/Pill';
import { Skeleton } from '../components/ui/Skeleton';
import { bugDisplayId, timeAgo } from '../lib/utils';

/**
 * "Recently changed" is the only thing on this page that needs bug records, and
 * it shows six rows. Every number and both charts come from /api/bugs/count,
 * which tallies the full population server-side rather than a page of it.
 */
const RECENT_LIMIT = 6;

export function Dashboard() {
  const { data, isLoading } = useBugs({ limit: RECENT_LIMIT, offset: 0, sortBy: 'last_change_time', sortDir: 'desc' });
  const { data: countsData, isLoading: countsLoading } = useBugCounts();
  const recent = data?.bugs ?? [];
  const counts = countsData?.counts;

  const statusItems: BarListItem[] = Object.entries(counts?.byStatus ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label: label.replace('_', ' '), value, tone: STATUS_TONE[label] ?? 'slate' }));

  const severityItems: BarListItem[] = Object.entries(counts?.bySeverity ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value, tone: SEVERITY_TONE[label] ?? 'slate' }));

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">An overview of bug activity across your products.</p>
      </div>

      {countsLoading || !counts ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[84px] rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={BugIcon} label="Total bugs" value={counts.total} tone="brand" />
          <StatCard icon={CircleDot} label="Open" value={counts.open} tone="amber" />
          <StatCard icon={CheckCircle2} label="Resolved" value={counts.resolved} tone="emerald" />
          <StatCard icon={AlertTriangle} label="Blocker / Critical" value={counts.blockerCritical} tone="rose" />
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By status</CardTitle>
          </CardHeader>
          <CardBody>
            {countsLoading ? (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-2 w-full" />
                ))}
              </div>
            ) : (
              <BarListChart title="" items={statusItems} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By severity</CardTitle>
          </CardHeader>
          <CardBody>
            {countsLoading ? (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-2 w-full" />
                ))}
              </div>
            ) : (
              <BarListChart title="" items={severityItems} />
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recently changed</CardTitle>
          <Link to="/bugs" className="focus-ring rounded text-sm font-medium text-brand-700 hover:underline">
            View all
          </Link>
        </CardHeader>
        <div className="divide-y divide-white/30">
          {isLoading ? (
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
                className="focus-ring flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50"
              >
                <span className="w-20 shrink-0 font-mono text-xs text-slate-600" title={`Bug #${bug.id}`}>
                  {bugDisplayId(bug)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{bug.summary}</span>
                <StatusPill status={bug.status} />
                <SeverityPill severity={bug.severity} />
                <span className="w-20 shrink-0 text-right text-xs text-slate-600">{timeAgo(bug.lastChangeTime)}</span>
              </Link>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
