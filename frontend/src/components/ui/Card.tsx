import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

/**
 * `glass` is the app's established translucent surface. `solid` is the flat,
 * bordered card the dense data views use: a tinted, blurred backdrop behind a
 * long table costs legibility at every row for decoration seen once, and the
 * sticky header has to be opaque anyway or rows show through it as they scroll.
 *
 * A prop rather than a className override because `cn` is plain clsx with no
 * Tailwind conflict resolution — passing `bg-white` alongside `bg-white/70`
 * leaves both in the class list and lets stylesheet order decide the winner.
 */
export type CardVariant = 'glass' | 'solid';

const CARD_VARIANTS: Record<CardVariant, string> = {
  glass: 'glass-surface rounded-2xl',
  // Pure white on the page's ice-blue mesh, so the data reads at full contrast
  // while the tinted background still shows around the card.
  solid: 'rounded-xl border border-slate-200/80 bg-white shadow-sm',
};

export function Card({
  className,
  variant = 'glass',
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: CardVariant }) {
  return <div className={cn(CARD_VARIANTS[variant], className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-between gap-4 border-b border-white/30 px-5 py-4', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-sm font-semibold text-slate-900', className)} {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...props} />;
}
