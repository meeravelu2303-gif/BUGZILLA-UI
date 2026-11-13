import { Eye, PencilLine, UserCircle2 } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBugCounts, useBugs, useMe, useMeta, useProducts } from '../api/hooks';
import { BugTable } from '../components/bugs/BugTable';
import { ExportButton } from '../components/bugs/ExportButton';
import { FilterBar } from '../components/bugs/FilterBar';
import { Pagination } from '../components/bugs/Pagination';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { cn } from '../lib/utils';
import { useBrowserScope } from '../lib/useBrowserScope';
import { useFacetStats } from '../lib/useFacetStats';
import { useBugFilters } from '../lib/useBugFilters';

const LIMIT = 20;

type TabId = 'assigned' | 'reported' | 'cc';

const TABS: { id: TabId; label: string; icon: typeof UserCircle2 }[] = [
  { id: 'assigned', label: 'Assigned to me', icon: UserCircle2 },
  { id: 'reported', label: 'Reported by me', icon: PencilLine },
  { id: 'cc', label: "I'm on CC", icon: Eye },
];

export function MyBugs() {
  const { data: me } = useMe();
  const { data: meta } = useMeta();
  const { data: productsData } = useProducts();
  const [params, setParams] = useSearchParams();

  const tab = (params.get('tab') as TabId) ?? 'assigned';
  const email = me?.user.email ?? '';

  const controller = useBugFilters({ sortBy: 'id', sortDir: 'asc' });
  const { queryParams, sortBy, sortDir, toggleSort, offset, setOffset } = controller;

  const scope = useMemo(
    () => (tab === 'assigned' ? { assignedTo: email } : tab === 'reported' ? { creator: email } : { cc: email }),
    [tab, email],
  );

  const scoped = useMemo(() => ({ ...queryParams, ...scope }), [queryParams, scope]);
  const query = useMemo(
    () => ({ ...scoped, limit: LIMIT, offset, sortBy, sortDir }),
    [scoped, offset, sortBy, sortDir],
  );

  const { data, isLoading, isFetching } = useBugs(query);
  const { data: scopedCount } = useBugCounts(scoped);
  const { data: tabTotal } = useBugCounts(scope);
  const stats = useFacetStats(scope, queryParams);
  const { hasBrowsers } = useBrowserScope(controller.filters, stats.for('browser'));

  function setTab(next: TabId) {
    const searchParams = new URLSearchParams(params);
    searchParams.set('tab', next);
    searchParams.delete('offset');
    setParams(searchParams, { replace: true });
  }

  return (
    <div className="mx-auto max-w-[128rem] animate-page-in px-4 py-6 sm:px-6 lg:px-8 2xl:px-10">
      <PageHeader
        back={{ to: '/', label: 'Back to dashboard' }}
        icon={UserCircle2}
        title="My Bugs"
        description="Everything that lands on your desk — assigned, reported, or watched."
        actions={<ExportButton params={{ ...scoped, sortBy, sortDir }} count={scopedCount?.counts.total} />}
      />

      <div className="mb-4 inline-flex flex-wrap gap-1 rounded-full bg-white/55 p-1 shadow-card ring-1 ring-inset ring-white/70 backdrop-blur-xl">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={cn(
              'focus-ring inline-flex h-9 items-center gap-2 rounded-full px-4 text-[0.8667rem] font-semibold transition-all',
              tab === id
                ? 'bg-gradient-to-b from-brand-600 to-brand-800 text-white shadow-glow ring-1 ring-inset ring-white/20'
                : 'text-slate-600 hover:bg-white/80 hover:text-slate-900',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
            {tab === id && tabTotal && (
              <span className="rounded-full bg-white/20 px-1.5 text-[0.7333rem] font-semibold tabular-nums">
                {tabTotal.counts.total}
              </span>
            )}
          </button>
        ))}
      </div>

      <Card variant="solid">
        <FilterBar
          controller={controller}
          meta={meta}
          products={productsData?.products}
          stats={stats}
          resultCount={scopedCount?.counts.total}
          totalCount={tabTotal?.counts.total}
          isLoading={isLoading}
        />
        <div className={isFetching && !isLoading ? 'opacity-60 transition-opacity' : undefined}>
          <BugTable
            bugs={data?.bugs ?? []}
            isLoading={isLoading}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={toggleSort}
            showBrowserColumn={hasBrowsers}
          />
        </div>
        {data && (data.bugs.length > 0 || offset > 0) && (
          <Pagination
            offset={offset}
            hasMore={data.pageInfo.hasMore}
            count={data.bugs.length}
            total={scopedCount?.counts.total}
            onPrevious={() => setOffset(Math.max(0, offset - LIMIT))}
            onNext={() => setOffset(offset + LIMIT)}
          />
        )}
      </Card>
    </div>
  );
}
