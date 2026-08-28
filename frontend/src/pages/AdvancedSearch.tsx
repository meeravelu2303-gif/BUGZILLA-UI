import { RotateCcw } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBugCounts, useBugStats, useBugs, useMeta, useProducts } from '../api/hooks';
import { BugTable } from '../components/bugs/BugTable';
import { FilterBar } from '../components/bugs/FilterBar';
import { Pagination } from '../components/bugs/Pagination';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { Input } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { useBrowserScope } from '../lib/useBrowserScope';
import { useBugFilters } from '../lib/useBugFilters';

const LIMIT = 20;

/**
 * Advanced Search is the same list, the same filter bar and the same URL
 * contract as /bugs - it just adds the person-scoped fields that do not belong
 * in the main facet row. Deliberately not a second filter implementation: two
 * would drift from each other and from the API.
 */
export function AdvancedSearch() {
  const { data: meta } = useMeta();
  const { data: productsData } = useProducts();
  const [params, setParams] = useSearchParams();

  const controller = useBugFilters({ sortBy: 'importance', sortDir: 'asc' });
  const { queryParams, sortBy, sortDir, toggleSort, offset, setOffset, clearAll } = controller;

  const assignedTo = params.get('assignedTo') ?? '';
  const creator = params.get('creator') ?? '';

  function setPerson(key: 'assignedTo' | 'creator', value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('offset');
    setParams(next, { replace: true });
  }

  const scoped = useMemo(() => {
    const out = { ...queryParams };
    if (assignedTo) out.assignedTo = assignedTo;
    if (creator) out.creator = creator;
    return out;
  }, [queryParams, assignedTo, creator]);

  const query = useMemo(() => ({ ...scoped, limit: LIMIT, offset, sortBy, sortDir }), [scoped, offset, sortBy, sortDir]);

  const { data, isLoading, isFetching } = useBugs(query);
  const { data: scopedCount } = useBugCounts(scoped);
  const { data: totalCount } = useBugCounts({});
  const { data: stats } = useBugStats();
  // Shared with FilterBar so the Browser column and its filter agree.
  const { hasBrowsers } = useBrowserScope(controller.filters, stats);

  function resetAll() {
    clearAll();
    const next = new URLSearchParams();
    setParams(next, { replace: true });
  }

  return (
    <div className="mx-auto max-w-[1600px] px-8 py-8">
      <PageHeader title="Advanced Search" description="Every axis at once — the resulting URL is the shareable query." />

      <Card className="mt-6">
        <CardBody>
          <div className="flex flex-wrap items-end gap-3">
            <Input
              label="Assignee"
              placeholder="name@example.com"
              defaultValue={assignedTo}
              onBlur={(e) => setPerson('assignedTo', e.target.value.trim())}
              className="w-64"
            />
            <Input
              label="Reporter"
              placeholder="name@example.com"
              defaultValue={creator}
              onBlur={(e) => setPerson('creator', e.target.value.trim())}
              className="w-64"
            />
            <Button variant="ghost" onClick={resetAll} className="mb-0.5">
              <RotateCcw className="h-4 w-4" aria-hidden /> Reset everything
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card variant="solid" className="mt-4">
        <FilterBar
          controller={controller}
          meta={meta}
          products={productsData?.products}
          stats={stats}
          resultCount={scopedCount?.counts.total}
          totalCount={totalCount?.counts.total}
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
