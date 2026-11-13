import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useBrowserScope } from '../../lib/useBrowserScope';
import type { FacetStats } from '../../lib/useFacetStats';
import { FACET_LABELS, RESOLUTION_VALUES, type UseBugFilters } from '../../lib/useBugFilters';
import { useDebounce } from '../../lib/useDebounce';
import { CATEGORIES, PRIORITIES, SEVERITIES, SOURCES, type BugMeta, type Product } from '../../types';
import { DateRangeFilter } from './DateRangeFilter';
import { MultiSelect, type MultiSelectOption } from '../ui/MultiSelect';

const BROWSER_LABELS: Record<string, string> = {
  chromium: 'Chromium',
  'mobile-chrome': 'Mobile Chrome',
  firefox: 'Firefox',
  webkit: 'WebKit / Safari',
};

/** The primary control surface for every bug list. */
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
  stats?: FacetStats;
  resultCount?: number;
  totalCount?: number;
  isLoading?: boolean;
}) {
  const { filters, activeChips, isFiltered, toggleFacet, setFacet, setSearch, setDateRange, removeChip, clearAll } =
    controller;

  const [searchInput, setSearchInput] = useState(filters.search);
  const debounced = useDebounce(searchInput, 350);
  useEffect(() => {
    if (debounced !== filters.search) setSearch(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  useEffect(() => {
    setSearchInput(filters.search);
  }, [filters.search]);

  const withCounts = (values: readonly string[], counts?: Record<string, number>): MultiSelectOption[] =>
    values.map((value) => ({ value: value, label: value, count: counts?.[value] }));

  const present = (
    options: MultiSelectOption[],
    selected: string[],
    counts: Record<string, number> | undefined,
  ): MultiSelectOption[] =>
    counts === undefined
      ? options
      : options.filter((option) => (option.count ?? 0) > 0 || selected.includes(option.value));

  const selectedProducts = new Set(filters.product);
  const allowedComponents: Set<string> | null =
    products && selectedProducts.size > 0
      ? new Set(
          products
            .filter((product) => selectedProducts.has(product.name))
            .flatMap((product) => product.components.map((component) => component.name)),
        )
      : null;

  const componentOptions: MultiSelectOption[] = Object.entries(stats?.for('component')?.byComponent ?? {})
    .filter(([name]) => !allowedComponents || allowedComponents.has(name))
    .sort((left, right) => right[1] - left[1])
    .map(([name, count]) => ({ value: name, label: name, count }));

  const selectedComponents = new Set(filters.component);
  const subcomponentCounts = stats?.for('subcomponent')?.bySubcomponent;
  const scopedComponents = (products ?? [])
    .filter((product) => selectedProducts.size === 0 || selectedProducts.has(product.name))
    .flatMap((product) => product.components)
    .filter((productComponent) => selectedComponents.size === 0 || selectedComponents.has(productComponent.name));
  const scopedSubcomponents = scopedComponents.flatMap((scopedComponent) =>
    (scopedComponent.subcomponents ?? []).map((subcomponent) => ({ ...subcomponent, component: scopedComponent.name })),
  );
  const multiComponent =
    new Set(scopedSubcomponents.map((scopedSubcomponent) => scopedSubcomponent.component)).size > 1;
  const subcomponentOptions: MultiSelectOption[] = scopedSubcomponents.length
    ? [
        ...scopedSubcomponents
          .filter(
            (scopedSubcomponent) =>
              scopedSubcomponent.isActive ||
              (subcomponentCounts?.[scopedSubcomponent.value] ?? 0) > 0 ||
              filters.subcomponent.includes(scopedSubcomponent.value),
          )
          .map((scopedSubcomponent) => ({
            value: scopedSubcomponent.value,
            label: multiComponent
              ? `${scopedSubcomponent.component} › ${scopedSubcomponent.name}`
              : scopedSubcomponent.name,
            count: subcomponentCounts?.[scopedSubcomponent.value] ?? 0,
          }))
          .sort((left, right) => left.label.localeCompare(right.label)),
        { value: '---', label: 'None (no sub-component)', count: subcomponentCounts?.['---'] },
      ]
    : [];
  const presentSubcomponentOptions = present(subcomponentOptions, filters.subcomponent, subcomponentCounts);
  const showSubcomponent =
    presentSubcomponentOptions.some((presentSubcomponentOption) => presentSubcomponentOption.value !== '---') ||
    filters.subcomponent.length > 0;

  const validSubcomponents = new Set(scopedSubcomponents.map((scopedSubcomponent) => scopedSubcomponent.value));
  if (scopedSubcomponents.length > 0) validSubcomponents.add('---');
  const prunedSubcomponents = filters.subcomponent.filter((subcomponent) => validSubcomponents.has(subcomponent));
  const mustPrune = products !== undefined && prunedSubcomponents.length !== filters.subcomponent.length;
  useEffect(() => {
    if (mustPrune) setFacet('subcomponent', prunedSubcomponents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mustPrune, prunedSubcomponents.join('|')]);

  const productCounts = stats?.for('product')?.byProduct;
  const productOptions: MultiSelectOption[] = present(
    (products ?? []).map((product) => ({
      value: product.name,
      label: product.name,
      count: productCounts?.[product.name],
    })),
    filters.product,
    productCounts,
  ).sort((left, right) => (right.count ?? 0) - (left.count ?? 0) || left.label.localeCompare(right.label));
  const statusCounts = stats?.for('status')?.byStatus;
  const statusOptions: MultiSelectOption[] = present(
    (meta?.statuses ?? []).map((status) => ({
      value: status,
      label: status.replace('_', ' '),
      count: statusCounts?.[status],
    })),
    filters.status,
    statusCounts,
  );

  const resolutionOptions: MultiSelectOption[] = (
    meta?.resolutions?.length
      ? ['Unresolved', ...meta.resolutions.filter((resolution) => resolution && resolution !== '---')]
      : [...RESOLUTION_VALUES]
  ).map((value) => ({
    value: value,
    label: value === 'Unresolved' ? 'Unresolved (open)' : value,
    count: stats?.for('resolution')?.byResolution?.[value],
  }));
  const presentResolutionOptions = present(
    resolutionOptions,
    filters.resolution,
    stats?.for('resolution')?.byResolution,
  );

  const hidden = totalCount !== undefined && resultCount !== undefined ? totalCount - resultCount : 0;

  const { counts: browserCounts, hasBrowsers: showBrowser } = useBrowserScope(filters, stats?.for('browser'));
  const browserOptions: MultiSelectOption[] = Object.entries(browserCounts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([name, count]) => ({ value: name, label: BROWSER_LABELS[name] ?? name, count }));

  return (
    <div className="border-b border-hairline bg-gradient-to-b from-slate-50/80 to-white/40 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search summary or KPA-494…"
            aria-label="Search bug summaries"
            className="h-10 w-full rounded-xl border border-line bg-white/85 pl-10 pr-3 text-sm text-slate-900 shadow-[inset_0_1px_1px_rgb(15_23_42_/_0.03)] outline-none transition-all placeholder:text-slate-400 hover:border-slate-500/55 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/15"
          />
        </div>

        <DateRangeFilter
          className="w-56"
          field={filters.dateField}
          from={filters.from}
          to={filters.to}
          onChange={setDateRange}
        />

        {(products?.length ?? 0) > 1 && (
          <MultiSelect
            label={FACET_LABELS.product}
            className="w-44"
            options={productOptions}
            selected={filters.product}
            onToggle={(value) => toggleFacet('product', value)}
            onClear={() => setFacet('product', [])}
          />
        )}
        <MultiSelect
          label={FACET_LABELS.severity}
          className="w-40"
          options={present(
            withCounts(SEVERITIES, stats?.for('severity')?.bySeverity),
            filters.severity,
            stats?.for('severity')?.bySeverity,
          )}
          selected={filters.severity}
          onToggle={(value) => toggleFacet('severity', value)}
          onClear={() => setFacet('severity', [])}
        />
        <MultiSelect
          label={FACET_LABELS.priority}
          className="w-36"
          options={present(
            withCounts(PRIORITIES, stats?.for('priority')?.byPriority),
            filters.priority,
            stats?.for('priority')?.byPriority,
          )}
          selected={filters.priority}
          onToggle={(value) => toggleFacet('priority', value)}
          onClear={() => setFacet('priority', [])}
        />
        <MultiSelect
          label={FACET_LABELS.category}
          className="w-44"
          options={present(
            withCounts(CATEGORIES, stats?.for('category')?.byCategory),
            filters.category,
            stats?.for('category')?.byCategory,
          )}
          selected={filters.category}
          onToggle={(value) => toggleFacet('category', value)}
          onClear={() => setFacet('category', [])}
        />
        <MultiSelect
          label={FACET_LABELS.source}
          className="w-40"
          options={present(
            withCounts(SOURCES, stats?.for('source')?.bySource),
            filters.source,
            stats?.for('source')?.bySource,
          )}
          selected={filters.source}
          onToggle={(value) => toggleFacet('source', value)}
          onClear={() => setFacet('source', [])}
        />
        {showBrowser && (
          <MultiSelect
            label={FACET_LABELS.browser}
            className="w-44"
            options={browserOptions}
            selected={filters.browser}
            onToggle={(value) => toggleFacet('browser', value)}
            onClear={() => setFacet('browser', [])}
          />
        )}
        <MultiSelect
          label={FACET_LABELS.component}
          className="w-52"
          options={componentOptions}
          selected={filters.component}
          onToggle={(value) => toggleFacet('component', value)}
          onClear={() => setFacet('component', [])}
        />
        {showSubcomponent && (
          <MultiSelect
            label={FACET_LABELS.subcomponent}
            className="w-52"
            options={presentSubcomponentOptions}
            selected={filters.subcomponent}
            onToggle={(value) => toggleFacet('subcomponent', value)}
            onClear={() => setFacet('subcomponent', [])}
          />
        )}
        <MultiSelect
          label={FACET_LABELS.status}
          className="w-40"
          options={statusOptions}
          selected={filters.status}
          onToggle={(value) => toggleFacet('status', value)}
          onClear={() => setFacet('status', [])}
        />
        <MultiSelect
          label={FACET_LABELS.resolution}
          className="w-44"
          options={presentResolutionOptions}
          selected={filters.resolution}
          onToggle={(value) => toggleFacet('resolution', value)}
          onClear={() => setFacet('resolution', [])}
        />
      </div>

      {(isFiltered || resultCount !== undefined) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {activeChips.map((chip) => (
            <button
              key={`${chip.key}:${chip.value}`}
              onClick={() => removeChip(chip)}
              className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-900 ring-1 ring-inset ring-brand-500/25 transition-colors hover:bg-brand-100"
            >
              {chip.label}
              <X className="h-3 w-3 text-brand-700/70" aria-hidden />
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
