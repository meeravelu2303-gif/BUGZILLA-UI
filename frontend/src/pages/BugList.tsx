import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBugs, useMeta, useProducts } from '../api/hooks';
import { BugTable } from '../components/bugs/BugTable';
import { FilterBar, isComponentInProduct, type Filters } from '../components/bugs/FilterBar';
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
    component: params.get('component') ?? '',
    status: params.get('status') ?? '',
    severity: params.get('severity') ?? '',
    priority: params.get('priority') ?? '',
    tier: params.get('tier') ?? '',
  };

  // These come from Advanced Search via the URL; they have no FilterBar control
  // but are still applied to the query so a saved/linked search stays accurate.
  const assignedTo = params.get('assignedTo') ?? '';
  const creator = params.get('creator') ?? '';

  // Triage order by default: tier first (tier 1 is "product broken or data
  // exposed"), then severity, then priority, so the most important work surfaces
  // without anyone having to sort for it. The backend appends a newest-first
  // tiebreaker, so bugs of equal importance still read most-recent-first.
  const sortBy = params.get('sortBy') ?? 'importance';
  const sortDir = (params.get('sortDir') as 'asc' | 'desc') ?? 'asc';
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
    if ('product' in patch) {
      // Components are product-scoped, so a switch can strand the current
      // component on a product that doesn't have it - drop it rather than
      // leave an invalid filter silently applied.
      const nextProduct = patch.product ?? '';
      const keepComponent = isComponentInProduct(productsData?.products, filters.component, nextProduct);
      updateParams({ ...patch, component: keepComponent ? filters.component : '', offset: 0 });
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
      component: filters.component || undefined,
      status: filters.status || undefined,
      severity: filters.severity || undefined,
      priority: filters.priority || undefined,
      // Tier has no Bugzilla field of its own - it lives in the Status Whiteboard
      // as `[tier1]`, and Bugzilla matches that param as a substring.
      whiteboard: filters.tier ? `tier${filters.tier}` : undefined,
      assignedTo: assignedTo || undefined,
      creator: creator || undefined,
      search: filters.search || undefined,
      sortBy,
      sortDir,
    }),
    [offset, filters.product, filters.component, filters.status, filters.severity, filters.priority, filters.tier, assignedTo, creator, filters.search, sortBy, sortDir]
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

      {(assignedTo || creator) && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Active filters:</span>
          {([
            ['assignedTo', 'Assignee', assignedTo],
            ['creator', 'Reporter', creator],
          ] as const)
            .filter(([, , value]) => value)
            .map(([key, label, value]) => (
              <button
                key={key}
                onClick={() => updateParams({ [key]: '', offset: 0 })}
                className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-800 ring-1 ring-inset ring-brand-500/20 hover:bg-brand-100"
              >
                {label}: <span className="font-semibold">{value}</span>
                <span aria-hidden>×</span>
                <span className="sr-only">Remove {label} filter</span>
              </button>
            ))}
        </div>
      )}

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
