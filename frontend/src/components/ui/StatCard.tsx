import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

const TONE_STYLES = {
  slate: 'bg-slate-100 text-slate-600',
  brand: 'bg-brand-50 text-brand-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  rose: 'bg-rose-50 text-rose-600',
} as const;

export function StatCard({
  icon: Icon,
  label,
  value,
  tone = 'brand',
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone?: keyof typeof TONE_STYLES;
}) {
  return (
    <div className="glass-surface rounded-2xl p-5">
      <div className="flex items-center gap-3">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', TONE_STYLES[tone])}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm text-slate-600">{label}</p>
          <p className="text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
        </div>
      </div>
    </div>
  );
}
