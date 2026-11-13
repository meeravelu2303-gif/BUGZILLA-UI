import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

/** glass is the app's translucent surface. */
export type CardVariant = 'glass' | 'solid' | 'raised';

const CARD_VARIANTS: Record<CardVariant, string> = {
  glass: 'glass-surface rounded-2xl',
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
