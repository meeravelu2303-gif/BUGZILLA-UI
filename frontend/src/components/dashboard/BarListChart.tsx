import { cn } from '../../lib/utils';

export interface BarListItem {
  label: string;
  value: number;
  tone?: 'slate' | 'blue' | 'amber' | 'emerald' | 'violet' | 'rose' | 'orange' | 'sky';
}

/* A gradient per tone: a flat bar on a glass card looks printed on; a lit one looks like data. */
const FILL_CLASS: Record<NonNullable<BarListItem['tone']>, string> = {
  slate: 'from-slate-400 to-slate-500',
  blue: 'from-blue-400 to-blue-600',
  amber: 'from-amber-400 to-amber-500',
  emerald: 'from-emerald-400 to-emerald-600',
  violet: 'from-violet-400 to-violet-600',
  rose: 'from-rose-400 to-rose-600',
  orange: 'from-orange-400 to-orange-500',
  sky: 'from-sky-400 to-sky-600',
};

export function BarListChart({ items, title }: { items: BarListItem[]; title: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((n, i) => n + i.value, 0);

  return (
    <div>
      {title && <h3 className="mb-4 text-sm font-semibold text-slate-900">{title}</h3>}
      {items.length === 0 ? (
        <p className="text-sm text-slate-600">No data yet.</p>
      ) : (
        <div className="flex flex-col gap-3.5" role="img" aria-label={`${title} bar chart`}>
          {items.map((item) => {
            const pct = Math.max(3, Math.round((item.value / max) * 100));
            const share = total ? Math.round((item.value / total) * 100) : 0;
            return (
              <div key={item.label} className="group flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 truncate text-[13px] text-slate-700" title={item.label}>
                  {item.label}
                </span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-900/[0.06]">
                  <div
                    className={cn('h-full rounded-full bg-gradient-to-r shadow-[inset_0_1px_0_rgb(255_255_255_/_0.35)] transition-[width] duration-500', FILL_CLASS[item.tone ?? 'slate'])}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-[13px] font-semibold tabular-nums text-slate-800">{item.value.toLocaleString()}</span>
                <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-slate-400">{share}%</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
