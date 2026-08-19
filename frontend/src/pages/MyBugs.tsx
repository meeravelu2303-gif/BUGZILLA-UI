import { Eye, PencilLine, UserCircle2 } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBugCounts, useBugStats, useBugs, useMe, useMeta, useProducts } from '../api/hooks';
import { BugTable } from '../components/bugs/BugTable';
import { FilterBar } from '../components/bugs/FilterBar';
import { Pagination } from '../components/bugs/Pagination';
import { Card } from '../components/ui/Card';
import { cn } from '../lib/utils';
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
  const controller = useBugFilters({ sortBy: 'importance', sortDir: 'asc' });
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
  const { data: stats } = useBugStats();

  function setTab(next: TabId) {
    const p = new URLSearchParams(params);
    p.set('tab', next);
    p.delete('offset');
    setParams(p, { replace: true });
  }

  return (
    <div className="mx-auto max-w-[1600px] px-8 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">My Bugs</h1>
        <p className="mt-1 text-sm text-slate-600">Everything that lands on your desk — assigned, reported, or watched.</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={cn(
              'focus-ring inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors',
              tab === id ? 'bg-brand-700 text-white' : 'bg-white/70 text-slate-700 hover:bg-white'
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
            {tab === id && tabTotal && <span className="font-mono text-xs opacity-90">{tabTotal.counts.total}</span>}
          </button>
        ))}
      </div>

      <Card>
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
          <BugTable bugs={data?.bugs ?? []} isLoading={isLoading} sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
        </div>
        {data && (data.bugs.length > 0 || offset > 0) && (
          <Pagination
            offset={offset}
            hasMore={data.pageInfo.hasMore}
            count={data.bugs.length}
            onPrev={() => setOffset(Math.max(0, offset - LIMIT))}
            onNext={() => setOffset(offset + LIMIT)}
          />
        )}
      </Card>
    </div>
  );
}
