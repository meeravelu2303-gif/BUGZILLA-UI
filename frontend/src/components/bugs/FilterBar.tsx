import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FACET_LABELS, type UseBugFilters } from '../../lib/useBugFilters';
import { useDebounce } from '../../lib/useDebounce';
import { CATEGORIES, PRIORITIES, SEVERITIES, type BugMeta, type BugStats, type Product } from '../../types';
import { MultiSelect, type MultiSelectOption } from '../ui/MultiSelect';

/**
 * The primary control surface for every bug list.
 *
 * One component, one URL contract (lib/useBugFilters.ts) - BugList, MyBugs and
 * AdvancedSearch all mount this rather than each growing their own filters.
 */
export function FilterBar({
  controller,
  meta,
  products,
  stats,
  resultCount,
  totalCount,
  isLoading,
}: {
  controller: UseBugFilters;
  meta?: BugMeta;
  products?: Product[];
  /** Supplies per-value counts, so a facet shows how much it would narrow to. */
  stats?: BugStats;
  resultCount?: number;
  /** Unfiltered total, used to say plainly how much is being hidden. */
  totalCount?: number;
  isLoading?: boolean;
}) {
  const { filters, activeChips, isFiltered, toggleFacet, setFacet, setSearch, removeChip, clearAll } = controller;

  // Typing must not fire a request per keystroke; the URL updates once the user pauses.
  const [searchInput, setSearchInput] = useState(filters.search);
  const debounced = useDebounce(searchInput, 350);
  useEffect(() => {
    if (debounced !== filters.search) setSearch(debounced);
    // `setSearch` is stable per params object; re-running on filters.search would
    // fight the user's typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  useEffect(() => {
    // Keep the box in step when the URL changes from elsewhere (chip removal, back button).
    setSearchInput(filters.search);
  }, [filters.search]);

  const withCounts = (values: readonly string[], counts?: Record<string, number>): MultiSelectOption[] =>
    values.map((v) => ({ value: v, label: v, count: counts?.[v] }));

  const componentOptions: MultiSelectOption[] = Object.entries(stats?.byComponent ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ value: name, label: name, count }));

  const productOptions: MultiSelectOption[] = (products ?? []).map((p) => ({ value: p.name, label: p.name }));
  const statusOptions: MultiSelectOption[] = (meta?.statuses ?? []).map((s) => ({ value: s, label: s.replace('_', ' ') }));

  const hidden = totalCount !== undefined && resultCount !== undefined ? totalCount - resultCount : 0;

  return (
    <div className="border-b border-white/30 px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search summaries…"
            aria-label="Search bug summaries"
            className="focus-ring w-full rounded-xl border border-white/60 bg-white/80 py-2 pl-9 pr-3 text-sm placeholder:text-slate-500 backdrop-blur-sm"
          />
        </div>

        <MultiSelect
          label={FACET_LABELS.severity}
          className="w-40"
          options={withCounts(SEVERITIES, stats?.bySeverity)}
          selected={filters.severity}
          onToggle={(v) => toggleFacet('severity', v)}
          onClear={() => setFacet('severity', [])}
        />
        <MultiSelect
          label={FACET_LABELS.priority}
          className="w-36"
          options={withCounts(PRIORITIES)}
          selected={filters.priority}
          onToggle={(v) => toggleFacet('priority', v)}
          onClear={() => setFacet('priority', [])}
        />
        <MultiSelect
          label={FACET_LABELS.category}
          className="w-44"
          options={withCounts(CATEGORIES, stats?.byCategory)}
          selected={filters.category}
          onToggle={(v) => toggleFacet('category', v)}
          onClear={() => setFacet('category', [])}
        />
        <MultiSelect
          label={FACET_LABELS.component}
          className="w-52"
          options={componentOptions}
          selected={filters.component}
          onToggle={(v) => toggleFacet('component', v)}
          onClear={() => setFacet('component', [])}
        />
        <MultiSelect
          label={FACET_LABELS.status}
          className="w-40"
          options={statusOptions}
          selected={filters.status}
          onToggle={(v) => toggleFacet('status', v)}
          onClear={() => setFacet('status', [])}
        />
        {productOptions.length > 1 && (
          <MultiSelect
            label={FACET_LABELS.product}
            className="w-44"
            options={productOptions}
            selected={filters.product}
            onToggle={(v) => toggleFacet('product', v)}
            onClear={() => setFacet('product', [])}
          />
        )}
      </div>

      {(isFiltered || resultCount !== undefined) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {activeChips.map((chip) => (
            <button
              key={`${chip.key}:${chip.value}`}
              onClick={() => removeChip(chip)}
              className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-800 ring-1 ring-inset ring-brand-600/20 hover:bg-brand-100"
            >
              {chip.label}
              <X className="h-3 w-3" aria-hidden />
              <span className="sr-only">Remove filter {chip.label}</span>
            </button>
          ))}

          {isFiltered && (
            <button onClick={clearAll} className="focus-ring rounded px-1 text-xs font-medium text-slate-700 underline hover:text-slate-900">
              Clear all
            </button>
          )}

          <span aria-live="polite" className="ml-auto text-xs text-slate-600">
            {isLoading ? (
              'Loading…'
            ) : resultCount === undefined ? null : (
              <>
                <strong className="font-semibold text-slate-800">{resultCount.toLocaleString()}</strong>
                {resultCount === 1 ? ' bug' : ' bugs'}
                {isFiltered && hidden > 0 && <> · {hidden.toLocaleString()} hidden by filters</>}
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
