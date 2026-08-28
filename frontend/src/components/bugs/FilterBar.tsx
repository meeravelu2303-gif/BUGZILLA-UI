import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useBrowserScope } from '../../lib/useBrowserScope';
import { FACET_LABELS, RESOLUTION_VALUES, type UseBugFilters } from '../../lib/useBugFilters';
import { useDebounce } from '../../lib/useDebounce';
import { CATEGORIES, PRIORITIES, SEVERITIES, type BugMeta, type BugStats, type Product } from '../../types';
import { MultiSelect, type MultiSelectOption } from '../ui/MultiSelect';

/**
 * Playwright's project names are lowercase slugs; the filter menu shows the
 * product names a person would say out loud. Kept beside the options rather
 * than in Pill.tsx because an unknown project must still be selectable under
 * its raw name here, exactly as it renders under its raw name there.
 */
const BROWSER_LABELS: Record<string, string> = {
  chromium: 'Chromium',
  'mobile-chrome': 'Mobile Chrome',
  firefox: 'Firefox',
  webkit: 'WebKit / Safari',
};

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

  /*
   * Prefer the resolutions this Bugzilla actually declares; fall back to the standard set when
   * the meta call has not resolved yet, so the control is never an empty dropdown. Bugzilla
   * reports "no resolution" as `---`, which reads as nothing in a menu — relabelled here and
   * translated back server-side.
   */
  const resolutionOptions: MultiSelectOption[] = (meta?.resolutions?.length
    ? meta.resolutions.map((r) => (r === '---' ? 'Unresolved' : r))
    : [...RESOLUTION_VALUES]
  ).map((r) => ({ value: r, label: r === 'Unresolved' ? 'Unresolved (open)' : r }));

  const hidden = totalCount !== undefined && resultCount !== undefined ? totalCount - resultCount : 0;

  /*
   * Browser is a UI-bench-only field: it comes from the `[browser:…]` whiteboard
   * tag, which the API bench never writes. The control is hidden unless the
   * current scope actually contains browser-tagged bugs.
   *
   * Shared with BugTable through `useBrowserScope`, deliberately: the filter and
   * the table column have to agree, and computing "is browser meaningful here"
   * twice is how they would eventually stop agreeing.
   */
  const { counts: browserCounts, hasBrowsers: showBrowser } = useBrowserScope(filters, stats);
  const browserOptions: MultiSelectOption[] = Object.entries(browserCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ value: name, label: BROWSER_LABELS[name] ?? name, count }));

  return (
    <div className="border-b border-slate-200/80 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search summaries…"
            aria-label="Search bug summaries"
            className="focus-ring h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400"
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
        {showBrowser && (
          <MultiSelect
            label={FACET_LABELS.browser}
            className="w-44"
            options={browserOptions}
            selected={filters.browser}
            onToggle={(v) => toggleFacet('browser', v)}
            onClear={() => setFacet('browser', [])}
          />
        )}
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
        {/* Beside Status because it answers what Status cannot: every closed bug reads RESOLVED,
            and FIXED / INVALID / DUPLICATE mean entirely different things on this product. */}
        <MultiSelect
          label={FACET_LABELS.resolution}
          className="w-44"
          options={resolutionOptions}
          selected={filters.resolution}
          onToggle={(v) => toggleFacet('resolution', v)}
          onClear={() => setFacet('resolution', [])}
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
              className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100"
            >
              {chip.label}
              <X className="h-3 w-3 text-slate-400" aria-hidden />
              <span className="sr-only">Remove filter {chip.label}</span>
            </button>
          ))}

          {isFiltered && (
            <button
              onClick={clearAll}
              className="focus-ring rounded px-1 text-xs font-medium text-slate-500 underline-offset-2 transition-colors hover:text-slate-900 hover:underline"
            >
              Clear all
            </button>
          )}

          <span aria-live="polite" className="ml-auto text-xs text-slate-500">
            {isLoading ? (
              'Loading…'
            ) : resultCount === undefined ? null : (
              <>
                <strong className="font-semibold text-slate-900">{resultCount.toLocaleString()}</strong>
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
