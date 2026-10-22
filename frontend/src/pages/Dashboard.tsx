import { AlertCircle, AlertOctagon, Bug as BugIcon, CheckCircle2, CircleDot, LayoutDashboard, Loader2, Lock, RotateCcw } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAssignableUsers, useBugCounts, useBugStats, useBugs, useMe, useMeta } from '../api/hooks';
import { AdminDashboard } from '../components/dashboard/AdminDashboard';
import { DeveloperDashboard } from '../components/dashboard/DeveloperDashboard';
import { DeveloperPicker } from '../components/dashboard/DeveloperPicker';
import { QaDashboard } from '../components/dashboard/QaDashboard';
import { ReporterPicker } from '../components/dashboard/ReporterPicker';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/primitives/tabs';
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

/** "Recently changed" is the only thing here needing bug records, and it shows six. */
const RECENT_LIMIT = 6;
const REOPENED_LIMIT = 8;

/** A bug-list URL with repeated keys (`?status=A&status=B`), which is how the list reads multi-select filters. */
function listUrl(filters: Record<string, string[]>): string {
  const q = new URLSearchParams();
  for (const [key, values] of Object.entries(filters)) for (const v of values) q.append(key, v);
  return `/bugs?${q.toString()}`;
}

/**
 * The shared overview - defect load across everything the viewer can see.
 *
 * Kept as its own tab rather than deleted when the role dashboards landed: the
 * severity x category matrix and the component breakdown answer a question no
 * role board does ("where is the load, across the whole product"), and a lead
 * reads it regardless of which role they hold.
 */
