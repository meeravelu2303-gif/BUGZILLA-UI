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

  /*
   * The same filter controller and URL contract as the bug list - MyBugs is the
   * same table with one extra scoping clause, not a second implementation.
   */
  const controller = useBugFilters({ sortBy: 'id', sortDir: 'asc' });
  const { queryParams, sortBy, sortDir, toggleSort, offset, setOffset } = controller;

  /** The tab is a scope, not a filter, so it is applied on top of the shared params. */
  const scope = useMemo(
    () => (tab === 'assigned' ? { assignedTo: email } : tab === 'reported' ? { creator: email } : { cc: email }),
    [tab, email]
  );

  const scoped = useMemo(() => ({ ...queryParams, ...scope }), [queryParams, scope]);
  const query = useMemo(() => ({ ...scoped, limit: LIMIT, offset, sortBy, sortDir }), [scoped, offset, sortBy, sortDir]);

  const { data, isLoading, isFetching } = useBugs(query);
  const { data: scopedCount } = useBugCounts(scoped);
  const { data: tabTotal } = useBugCounts(scope);
  /*
   * Facet counts under the filters that are actually applied, tab scope included.
   *
   * This used to pass only `{ ...scope, product }`, which meant a status filter
   * never reached the breakdown: narrowing to CONFIRMED left the Category
   * dropdown reading "Functional 628" above a table holding 92 rows. See
   * lib/useFacetStats.ts for why each facet still excludes its OWN selection.
   */
  const stats = useFacetStats(scope, queryParams);
  // Shared with FilterBar so the Browser column and its filter agree.
  const { hasBrowsers } = useBrowserScope(controller.filters, stats.for('browser'));

  function setTab(next: TabId) {
    const p = new URLSearchParams(params);
    p.set('tab', next);
    p.delete('offset');
    setParams(p, { replace: true });
  }

  return (
    <div className="mx-auto max-w-[1600px] animate-page-in px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        icon={UserCircle2}
        title="My Bugs"
        description="Everything that lands on your desk — assigned, reported, or watched."
        /* `scoped` carries the active tab (assigned / reported / CC), so the sheet matches it. */
        actions={<ExportButton params={{ ...scoped, sortBy, sortDir }} count={scopedCount?.counts.total} />}
      />

      {/* A segmented control: one glass track, the active tab lifted out of it. */}
      <div className="mb-4 inline-flex flex-wrap gap-1 rounded-full bg-white/55 p-1 shadow-card ring-1 ring-inset ring-white/70 backdrop-blur-xl">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={cn(
              'focus-ring inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-semibold transition-all',
              tab === id
                ? 'bg-gradient-to-b from-brand-600 to-brand-800 text-white shadow-glow ring-1 ring-inset ring-white/20'
                : 'text-slate-600 hover:bg-white/80 hover:text-slate-900'
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
            {tab === id && tabTotal && (
              <span className="rounded-full bg-white/20 px-1.5 text-[11px] font-semibold tabular-nums">{tabTotal.counts.total}</span>
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
            // Count for the CURRENT filters, so Next is never offered past the end of a
            // narrowed result set.
            total={scopedCount?.counts.total}
            onPrev={() => setOffset(Math.max(0, offset - LIMIT))}
            onNext={() => setOffset(offset + LIMIT)}
          />
        )}
      </Card>
    </div>
  );
}
