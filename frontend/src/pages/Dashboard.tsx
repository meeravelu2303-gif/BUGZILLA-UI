import {
  AlertCircle,
  AlertOctagon,
  Bug as BugIcon,
  CheckCircle2,
  CircleDot,
  LayoutDashboard,
  Loader2,
  Lock,
  RotateCcw,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAssignableUsers, useBugCounts, useBugStats, useBugs, useMe, useMeta } from '../api/hooks';
import { AdminDashboard } from '../components/dashboard/AdminDashboard';
import { DeveloperDashboard } from '../components/dashboard/DeveloperDashboard';
import { DeveloperPicker } from '../components/dashboard/DeveloperPicker';
import { QaDashboard } from '../components/dashboard/QaDashboard';
import { ReporterPicker } from '../components/dashboard/ReporterPicker';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/primitives/Tabs';
import { VIEW_LABELS, useDashboardView, type DashboardView } from '../lib/useRole';
import { BarListChart, type BarListItem } from '../components/dashboard/BarListChart';
import { SeverityCategoryMatrix } from '../components/dashboard/SeverityCategoryMatrix';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { CategoryPill, SeverityPill, StatusPill } from '../components/ui/Pill';
import { Skeleton } from '../components/ui/Skeleton';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { bugDisplayId, timeAgo } from '../lib/utils';
import { CATEGORIES, SEVERITIES, type Category, type Severity } from '../types';

const RECENT_LIMIT = 6;
const REOPENED_LIMIT = 8;

function listUrl(filters: Record<string, string[]>): string {
  const searchParams = new URLSearchParams();
  for (const [key, values] of Object.entries(filters)) for (const value of values) searchParams.append(key, value);
  return `/bugs?${searchParams.toString()}`;
}

