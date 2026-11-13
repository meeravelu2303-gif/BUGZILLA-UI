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

/** Advanced Search is the same list. */
export function AdvancedSearch() {
  const { data: meta } = useMeta();
  const { data: productsData } = useProducts();
  const [params, setParams] = useSearchParams();

  const controller = useBugFilters({ sortBy: 'id', sortDir: 'asc' });
  const { queryParams, sortBy, sortDir, toggleSort, offset, setOffset, clearAll } = controller;

  const assignedTo = params.get('assignedTo') ?? '';
  const creator = params.get('creator') ?? '';

  const { data: assigneeData, isLoading: assigneesLoading } = useSearchableAssignees();
  const { data: reporterData, isLoading: reportersLoading } = useReporters();
  const assignees = useMemo(
    () => (assigneeData?.users ?? []).slice().sort((left, right) => left.name.localeCompare(right.name)),
    [assigneeData],
  );
  const reporters = useMemo(
    () => (reporterData?.users ?? []).slice().sort((left, right) => left.name.localeCompare(right.name)),
    [reporterData],
  );

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

  const query = useMemo(
    () => ({ ...scoped, limit: LIMIT, offset, sortBy, sortDir }),
    [scoped, offset, sortBy, sortDir],
  );

  const { data, isLoading, isFetching } = useBugs(query);
  const { data: scopedCount } = useBugCounts(scoped);
  const { data: totalCount } = useBugCounts({});
  const stats = useFacetStats({}, scoped);
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
        actions={<ExportButton params={{ ...scoped, sortBy, sortDir }} count={scopedCount?.counts.total} />}
      />

      <Card className="mt-6">
        <CardBody>
          <div className="flex flex-wrap items-end gap-3">
            <Select
              label="Assignee"
              value={assignedTo}
              disabled={assigneesLoading}
              onChange={(event) => setPerson('assignedTo', event.target.value)}
              className="w-72"
            >
              <option value="">Anyone</option>
              {(['developer', 'tester', 'admin', 'reporter'] as const).map((role) => {
                const group = assignees.filter((assignee) => (assignee.role ?? 'developer') === role);
                if (group.length === 0) return null;
                return (
                  <optgroup
                    key={role}
                    label={{ developer: 'Developers', tester: 'Testers', admin: 'Admins', reporter: 'Reporters' }[role]}
                  >
                    {group.map((assignableUser) => (
                      <option key={assignableUser.email} value={assignableUser.email}>
                        {assignableUser.name} ({assignableUser.email})
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
              onChange={(event) => setPerson('creator', event.target.value)}
              className="w-72"
            >
              <option value="">Anyone</option>
              {(['tester', 'reporter', 'developer', 'admin'] as const).map((role) => {
                const group = reporters.filter((reporter) => reporter.role === role);
                if (group.length === 0) return null;
                return (
                  <optgroup
                    key={role}
                    label={
                      {
                        tester: 'Testers',
                        reporter: 'Reporters (office staff)',
                        developer: 'Developers (who have filed bugs)',
                        admin: 'Admins',
                      }[role]
                    }
                  >
                    {group.map((item) => (
                      <option key={item.email} value={item.email}>
                        {item.name} ({item.email})
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
            total={scopedCount?.counts.total}
            onPrevious={() => setOffset(Math.max(0, offset - LIMIT))}
            onNext={() => setOffset(offset + LIMIT)}
          />
        )}
      </Card>
    </div>
  );
}
