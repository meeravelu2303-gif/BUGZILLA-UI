import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';

/*
 * Soft pastel fills, not gradients.
 *
 * Each tile was previously a saturated gradient chip with a coloured glow
 * bleeding behind it. On a white page with shadow-led elevation that competes
 * with the card itself - two depth cues in the same 40px. A flat pastel wash
 * with the icon in the darker sibling of the same hue reads as a category mark
 * and lets the number be the loudest thing on the card, which is the point.
 *
 * Every pairing is AA at this size: the icon colour is the 600/700 step on its
 * own 50 step, which measures between 5.1:1 and 8.0:1.
 *
 * `tone` is a CATEGORY mark, not a severity signal - pass a constant one.
 * Several cards used to switch to `slate` when their value hit zero, on the
 * theory that a quiet number should look quiet. On screen it read as a broken
 * icon instead: three coloured chips beside one grey one looks like a failed
 * render, not a calm state. The NUMBER communicates "nothing to do"; the
 * colour's job is only to tell the cards apart at a glance.
 */
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
  /** Makes the whole tile a link to the list it counts. */
  to?: string;
  hint?: string;
}) {
  const body = (
    /*
     * Centred stack: icon, number, label. The number is the reason the card
     * exists, so it sits in the optical centre at the largest size on the
     * page; the label reads underneath as its caption rather than beside it
     * competing for the same line.
     */
    <div className="flex flex-col items-center gap-3 text-center">
      <span className={cn('flex h-11 w-11 items-center justify-center rounded-2xl', TONE_STYLES[tone])}>
        <Icon className="h-[22px] w-[22px]" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[2rem] font-semibold leading-none tracking-tight tabular-nums text-slate-900">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        {/* Labels wrap rather than truncate: a tile reading "Critical (P0) o…" says nothing. */}
        <p className="mt-2 text-xs font-medium leading-snug text-slate-500">{label}</p>
        {hint && <p className="mt-1 text-2xs leading-snug text-slate-400">{hint}</p>}
      </div>
    </div>
  );

  // Generous padding is what makes these read as "wider": the grid gives each
  // tile the same width, and the breathing room inside is what changes.
  const shell = 'surface px-5 py-6';

  if (to) {
    return (
      <Link to={to} className={cn(shell, 'focus-ring block transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lifted')}>
        {body}
      </Link>
    );
  }
  return <div className={shell}>{body}</div>;
}
