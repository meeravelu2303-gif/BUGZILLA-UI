import { useEffect, useMemo, useState } from 'react';
import { useBugCounts, useBugs, useMe, useMeta, useProducts } from '../api/hooks';
import { BugTable } from '../components/bugs/BugTable';
import { BulkReassignBar } from '../components/bugs/BulkReassignBar';
import { ExportButton } from '../components/bugs/ExportButton';
import { FilterBar } from '../components/bugs/FilterBar';
import { Pagination } from '../components/bugs/Pagination';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { useBrowserScope } from '../lib/useBrowserScope';
import { useFacetStats } from '../lib/useFacetStats';
import { useBugFilters } from '../lib/useBugFilters';
import type { Bug } from '../types';
import { AlertCircle, ArrowLeft, ListChecks, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';

const LIMIT = 20;

export function BugList() {
  const { data: meta } = useMeta();
  const { data: productsData } = useProducts();
  const { data: me } = useMe();

  const controller = useBugFilters({ sortBy: 'id', sortDir: 'asc' });
  const {
    filters,
    queryParams,
    sortBy,
    sortDir,
    toggleSort,
    offset,
    setOffset,
    isFiltered,
    showDeleted,
    setShowDeleted,
  } = controller;

  const query = useMemo(
    () => ({ ...queryParams, limit: LIMIT, offset, sortBy, sortDir }),
    [queryParams, offset, sortBy, sortDir],
  );

  const { data, isLoading, isFetching, isError, error } = useBugs(query);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  useEffect(() => setSelectedIds(new Set()), [offset, sortBy, sortDir, queryParams]);

  const reassignProduct = useMemo(() => {
    const products = [
      ...new Set((data?.bugs ?? []).filter((bug) => selectedIds.has(bug.id)).map((bug) => bug.product)),
    ];
    if (products.length > 0) return products;
    return filters.product.length > 0 ? filters.product : undefined;
  }, [data, selectedIds, filters.product]);

  const canTriage = me?.user.permissions.canTriage ?? false;
  const canReassignAny = me?.user.permissions.canReassignAny ?? canTriage;
  const myEmail = (me?.user.email ?? '').toLowerCase();

  const selectReason = (bug: Bug): string | undefined => {
    if (canTriage) return undefined;
    if (!bug.isOpen) return `${bug.status} bugs can't be reassigned — reopen it first.`;
    if (!canReassignAny && (bug.assignedTo?.email ?? '').toLowerCase() !== myEmail) {
      return `Assigned to ${bug.assignedTo?.name ?? 'someone else'} — only the assignee or a tester can reassign it.`;
    }
    return undefined;
  };
  const canSelect = (bug: Bug) => selectReason(bug) === undefined;

  const pageIds = data?.bugs.filter(canSelect).map((bug) => bug.id) ?? [];
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const toggle = (id: number) =>
    setSelectedIds((previous) => {
      const next = new Set(previous);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (allOnPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  const { data: filteredCount } = useBugCounts(queryParams);
  const { data: totalCount } = useBugCounts(showDeleted ? { deleted: 'only' } : {});
  const stats = useFacetStats({}, queryParams);
  const { hasBrowsers } = useBrowserScope(filters, stats.for('browser'));

  return (
    <div className="mx-auto max-w-[128rem] animate-page-in px-4 py-6 sm:px-6 lg:px-8 2xl:px-10">
      <PageHeader
        icon={showDeleted ? Trash2 : ListChecks}
        title={showDeleted ? 'Deleted bugs' : 'Bugs'}
        description={
          showDeleted
            ? 'Soft-deleted bugs, hidden from everyone else. Select any to restore them exactly as they were.'
            : 'Browse, filter and triage every defect across your products.'
        }
        actions={
          <>
            {canTriage && (
              <button
                type="button"
                onClick={() => setShowDeleted(!showDeleted)}
                aria-pressed={showDeleted}
                className={
                  showDeleted
                    ? 'focus-ring inline-flex h-10 items-center gap-1.5 rounded-full bg-rose-50 px-4 text-sm font-semibold text-rose-700 ring-1 ring-inset ring-rose-200 transition-colors hover:bg-rose-100'
                    : 'focus-ring inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-slate-600 transition-colors hover:bg-white/70 hover:text-slate-900'
                }
              >
                {showDeleted ? (
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                ) : (
                  <Trash2 className="h-4 w-4" aria-hidden />
                )}
                {showDeleted ? 'Back to bugs' : 'Deleted bugs'}
              </button>
            )}
            <ExportButton params={{ ...queryParams, sortBy, sortDir }} count={filteredCount?.counts.total} />
          </>
        }
      />

      <Card variant="solid">
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
                selection={{
                  selectedIds,
                  onToggle: toggle,
                  onToggleAll: toggleAll,
                  allOnPageSelected,
                  canSelect,
                  selectReason,
                }}
                showBrowserColumn={hasBrowsers}
              />
            </div>
            <BulkReassignBar
              selectedIds={selectedIds}
              onDone={() => setSelectedIds(new Set())}
              product={reassignProduct}
              canTriage={canTriage}
              deletedView={showDeleted}
              closedSelected={(data?.bugs ?? []).filter((bug) => selectedIds.has(bug.id) && !bug.isOpen).length}
            />
            {data && (data.bugs.length > 0 || offset > 0) && (
              <Pagination
                offset={offset}
                hasMore={data.pageInfo.hasMore}
                count={data.bugs.length}
                total={filteredCount?.counts.total}
                onPrevious={() => setOffset(Math.max(0, offset - LIMIT))}
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
