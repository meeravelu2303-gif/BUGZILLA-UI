import { useEffect, useMemo, useState } from 'react';
import { useBugCounts, useBugStats, useBugs, useMeta, useProducts } from '../api/hooks';
import { BugTable } from '../components/bugs/BugTable';
import { BulkReassignBar } from '../components/bugs/BulkReassignBar';
import { FilterBar } from '../components/bugs/FilterBar';
import { Pagination } from '../components/bugs/Pagination';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { useBugFilters } from '../lib/useBugFilters';
import { AlertCircle } from 'lucide-react';

const LIMIT = 20;

export function BugList() {
  const { data: meta } = useMeta();
  const { data: productsData } = useProducts();

  /*
   * Filters, sort and pagination all live in the URL via one shared controller,
   * so this view is shareable and survives reload and back/forward. The default
   * sort is triage order (severity, then priority) rather than newest-first: the
   * most important work should be on top without asking.
   */
  const controller = useBugFilters({ sortBy: 'importance', sortDir: 'asc' });
  const { queryParams, sortBy, sortDir, toggleSort, offset, setOffset, isFiltered } = controller;

  const query = useMemo(
    () => ({ ...queryParams, limit: LIMIT, offset, sortBy, sortDir }),
    [queryParams, offset, sortBy, sortDir]
  );

  const { data, isLoading, isFetching, isError, error } = useBugs(query);

  // Bulk selection lives here (the table only renders it). It is cleared whenever the visible
  // set changes — a new page or filter — so you never act on rows you can no longer see.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  useEffect(() => setSelectedIds(new Set()), [offset, sortBy, sortDir, queryParams]);

  const pageIds = data?.bugs.map((b) => b.id) ?? [];
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const toggle = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  // The exact size of the filtered set, and of the whole product, so the bar can
  // say how much is hidden rather than leaving the user to infer it.
  const { data: filteredCount } = useBugCounts(queryParams);
  const { data: totalCount } = useBugCounts({});
  const { data: stats } = useBugStats();

  return (
    <div className="mx-auto max-w-[1600px] px-8 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Bugs</h1>
        <p className="mt-1 text-sm text-slate-600">Browse, filter and triage every defect across your products.</p>
      </div>

      <Card>
        <FilterBar
          controller={controller}
          meta={meta}
          products={productsData?.products}
          stats={stats}
          resultCount={filteredCount?.counts.total}
          totalCount={totalCount?.counts.total}
          isLoading={isLoading}
        />

        {isError ? (
          <EmptyState
            icon={AlertCircle}
            title="Couldn't load bugs"
            description={error instanceof Error ? error.message : 'Something went wrong talking to Bugzilla.'}
          />
        ) : (
          <>
            <div className={isFetching && !isLoading ? 'opacity-60 transition-opacity' : undefined}>
              <BugTable
                bugs={data?.bugs ?? []}
                isLoading={isLoading}
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={toggleSort}
                selection={{ selectedIds, onToggle: toggle, onToggleAll: toggleAll, allOnPageSelected }}
              />
            </div>
            <BulkReassignBar selectedIds={selectedIds} onDone={() => setSelectedIds(new Set())} />
            {data && (data.bugs.length > 0 || offset > 0) && (
              <Pagination
                offset={offset}
                hasMore={data.pageInfo.hasMore}
                count={data.bugs.length}
                onPrev={() => setOffset(Math.max(0, offset - LIMIT))}
                onNext={() => setOffset(offset + LIMIT)}
              />
            )}
          </>
        )}
      </Card>

      {isFiltered && (
        <p className="mt-3 text-xs text-slate-600">
          Filters are shared through the URL — copy the address bar to send this exact view to someone else.
        </p>
      )}
    </div>
  );
}