function OverviewPanel() {
  const { data: metaForGate } = useMeta();
  const { data: stats, isLoading, isError, error } = useBugStats();
  const { data: recentData, isLoading: recentLoading } = useBugs({
    limit: RECENT_LIMIT,
    offset: 0,
    sortBy: 'last_change_time',
    sortDir: 'desc',
  });
  const recent = recentData?.bugs ?? [];

  const hasReopenedStatus = (metaForGate?.statuses ?? []).includes('REOPENED');
  const { data: reopenedCount } = useBugCounts({ status: ['REOPENED'] }, { enabled: hasReopenedStatus });
  const { data: reopenedData, isLoading: reopenedLoading } = useBugs({
    status: ['REOPENED'],
    limit: REOPENED_LIMIT,
    offset: 0,
    sortBy: 'last_change_time',
    sortDir: 'desc',
  });
  const reopened = reopenedData?.bugs ?? [];

  const { data: meta } = useMeta();
  const workflow = meta?.workflow ?? [];
  const openStatuses = workflow.length
    ? workflow
        .filter((workflowTransition) => workflowTransition.isOpen)
        .map((workflowTransition) => workflowTransition.status)
    : ['UNCONFIRMED', 'CONFIRMED', 'PENDING_APPROVAL', 'AWAITING_REQUIREMENT', 'IN_PROGRESS', 'IN_REVIEW', 'REOPENED'];
  const closedStatuses = workflow.length
    ? workflow
        .filter((workflowTransition) => !workflowTransition.isOpen)
        .map((workflowTransition) => workflowTransition.status)
    : ['RESOLVED', 'CLOSED'];
  const reopenedTotal = reopenedCount?.counts.total;
  const { data: openCountsAll } = useBugCounts({ status: openStatuses }, { enabled: workflow.length > 0 });

  const loadBySeverity = stats?.openBySeverity ?? stats?.bySeverity;
  const loadByCategory = stats?.openByCategory ?? stats?.byCategory;
  const loadByComponent = stats?.openByComponent ?? stats?.byComponent;

  const severityItems: BarListItem[] = SEVERITIES.filter((severity) => (loadBySeverity?.[severity] ?? 0) > 0).map(
    (severity) => ({
      label: severity,
      value: loadBySeverity?.[severity] ?? 0,
      tone: severity === 'Critical' ? 'rose' : severity === 'Major' ? 'orange' : severity === 'Minor' ? 'sky' : 'slate',
    }),
  );

  const categoryItems: BarListItem[] = CATEGORIES.filter((category) => (loadByCategory?.[category] ?? 0) > 0).map(
    (category) => ({
      label: category,
      value: loadByCategory?.[category] ?? 0,
      tone:
        category === 'Security'
          ? 'violet'
          : category === 'Functional'
            ? 'blue'
            : category === 'Performance'
              ? 'amber'
              : 'emerald',
    }),
  );

  const topComponents: BarListItem[] = Object.entries(loadByComponent ?? {})
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([label, value]) => ({ label, value, tone: 'slate' as const }));

  if (isError) {
    return (
      <div className="mx-auto max-w-[128rem] animate-page-in px-4 py-6 sm:px-6 lg:px-8 2xl:px-10">
        <EmptyState
          icon={AlertCircle}
          title="Couldn't load the dashboard"
          description={error instanceof Error ? error.message : 'Bugzilla did not answer in time.'}
        />
      </div>
    );
  }

  return (
    <div>
      {isLoading || !stats ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[84px] rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <StatCard icon={BugIcon} label="Total bugs" value={stats.total} tone="brand" to="/bugs" />
          <StatCard
            icon={CircleDot}
            label="Open"
            value={stats.open}
            tone="amber"
            to={listUrl({ status: openStatuses })}
          />
          <StatCard
            icon={CheckCircle2}
            label="Resolved"
            value={stats.resolved}
            tone="emerald"
            to={listUrl({ status: closedStatuses })}
          />
          <StatCard
            icon={AlertOctagon}
            label="Top priority"
            value={openCountsAll?.counts.urgent ?? loadBySeverity?.Critical ?? 0}
            tone="rose"
            to={`${listUrl({ status: openStatuses })}&urgent=1`}
            hint="Open, Critical or P0"
          />
          <StatCard
            icon={RotateCcw}
            label="Reopened"
            value={hasReopenedStatus ? (reopenedTotal ?? '…') : 0}
            tone="amber"
            to={hasReopenedStatus ? listUrl({ status: ['REOPENED'] }) : undefined}
            hint={hasReopenedStatus ? "Fixes that didn't hold" : 'REOPENED status not configured in Bugzilla'}
          />
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
          <CardBody>
            {isLoading || !stats ? <ChartSkeleton /> : <BarListChart title="" items={categoryItems} />}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <div>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-rose-600" aria-hidden />
                Reopened bugs{reopenedTotal ? ` (${reopenedTotal})` : ''}
              </span>
            </CardTitle>
            <p className="mt-0.5 text-xs text-slate-600">
              Marked resolved, re-tested, and still failing - newest first.
            </p>
          </div>
          {(reopenedTotal ?? 0) > 0 && (
            <Link
              to="/bugs?status=REOPENED"
              className="focus-ring rounded text-sm font-medium text-brand-800 hover:underline"
            >
              View all
            </Link>
          )}
        </CardHeader>
        <div className="divide-y divide-white/30">
          {reopenedLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : reopened.length === 0 ? (
            <p className="flex items-center justify-center gap-2 px-5 py-6 text-sm text-slate-600">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /> Nothing reopened - every fix has held.
            </p>
          ) : (
            reopened.map((bug) => (
              <Link
                key={bug.id}
                to={`/bugs/${bug.id}`}
                className="focus-ring flex items-center gap-3 px-5 py-3 hover:bg-slate-50"
              >
                <span className="w-20 shrink-0 font-mono text-xs text-slate-600">{bugDisplayId(bug)}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900" title={bug.summary}>
                  {bug.summary}
                </span>
                <span
                  className="hidden w-40 shrink-0 truncate text-xs text-slate-600 md:block"
                  title={bug.assignedTo?.email}
                >
                  {bug.assignedTo?.name ?? 'Unassigned'}
                </span>
                {bug.triage && <SeverityPill severity={bug.triage.severity} />}
                <span className="w-16 shrink-0 text-right text-xs text-slate-600">{timeAgo(bug.lastChangeTime)}</span>
              </Link>
            ))
          )}
        </div>
      </Card>

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
          <CardBody>
            {isLoading || !stats ? <ChartSkeleton /> : <BarListChart title="" items={topComponents} />}
          </CardBody>
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
            'Critical' satisfies Severity,
          )}`}
          className="focus-ring mt-6 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-violet-50/90 to-white/60 px-5 py-3.5 text-sm text-violet-900 shadow-glass ring-1 ring-inset ring-violet-700/15 backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:shadow-float"
        >
          <Lock className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            <strong className="font-semibold">{stats.byCategory.Security.toLocaleString()}</strong> security defects on
            record — jump to the critical ones
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

/** The dashboard, routed by role. */
export function Dashboard() {
  const { view, setView, allowed } = useDashboardView();
  const { data } = useMe();
  const email = data?.user.email ?? '';

  const canPickDeveloper = allowed.includes('qa') || allowed.includes('admin');
  const [params, setParams] = useSearchParams();
  const developerEmail = canPickDeveloper ? (params.get('dev') ?? '') : '';
  const { data: people } = useAssignableUsers();
  const developerName =
    people?.users.find((user) => user.email.toLowerCase() === developerEmail.toLowerCase())?.name ?? '';
  const canPickReporter = allowed.includes('admin');
  const reporterEmail = canPickReporter ? (params.get('reporter') ?? '') : email;
  const pickReporter = (next: string) => {
    setParams(
      (searchParams) => {
        if (next) searchParams.set('reporter', next);
        else searchParams.delete('reporter');
        return searchParams;
      },
      { replace: true },
    );
  };

  const pickDeveloper = (next: string) => {
    setParams(
      (searchParams) => {
        if (next) searchParams.set('dev', next);
        else searchParams.delete('dev');
        return searchParams;
      },
      { replace: true },
    );
  };

  const tabs: Array<{ id: DashboardView | 'overview'; label: string }> = [
    ...allowed.map((value) => ({ id: value, label: VIEW_LABELS[value] })),
    { id: 'overview' as const, label: 'Overview' },
  ];

  const [tab, setTab] = useState<DashboardView | 'overview'>(view);

  useEffect(() => {
    setTab((current) => (current === 'overview' || allowed.includes(current as DashboardView) ? current : view));
  }, [view, allowed]);

  const select = (next: string) => {
    const id = next as DashboardView | 'overview';
    setTab(id);
    if (id !== 'overview') setView(id);
  };

  return (
    <div className="mx-auto max-w-[128rem] animate-page-in px-4 py-6 sm:px-6 lg:px-8 2xl:px-10">
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        description={
          tab === 'developer' && developerEmail
            ? `What is assigned to ${developerName || developerEmail}, worst first.`
            : tab === 'developer' && canPickDeveloper
              ? 'What is assigned across all developers, worst first.'
              : tab === 'qa' && !canPickReporter
                ? 'The bugs you reported, the triage queue, and filing.'
                : DESCRIPTIONS[tab]
        }
      />

      {tabs.length > 2 ? (
        <Tabs value={tab} onValueChange={select}>
          <TabsList className="mb-5">
            {tabs.map((tabItem) => (
              <TabsTrigger key={tabItem.id} value={tabItem.id}>
                {tabItem.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {allowed.includes('qa') && (
            <TabsContent value="qa">
              {canPickReporter && <ReporterPicker value={reporterEmail} onChange={pickReporter} />}
              {(canPickReporter || email) && (
                <QaDashboard
                  key={reporterEmail || 'everyone'}
                  reporter={reporterEmail || undefined}
                  mine={!canPickReporter}
                />
              )}
            </TabsContent>
          )}
          {allowed.includes('developer') && (
            <TabsContent value="developer">
              {canPickDeveloper && <DeveloperPicker value={developerEmail} onChange={pickDeveloper} />}
              <DeveloperDashboard
                key={canPickDeveloper ? developerEmail || 'all' : email}
                email={canPickDeveloper ? developerEmail : email}
                all={canPickDeveloper && !developerEmail}
                name={developerEmail ? developerName || developerEmail : undefined}
              />
            </TabsContent>
          )}
          {allowed.includes('admin') && (
            <TabsContent value="admin">
              <AdminDashboard />
            </TabsContent>
          )}
          <TabsContent value="overview">
            <OverviewPanel />
          </TabsContent>
        </Tabs>
      ) : allowed[0] === 'qa' ? (
        email && <QaDashboard key={email} reporter={email} mine />
      ) : (
        <DeveloperDashboard email={email} />
      )}
    </div>
  );
}

const DESCRIPTIONS: Record<DashboardView | 'overview', string> = {
  qa: 'Incoming failures, the triage queue, and filing.',
  developer: 'What is assigned to you, worst first.',
  admin: 'Service health and who can reach what.',
  overview: 'Defect load by severity and category, across the products you can access.',
};
