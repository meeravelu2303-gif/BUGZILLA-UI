import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
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
  to,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone?: keyof typeof TONE_STYLES;
  to?: string;
  hint?: string;
}) {
  const body = (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className={cn('flex h-11 w-11 items-center justify-center rounded-2xl', TONE_STYLES[tone])}>
        <Icon className="h-[22px] w-[22px]" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[2rem] font-semibold leading-none tracking-tight tabular-nums text-slate-900">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        <p className="mt-2 text-xs font-medium leading-snug text-slate-500">{label}</p>
        {hint && <p className="mt-1 text-2xs leading-snug text-slate-400">{hint}</p>}
      </div>
    </div>
  );

  const shell = 'surface px-5 py-6';

  if (to) {
    return (
      <Link
        to={to}
        className={cn(shell, 'focus-ring block transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lifted')}
      >
        {body}
      </Link>
    );
  }
  return <div className={shell}>{body}</div>;
}
