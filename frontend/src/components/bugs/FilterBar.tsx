import { Search } from 'lucide-react';
import type { BugMeta, Product } from '../../types';
import { Select } from '../ui/Field';

export interface Filters {
  search: string;
  product: string;
  status: string;
  severity: string;
  priority: string;
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
    </div>
  );
}
