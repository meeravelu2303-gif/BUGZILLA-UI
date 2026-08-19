import { AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useBugStats } from '../api/hooks';
import { BarListChart, type BarListItem } from '../components/dashboard/BarListChart';
import { SeverityCategoryMatrix } from '../components/dashboard/SeverityCategoryMatrix';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { CategoryPill, SeverityPill } from '../components/ui/Pill';
import { Skeleton } from '../components/ui/Skeleton';
import { CATEGORIES, CATEGORY_MEANING, SEVERITIES, SEVERITY_MEANING, type Category, type Severity } from '../types';

/**
 * Reports read entirely from GET /api/bugs/stats.
 *
 * The previous version tallied a 200-bug sample, which silently understated
 * every number once the product outgrew one page. These counts are computed
 * server-side over the whole product.
 */
export function Reports() {
  const { data: stats, isLoading, isError, error } = useBugStats();

  const severityItems: BarListItem[] = SEVERITIES.filter((s) => (stats?.bySeverity[s] ?? 0) > 0).map((s) => ({
    label: s,
    value: stats?.bySeverity[s] ?? 0,
    tone: s === 'Critical' ? 'rose' : s === 'Major' ? 'orange' : s === 'Minor' ? 'sky' : 'slate',
  }));

  const categoryItems: BarListItem[] = CATEGORIES.filter((c) => (stats?.byCategory[c] ?? 0) > 0).map((c) => ({
    label: c,
    value: stats?.byCategory[c] ?? 0,
    tone: c === 'Security' ? 'violet' : c === 'Functional' ? 'blue' : c === 'Performance' ? 'amber' : 'emerald',
  }));

  const componentItems: BarListItem[] = Object.entries(stats?.byComponent ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([label, value]) => ({ label, value, tone: 'slate' as const }));

  if (isError) {
    return (
      <div className="mx-auto max-w-[1400px] px-8 py-8">
        <EmptyState
          icon={AlertCircle}
          title="Couldn't build the report"
          description={error instanceof Error ? error.message : 'Bugzilla did not answer in time.'}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-8">
      <PageHeader
        title="Reports & Charts"
        description="Defect distribution across the two classification axes, computed over every bug."
      />

      {isLoading || !stats ? (
        <div className="mt-6 flex flex-col gap-6">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Severity distribution</CardTitle>
              </CardHeader>
              <CardBody>
                <BarListChart title="" items={severityItems} />
                <dl className="mt-4 flex flex-col gap-2 border-t border-white/40 pt-3">
                  {SEVERITIES.filter((s) => (stats.bySeverity[s] ?? 0) > 0).map((s) => (
                    <div key={s} className="flex items-start gap-3">
                      <dt className="shrink-0">
                        <SeverityPill severity={s as Severity} />
                      </dt>
                      <dd className="text-xs text-slate-600">{SEVERITY_MEANING[s]}</dd>
                    </div>
                  ))}
                </dl>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Category distribution</CardTitle>
              </CardHeader>
              <CardBody>
                <BarListChart title="" items={categoryItems} />
                <dl className="mt-4 flex flex-col gap-2 border-t border-white/40 pt-3">
                  {CATEGORIES.filter((c) => (stats.byCategory[c] ?? 0) > 0).map((c) => (
                    <div key={c} className="flex items-start gap-3">
                      <dt className="shrink-0">
                        <CategoryPill category={c as Category} />
                      </dt>
                      <dd className="text-xs text-slate-600">{CATEGORY_MEANING[c]}</dd>
                    </div>
                  ))}
                </dl>
              </CardBody>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Severity × category</CardTitle>
              <span className="text-xs text-slate-600">Every cell filters the bug list</span>
            </CardHeader>
            <CardBody>
              <SeverityCategoryMatrix stats={stats} />
            </CardBody>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Defects by component</CardTitle>
              <Link to="/bugs" className="focus-ring rounded text-sm font-medium text-brand-800 hover:underline">
                Open bug list
              </Link>
            </CardHeader>
            <CardBody>
              <BarListChart title="" items={componentItems} />
              {Object.keys(stats.byComponent).length > componentItems.length && (
                <p className="mt-3 text-xs text-slate-600">
                  Showing the top {componentItems.length} of {Object.keys(stats.byComponent).length} components.
                </p>
              )}
            </CardBody>
          </Card>

          <p className="mt-4 text-xs text-slate-500">
            Counts computed over all {stats.total.toLocaleString()} bugs · refreshed{' '}
            {new Date(stats.cachedAt).toLocaleTimeString()}
          </p>
        </>
      )}
    </div>
  );
}
