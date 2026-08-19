import { Search } from 'lucide-react';
import { useMemo } from 'react';
import type { BugMeta, Product } from '../../types';
import { Select } from '../ui/Field';

export interface Filters {
  search: string;
  product: string;
  component: string;
  status: string;
  severity: string;
  priority: string;
  /** Business tier ("1".."3"), matched against the Status Whiteboard. */
  tier: string;
}

/** Tiers the bench assigns; see tierOf() for where the value is stored. */
const TIERS = [
  { value: '1', label: 'Tier 1' },
  { value: '2', label: 'Tier 2' },
  { value: '3', label: 'Tier 3' },
];

const MULTI_PRODUCT_GROUP = 'In multiple products';

/**
 * Bugzilla has no global component list - components belong to a product. But
 * GET /api/products (already fetched for the Product filter) returns every
 * enterable product with its full `components` array, so the "All products"
 * case can offer a merged list without a second request.
 *
 * Bugzilla's `component` query param matches on *name* only, so names are
 * de-duplicated here: a name owned by one product is grouped under it, and a
 * name shared by several becomes a single option that honestly means "any
 * component with this name" - which is exactly what the filter will do.
 */
function componentOptions(products: Product[] | undefined, product: string): { name: string; group: string }[] {
  if (!products) return [];

  if (product) {
    const match = products.find((p) => p.name === product);
    return (match?.components ?? []).map((c) => ({ name: c.name, group: '' })).sort((a, b) => a.name.localeCompare(b.name));
  }

  const owners = new Map<string, string[]>();
  for (const p of products) {
    for (const c of p.components) {
      owners.set(c.name, [...(owners.get(c.name) ?? []), p.name]);
    }
  }
  return [...owners.entries()]
    .map(([name, ps]) => ({ name, group: ps.length === 1 ? ps[0] : MULTI_PRODUCT_GROUP }))
    .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
}

/**
 * Whether a component filter is still meaningful for a newly chosen product,
 * so BugList can drop a selection that would otherwise match nothing.
 */
export function isComponentInProduct(products: Product[] | undefined, component: string, product: string): boolean {
  if (!component) return true;
  // "All products" merges every product's components, so any name stays valid.
  if (!product) return true;
  // Don't discard a selection we can't verify yet.
  if (!products) return true;
  const match = products.find((p) => p.name === product);
  return Boolean(match?.components.some((c) => c.name === component));
}

export function FilterBar({
  filters,
  onChange,
  meta,
  products,
}: {
  filters: Filters;
  onChange: (next: Partial<Filters>) => void;
  meta?: BugMeta;
  products?: Product[];
}) {
  const components = useMemo(() => componentOptions(products, filters.product), [products, filters.product]);

  // With no product filter the list spans products, so label each run with its
  // owning product via <optgroup>. Options are already sorted by group.
  const componentGroups = useMemo(() => {
    if (filters.product) return null;
    const out: { label: string; names: string[] }[] = [];
    for (const c of components) {
      const last = out[out.length - 1];
      if (last && last.label === c.group) last.names.push(c.name);
      else out.push({ label: c.group, names: [c.name] });
    }
    return out;
  }, [components, filters.product]);

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-white/30 px-5 py-4">
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={filters.search}
          onChange={(e) => onChange({ search: e.target.value })}
          placeholder="Search summaries…"
          aria-label="Search bugs"
          className="focus-ring w-full rounded-xl border border-white/60 bg-white/80 py-2 pl-9 pr-3 text-sm placeholder:text-slate-500 backdrop-blur-sm"
        />
      </div>

      <Select
        aria-label="Filter by product"
        placeholder="All products"
        value={filters.product}
        onChange={(e) => onChange({ product: e.target.value })}
        className="w-40"
      >
        {products?.map((p) => (
          <option key={p.id} value={p.name}>
            {p.name}
          </option>
        ))}
      </Select>

      <Select
        aria-label="Filter by component"
        placeholder="All components"
        value={filters.component}
        onChange={(e) => onChange({ component: e.target.value })}
        className="w-40"
      >
        {componentGroups
          ? componentGroups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.names.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </optgroup>
            ))
          : components.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
      </Select>

      <Select
        aria-label="Filter by status"
        placeholder="All statuses"
        value={filters.status}
        onChange={(e) => onChange({ status: e.target.value })}
        className="w-40"
      >
        {meta?.statuses.map((s) => (
          <option key={s} value={s}>
            {s.replace('_', ' ')}
          </option>
        ))}
      </Select>

      <Select
        aria-label="Filter by severity"
        placeholder="All severities"
        value={filters.severity}
        onChange={(e) => onChange({ severity: e.target.value })}
        className="w-40"
      >
        {meta?.severities.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>

      <Select
        aria-label="Filter by priority"
        placeholder="All priorities"
        value={filters.priority}
        onChange={(e) => onChange({ priority: e.target.value })}
        className="w-40"
      >
        {meta?.priorities.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </Select>

      <Select
        aria-label="Filter by tier"
        placeholder="All tiers"
        value={filters.tier}
        onChange={(e) => onChange({ tier: e.target.value })}
        className="w-32"
      >
        {TIERS.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