function OverviewPanel() {
  // Read early: the REOPENED gate below needs it before `meta` is declared.
  const { data: metaForGate } = useMeta();
  const { data: stats, isLoading, isError, error } = useBugStats();
  const { data: recentData, isLoading: recentLoading } = useBugs({
    limit: RECENT_LIMIT,
    offset: 0,
    sortBy: 'last_change_time',
    sortDir: 'desc',
  });
  const recent = recentData?.bugs ?? [];

  /*
   * Reopened: a fix that did not hold. Counted and listed on their own because they are the
   * bugs a lead most needs to see - each one is work that was believed finished.
   */
  /*
   * Gated on the instance actually defining REOPENED.
   *
   * Bugzilla drops a `bug_status` it does not recognise rather than matching
   * nothing, so on an instance without the status this counted EVERY bug the
   * viewer could see and presented it as "fixes that did not hold".
   */
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

  /*
   * Open vs closed straight from Bugzilla's workflow (is_open per status), so the Open tile's list
   * includes REOPENED - and any status added later - exactly as the count does.
   */
  const { data: meta } = useMeta();
  const workflow = meta?.workflow ?? [];
  const openStatuses = workflow.length ? workflow.filter((w) => w.isOpen).map((w) => w.status) : ['UNCONFIRMED', 'CONFIRMED', 'PENDING_APPROVAL', 'AWAITING_REQUIREMENT', 'IN_PROGRESS', 'IN_REVIEW', 'REOPENED'];
  const closedStatuses = workflow.length ? workflow.filter((w) => !w.isOpen).map((w) => w.status) : ['RESOLVED', 'VERIFIED'];
  const reopenedTotal = reopenedCount?.counts.total;

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
          {/* Every tile opens the list it counts, filtered the same way, so the number and the list agree. */}
          <StatCard icon={BugIcon} label="Total bugs" value={stats.total} tone="brand" to="/bugs" />
          <StatCard icon={CircleDot} label="Open" value={stats.open} tone="amber" to={listUrl({ status: openStatuses })} />
          <StatCard icon={CheckCircle2} label="Resolved" value={stats.resolved} tone="emerald" to={listUrl({ status: closedStatuses })} />
          <StatCard
            icon={AlertOctagon}
            label="Critical (P0) open"
            value={loadBySeverity?.Critical ?? 0}
            tone="rose"
            to={listUrl({ severity: ['Critical'], status: openStatuses })}
          />
          {/*
            Always shown, unlike the role boards' per-user versions: Overview
            reports the whole accessible scope, so this is every reopened bug
            across the products you can see.
            
            Safe to render even where the status does not exist, now that the
            BFF answers an unknown `bug_status` with an empty result instead of
            letting Bugzilla drop the filter and return everything. The hint
            carries the reason for a zero, which is more useful than the tile
            quietly disappearing.
          */}
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
          <CardBody>{isLoading || !stats ? <ChartSkeleton /> : <BarListChart title="" items={categoryItems} />}</CardBody>
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
            <p className="mt-0.5 text-xs text-slate-600">Marked resolved, re-tested, and still failing - newest first.</p>
          </div>
          {(reopenedTotal ?? 0) > 0 && (
            <Link to="/bugs?status=REOPENED" className="focus-ring rounded text-sm font-medium text-brand-800 hover:underline">
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
              <Link key={bug.id} to={`/bugs/${bug.id}`} className="focus-ring flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                <span className="w-20 shrink-0 font-mono text-xs text-slate-600">{bugDisplayId(bug)}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900" title={bug.summary}>
                  {bug.summary}
                </span>
                <span className="hidden w-40 shrink-0 truncate text-xs text-slate-600 md:block" title={bug.assignedTo?.email}>
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
          className="focus-ring mt-6 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-violet-50/90 to-white/60 px-5 py-3.5 text-sm text-violet-900 shadow-glass ring-1 ring-inset ring-violet-700/15 backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:shadow-float"
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

/**
 * The dashboard, routed by role.
 *
 * The view is DERIVED from the permissions the BFF already returns (see
 * lib/useRole.ts), so it cannot claim a role the server would disagree with.
 * Accounts that can open more than one view get a tab rail; everyone else sees
 * their own board with no chrome suggesting there is something they are missing.
 *
 * Every panel calls the same guarded endpoints as before. Switching view is a
 * presentation choice, never a privilege - the admin board rendered without
 * `editusers` simply shows an empty access matrix.
 */
export function Dashboard() {
  const { view, setView, allowed } = useDashboardView();
  const { data } = useMe();
  const email = data?.user.email ?? '';

  /*
   * Admins and testers can look at any developer's board, not just their own -
   * theirs is usually empty, because bugs are assigned to developers. Kept in
   * the URL (?dev=email) so a refresh or a shared link shows the same person.
   * Developers only ever see their own board, and the server scopes their data
   * the same way regardless.
   */
  const canPickDeveloper = allowed.includes('qa') || allowed.includes('admin');
  const [params, setParams] = useSearchParams();
  const devEmail = canPickDeveloper ? (params.get('dev') ?? '') : '';
  // Same cached request the picker makes, so a name survives a refresh of ?dev=.
  const { data: people } = useAssignableUsers();
  const devName = people?.users.find((u) => u.email.toLowerCase() === devEmail.toLowerCase())?.name ?? '';
  /*
   * Admins can narrow the QA board to one reporter (?reporter=email), on the
   * same terms as the developer picker above.
   */
  const canPickReporter = allowed.includes('admin');
  /*
   * Testers who are not admins only ever see the bugs THEY reported on the QA
   * board; the team-wide picture stays on the Overview tab.
   */
  const reporterEmail = canPickReporter ? (params.get('reporter') ?? '') : email;
  const pickReporter = (next: string) => {
    setParams(
      (p) => {
        if (next) p.set('reporter', next);
        else p.delete('reporter');
        return p;
      },
      { replace: true }
    );
  };

  const pickDeveloper = (next: string) => {
    setParams(
      (p) => {
        if (next) p.set('dev', next);
        else p.delete('dev');
        return p;
      },
      { replace: true }
    );
  };

  const tabs: Array<{ id: DashboardView | 'overview'; label: string }> = [
    ...allowed.map((v) => ({ id: v, label: VIEW_LABELS[v] })),
    { id: 'overview' as const, label: 'Overview' },
  ];

  const [tab, setTab] = useState<DashboardView | 'overview'>(view);

  // Follow the derived role if it changes underneath us (permissions reloaded).
  useEffect(() => {
    setTab((current) => (current === 'overview' || allowed.includes(current as DashboardView) ? current : view));
  }, [view, allowed]);

  const select = (next: string) => {
    const id = next as DashboardView | 'overview';
    setTab(id);
    // "Overview" is not a role, so it is not persisted as one.
    if (id !== 'overview') setView(id);
  };

  return (
    <div className="mx-auto max-w-[128rem] animate-page-in px-4 py-6 sm:px-6 lg:px-8 2xl:px-10">
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        description={
          tab === 'developer' && devEmail
            ? `What is assigned to ${devName || devEmail}, worst first.`
            : tab === 'developer' && canPickDeveloper
              ? 'What is assigned across all developers, worst first.'
            : tab === 'qa' && !canPickReporter
              ? 'The bugs you reported, the triage queue, and filing.'
              : DESCRIPTIONS[tab]
        }
      />

      {/* A single available view needs no rail - it would be a tab group of one. */}
      {tabs.length > 2 ? (
        <Tabs value={tab} onValueChange={select}>
          <TabsList className="mb-5">
            {tabs.map((t) => (
              <TabsTrigger key={t.id} value={t.id}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {allowed.includes('qa') && (
            <TabsContent value="qa">
              {canPickReporter && <ReporterPicker value={reporterEmail} onChange={pickReporter} />}
              {/* Keyed by reporter so lists and dialogs reset on a switch. */}
              {/* Wait for the signed-in email, or a tester would briefly see everyone's bugs. */}
              {(canPickReporter || email) && (
                <QaDashboard key={reporterEmail || 'everyone'} reporter={reporterEmail || undefined} mine={!canPickReporter} />
              )}
            </TabsContent>
          )}
          {allowed.includes('developer') && (
            <TabsContent value="developer">
              {canPickDeveloper && <DeveloperPicker value={devEmail} onChange={pickDeveloper} />}
              {/*
                Keyed by person so the selected bug and list state reset on a switch.
                Admins and testers open on the whole team; a developer sees only their own.
              */}
              <DeveloperDashboard
                key={canPickDeveloper ? devEmail || 'all' : email}
                email={canPickDeveloper ? devEmail : email}
                all={canPickDeveloper && !devEmail}
                name={devEmail ? devName || devEmail : undefined}
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
        // A reporter's single view: their own reported bugs (no rail, no picker).
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
