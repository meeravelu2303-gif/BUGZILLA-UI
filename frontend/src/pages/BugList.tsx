import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBugs, useMeta, useProducts } from '../api/hooks';
import { BugTable } from '../components/bugs/BugTable';
import { FilterBar, type Filters } from '../components/bugs/FilterBar';
import { Pagination } from '../components/bugs/Pagination';
import { Card } from '../components/ui/Card';
import { useDebounce } from '../lib/useDebounce';

const LIMIT = 20;

export function BugList() {
  const [params, setParams] = useSearchParams();
  const { data: meta } = useMeta();
  const { data: productsData } = useProducts();

  const [searchInput, setSearchInput] = useState(params.get('search') ?? '');
  const debouncedSearch = useDebounce(searchInput, 350);

  const filters: Filters = {
    search: debouncedSearch,
    product: params.get('product') ?? '',
    status: params.get('status') ?? '',
    severity: params.get('severity') ?? '',
    priority: params.get('priority') ?? '',
  };

  const sortBy = params.get('sortBy') ?? 'last_change_time';
  const sortDir = (params.get('sortDir') as 'asc' | 'desc') ?? 'desc';
  const offset = Number(params.get('offset') ?? 0);

  function updateParams(patch: Record<string, string | number>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === '' || value === undefined) next.delete(key);
      else next.set(key, String(value));
    }
    setParams(next, { replace: true });
  }

  function onFilterChange(patch: Partial<Filters>) {
    if ('search' in patch) {
      setSearchInput(patch.search ?? '');
      return;
    }
    updateParams({ ...patch, offset: 0 });
  }

  function onSort(key: string) {
    const bzKey = key === 'id' ? 'id' : key;
    if (sortBy === bzKey) {
      updateParams({ sortDir: sortDir === 'asc' ? 'desc' : 'asc' });
    } else {
      updateParams({ sortBy: bzKey, sortDir: 'asc' });
    }
  }

  const query = useMemo(
    () => ({
      limit: LIMIT,
      offset,
      product: filters.product || undefined,
      status: filters.status || undefined,
      severity: filters.severity || undefined,
      priority: filters.priority || undefined,
      search: filters.search || undefined,
      sortBy,
      sortDir,
    }),
    [offset, filters.product, filters.status, filters.severity, filters.priority, filters.search, sortBy, sortDir]
  );

  const { data, isLoading, isFetching } = useBugs(query);

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Bugs</h1>
          <p className="mt-1 text-sm text-slate-600">Browse, filter, and triage every bug across your products.</p>
        </div>
      </div>

      <Card>
        <FilterBar
          filters={{ ...filters, search: searchInput }}
          onChange={onFilterChange}
          meta={meta}
          products={productsData?.products}
        />
        <div className={isFetching && !isLoading ? 'opacity-60 transition-opacity' : ''}>
          <BugTable bugs={data?.bugs ?? []} isLoading={isLoading} sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
        </div>
        {data && (
          <Pagination
            offset={offset}
            hasMore={data.pageInfo.hasMore}
            count={data.bugs.length}
            onPrev={() => updateParams({ offset: Math.max(0, offset - LIMIT) })}
            onNext={() => updateParams({ offset: offset + LIMIT })}
          />
        )}
      </Card>
    </div>
  );
}
