import { RotateCcw } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBugCounts, useBugs, useMeta, useProducts, useReporters, useSearchableAssignees } from '../api/hooks';
import { BugTable } from '../components/bugs/BugTable';
import { ExportButton } from '../components/bugs/ExportButton';
import { FilterBar } from '../components/bugs/FilterBar';
import { Pagination } from '../components/bugs/Pagination';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { Select } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { useBrowserScope } from '../lib/useBrowserScope';
import { useFacetStats } from '../lib/useFacetStats';
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

  const controller = useBugFilters({ sortBy: 'id', sortDir: 'asc' });
  const { queryParams, sortBy, sortDir, toggleSort, offset, setOffset, clearAll } = controller;

  const assignedTo = params.get('assignedTo') ?? '';
  const creator = params.get('creator') ?? '';

  // The two person lists, sorted by name. The assignee list is the SEARCH one:
  // everyone who can hold a bug, testers, reporters and yourself included.
  const { data: assigneeData, isLoading: assigneesLoading } = useSearchableAssignees();
  const { data: reporterData, isLoading: reportersLoading } = useReporters();
  const assignees = useMemo(() => (assigneeData?.users ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)), [assigneeData]);
  const reporters = useMemo(() => (reporterData?.users ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)), [reporterData]);

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
  /*
   * Facet counts under every applied filter - see lib/useFacetStats.ts.
   *
   * Built from `scoped`, not from `queryParams`: this page adds assignedTo and
   * creator on top of the shared facets, and a breakdown that omitted them
   * would describe a wider set than the table below it.
   */
  const stats = useFacetStats({}, scoped);
  // Shared with FilterBar so the Browser column and its filter agree.
  const { hasBrowsers } = useBrowserScope(controller.filters, stats.for('browser'));

  function resetAll() {
    clearAll();
    const next = new URLSearchParams();
    setParams(next, { replace: true });
  }

  return (
    <div className="mx-auto max-w-[128rem] animate-page-in px-4 py-6 sm:px-6 lg:px-8 2xl:px-10">
      <PageHeader
        back={{ to: '/', label: 'Back to dashboard' }}
        title="Advanced Search"
        description="Every axis at once — the resulting URL is the shareable query."
        // `scoped` includes the assignee/reporter fields, so the sheet matches the results.
        actions={<ExportButton params={{ ...scoped, sortBy, sortDir }} count={scopedCount?.counts.total} />}
      />

      <Card className="mt-6">
        <CardBody>
          <div className="flex flex-wrap items-end gap-3">
            {/*
              Dropdowns, not free-text email boxes: the people who can hold a
              bug (assignable users, grouped by role) and the people who file
              them (testers and admins) are both known lists, and a typed email
              that is off by a letter silently matched nothing.
            */}
            <Select
              label="Assignee"
              value={assignedTo}
              disabled={assigneesLoading}
              onChange={(e) => setPerson('assignedTo', e.target.value)}
              className="w-72"
            >
              <option value="">Anyone</option>
              {(['developer', 'tester', 'admin', 'reporter'] as const).map((role) => {
                const group = assignees.filter((u) => (u.role ?? 'developer') === role);
                if (group.length === 0) return null;
                return (
                  <optgroup key={role} label={{ developer: 'Developers', tester: 'Testers', admin: 'Admins', reporter: 'Reporters' }[role]}>
                    {group.map((u) => (
                      <option key={u.email} value={u.email}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </Select>
            <Select
              label="Reporter"
              value={creator}
              disabled={reportersLoading}
              onChange={(e) => setPerson('creator', e.target.value)}
              className="w-72"
            >
              <option value="">Anyone</option>
              {(['tester', 'reporter', 'developer', 'admin'] as const).map((role) => {
                const group = reporters.filter((u) => u.role === role);
                if (group.length === 0) return null;
                return (
                  <optgroup
                    key={role}
                    label={{ tester: 'Testers', reporter: 'Reporters (office staff)', developer: 'Developers (who have filed bugs)', admin: 'Admins' }[role]}
                  >
                    {group.map((u) => (
                      <option key={u.email} value={u.email}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </Select>
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
