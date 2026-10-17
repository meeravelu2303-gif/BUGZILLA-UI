import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';

/*
 * Each tone is an icon tile gradient plus a soft glow of the same hue behind the
 * tile, so five tiles in a row read as five different things at a glance rather
 * than five grey boxes with different words in them.
 */
const TONE_STYLES = {
  slate: { tile: 'from-slate-500 to-slate-700', glow: 'bg-slate-400/25' },
  brand: { tile: 'from-brand-500 to-brand-700', glow: 'bg-brand-400/30' },
  emerald: { tile: 'from-emerald-400 to-emerald-600', glow: 'bg-emerald-400/25' },
  amber: { tile: 'from-amber-400 to-orange-500', glow: 'bg-amber-400/30' },
  rose: { tile: 'from-rose-400 to-rose-600', glow: 'bg-rose-400/25' },
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
  /** Makes the whole tile a link to the list it counts. */
  to?: string;
  hint?: string;
}) {
  const t = TONE_STYLES[tone];
  const body = (
    <>
      {/* The glow sits behind the tile and bleeds past the card edge; the card clips it. */}
      <span aria-hidden className={cn('pointer-events-none absolute -left-6 -top-8 h-28 w-28 rounded-full blur-2xl', t.glow)} />
      <div className="relative flex items-start gap-3.5">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md ring-1 ring-inset ring-white/30',
            t.tile
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          {/* Labels wrap rather than truncate: a tile that reads "Critical (P0) o…" says nothing. */}
          <p className="text-[12.5px] font-medium leading-snug text-slate-600">{label}</p>
          <p className="mt-0.5 text-[26px] font-semibold leading-none tracking-tight tabular-nums text-slate-900">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {hint && <p className="mt-1.5 text-[11px] leading-snug text-slate-500">{hint}</p>}
        </div>
      </div>
    </>
  );

  const shell = 'glass-surface relative overflow-hidden rounded-2xl p-5';
  if (to) {
    return (
      <Link
        to={to}
        className={cn(
          shell,
          'focus-ring block transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300/70 hover:shadow-float'
        )}
      >
        {body}
      </Link>
    );
  }
  return <div className={shell}>{body}</div>;
}
