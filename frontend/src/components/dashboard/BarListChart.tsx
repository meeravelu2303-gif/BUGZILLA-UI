import { cn } from '../../lib/utils';

export interface BarListItem {
  label: string;
  value: number;
  tone?: 'slate' | 'blue' | 'amber' | 'emerald' | 'violet' | 'rose' | 'orange' | 'sky';
}

const FILL_CLASS: Record<NonNullable<BarListItem['tone']>, string> = {
  slate: 'bg-slate-400',
  blue: 'bg-blue-500',
  amber: 'bg-amber-500',
  emerald: 'bg-emerald-500',
  violet: 'bg-violet-500',
  rose: 'bg-rose-500',
  orange: 'bg-orange-500',
  sky: 'bg-sky-500',
};

export function BarListChart({ items, title }: { items: BarListItem[]; title: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <div>
      {title && <h3 className="mb-4 text-sm font-semibold text-slate-900">{title}</h3>}
      {items.length === 0 ? (
        <p className="text-sm text-slate-600">No data yet.</p>
      ) : (
        <div className="flex flex-col gap-3" role="img" aria-label={`${title} bar chart`}>
          {items.map((item) => {
            const pct = Math.max(4, Math.round((item.value / max) * 100));
            return (
              <div key={item.label} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 truncate text-slate-600" title={item.label}>
                  {item.label}
                </span>
                <div className="h-2 flex-1 rounded-full bg-slate-100">
                  <div
                    className={cn('h-2 rounded-full', FILL_CLASS[item.tone ?? 'slate'])}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right font-medium tabular-nums text-slate-700">{item.value}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
