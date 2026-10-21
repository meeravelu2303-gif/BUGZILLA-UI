import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

/**
 * `glass` is the app's translucent surface. `solid` is the flat, bordered card
 * the dense data views use: a tinted, blurred backdrop behind a long table costs
 * legibility at every row for decoration seen once, and the sticky header has
 * to be opaque anyway or rows show through it as they scroll. `raised` is for
 * surfaces that float above the page (popovers, dialogs).
 *
 * A prop rather than a className override because `cn` is plain clsx with no
 * Tailwind conflict resolution — passing `bg-white` alongside `bg-white/70`
 * leaves both in the class list and lets stylesheet order decide the winner.
 */
export type CardVariant = 'glass' | 'solid' | 'raised';

const CARD_VARIANTS: Record<CardVariant, string> = {
  glass: 'glass-surface rounded-2xl',
  /*
   * Pure white, with depth carried by the shadow rather than the border.
   *
   * `rounded-xl` is deliberate and must stay: e2e/tests/ui-theme.spec.ts finds
   * the bug-list card with `ancestor::div[contains(@class,"rounded-xl")]`, so
   * rounding this to 2xl like the others would silently detach that whole
   * tripwire from the element it is meant to be asserting about.
   */
  solid: 'rounded-xl border border-hairline bg-white shadow-soft',
  raised: 'glass-raised rounded-2xl',
};

export function Card({
  className,
  variant = 'glass',
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: CardVariant }) {
  return <div className={cn(CARD_VARIANTS[variant], className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center justify-between gap-4 border-b border-hairline px-5 py-4', className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-[1rem] font-semibold tracking-tight text-slate-900', className)} {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...props} />;
}
