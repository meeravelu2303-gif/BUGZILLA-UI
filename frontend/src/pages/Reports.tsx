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

/** Reports read entirely from GET /api/bugs/stats. */
export function Reports() {
  const { data: stats, isLoading, isError, error } = useBugStats();

  const severityItems: BarListItem[] = SEVERITIES.filter((severity) => (stats?.bySeverity[severity] ?? 0) > 0).map(
    (severity) => ({
      label: severity,
      value: stats?.bySeverity[severity] ?? 0,
      tone: severity === 'Critical' ? 'rose' : severity === 'Major' ? 'orange' : severity === 'Minor' ? 'sky' : 'slate',
    }),
  );

  const categoryItems: BarListItem[] = CATEGORIES.filter((category) => (stats?.byCategory[category] ?? 0) > 0).map(
    (category) => ({
      label: category,
      value: stats?.byCategory[category] ?? 0,
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

  const componentItems: BarListItem[] = Object.entries(stats?.byComponent ?? {})
    .sort((left, right) => right[1] - left[1])
    .slice(0, 12)
    .map(([label, value]) => ({ label, value, tone: 'slate' as const }));

  if (isError) {
    return (
      <div className="mx-auto max-w-[128rem] animate-page-in px-4 py-6 sm:px-6 lg:px-8 2xl:px-10">
        <EmptyState
          icon={AlertCircle}
          title="Couldn't build the report"
          description={error instanceof Error ? error.message : 'Bugzilla did not answer in time.'}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[128rem] animate-page-in px-4 py-6 sm:px-6 lg:px-8 2xl:px-10">
      <PageHeader
        back={{ to: '/', label: 'Back to dashboard' }}
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
                  {SEVERITIES.filter((severity) => (stats.bySeverity[severity] ?? 0) > 0).map((severity) => (
                    <div key={severity} className="flex items-start gap-3">
                      <dt className="shrink-0">
                        <SeverityPill severity={severity as Severity} />
                      </dt>
                      <dd className="text-xs text-slate-600">{SEVERITY_MEANING[severity]}</dd>
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
                  {CATEGORIES.filter((category) => (stats.byCategory[category] ?? 0) > 0).map((category) => (
                    <div key={category} className="flex items-start gap-3">
                      <dt className="shrink-0">
                        <CategoryPill category={category as Category} />
                      </dt>
                      <dd className="text-xs text-slate-600">{CATEGORY_MEANING[category]}</dd>
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
