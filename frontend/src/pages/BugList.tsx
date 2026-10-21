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
  // Needed early: the selection rules below depend on who is signed in.
  const { data: me } = useMe();

  /*
   * Filters, sort and pagination all live in the URL via one shared controller,
   * so this view is shareable and survives reload and back/forward. The default
   * sort is triage order (severity, then priority) rather than newest-first: the
   * most important work should be on top without asking.
   */
  const controller = useBugFilters({ sortBy: 'id', sortDir: 'asc' });
  const { filters, queryParams, sortBy, sortDir, toggleSort, offset, setOffset, isFiltered, showDeleted, setShowDeleted } = controller;

  const query = useMemo(
    () => ({ ...queryParams, limit: LIMIT, offset, sortBy, sortDir }),
    [queryParams, offset, sortBy, sortDir]
  );

  const { data, isLoading, isFetching, isError, error } = useBugs(query);

  // Bulk selection lives here (the table only renders it). It is cleared whenever the visible
  // set changes — a new page or filter — so you never act on rows you can no longer see.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  useEffect(() => setSelectedIds(new Set()), [offset, sortBy, sortDir, queryParams]);

  /*
   * Which product's team may receive this batch.
   *
   * Read from the SELECTED BUGS, not from the product filter. The filter is the
   * wrong source: an unfiltered list is still overwhelmingly one product's bugs,
   * and deriving from the filter alone meant the Assignee dropdown fell back to
   * every account on the instance the moment no filter was set - offering the
   * KPost UI team for a KPost API bug, and even accounts in no product group at
   * all, who cannot see the bug they would be handed.
   *
   * A selection spanning two products has no single team, so nothing is passed
   * and the backend returns the unscoped list; picking wrongly there is still
   * possible, but that is a genuinely ambiguous batch rather than a wrong
   * default. The filter remains the fallback for that case.
   */
  const reassignProduct = useMemo(() => {
    const products = [
      ...new Set((data?.bugs ?? []).filter((b) => selectedIds.has(b.id)).map((b) => b.product)),
    ];
    // Every product in the batch, so the backend can intersect: only people who
    // can reach ALL of them may take the whole selection. Returning nothing for
    // a mixed batch (as this did) silently widened the list back to everyone.
    if (products.length > 0) return products;
    return filters.product.length > 0 ? filters.product : undefined;
  }, [data, selectedIds, filters.product]);

  /*
   * Two rules decide whether a row can join a bulk reassignment, and each has
   * its own sentence so the tooltip says which one applied:
   *
   *   1. Closed bugs are never reassignable - the assignee records who fixed it.
   *   2. A bug belongs to its assignee. Only they, or a tester who triages, may
   *      hand it on; a developer cannot reach across and move a colleague's work.
   *
   * The backend enforces both independently (the UI can be bypassed with a
   * direct API call). Disabling here just means the refusal never has to happen.
   */
  const canTriage = me?.user.permissions.canTriage ?? false;
  const myEmail = (me?.user.email ?? '').toLowerCase();

  const selectReason = (bug: Bug): string | undefined => {
    // Testers and admins can select anything: closed bugs can still be deleted
    // or restored, and the bar explains when a selection can't be reassigned.
    if (canTriage) return undefined;
    if (!bug.isOpen) return `${bug.status} bugs can't be reassigned — reopen it first.`;
    if ((bug.assignedTo?.email ?? '').toLowerCase() !== myEmail) {
      return `Assigned to ${bug.assignedTo?.name ?? 'someone else'} — only the assignee or a tester can reassign it.`;
    }
    return undefined;
  };
  const canSelect = (bug: Bug) => selectReason(bug) === undefined;

  const pageIds = data?.bugs.filter(canSelect).map((b) => b.id) ?? [];
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
  // In the deleted view, "of N" means of all deleted bugs, not of the live ones.
  const { data: totalCount } = useBugCounts(showDeleted ? { deleted: 'only' } : {});
  // Scope the facet-count breakdown to the selected product, so every filter shows this
  // product's data only — never another product's severities, categories or components. Only the
  // product facet is folded in (not severity/status/etc.), so picking one facet never collapses
  // the counts shown on the others.
  // Facet counts under every applied filter - see lib/useFacetStats.ts.
  const stats = useFacetStats({}, queryParams);
  // Same answer the FilterBar uses for its Browser control, so the column and
  // the filter for it appear and disappear together.
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
                {showDeleted ? <ArrowLeft className="h-4 w-4" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
                {showDeleted ? 'Back to bugs' : 'Deleted bugs'}
              </button>
            )}
            {/* The table's own filters and sort, minus the page - so the sheet holds every match. */}
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
                selection={{ selectedIds, onToggle: toggle, onToggleAll: toggleAll, allOnPageSelected, canSelect, selectReason }}
                showBrowserColumn={hasBrowsers}
              />
            </div>
            <BulkReassignBar
              selectedIds={selectedIds}
              onDone={() => setSelectedIds(new Set())}
              product={reassignProduct}
              canTriage={canTriage}
              deletedView={showDeleted}
              closedSelected={(data?.bugs ?? []).filter((b) => selectedIds.has(b.id) && !b.isOpen).length}
            />
            {data && (data.bugs.length > 0 || offset > 0) && (
              <Pagination
                offset={offset}
                hasMore={data.pageInfo.hasMore}
                count={data.bugs.length}
                // The count for the CURRENT filters, so Next is never offered past the end of a
                // narrowed result set — the empty-page bug.
                total={filteredCount?.counts.total}
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
