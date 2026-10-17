import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

/*
 * Pill-shaped, per the brand's own buttons (BRANDING.md: 30px radius, soft halo).
 * Inputs stay rounded-xl so a button beside a field reads as the action, not
 * another field.
 */
const VARIANT_STYLES: Record<Variant, string> = {
  // brand-700/800 (not the lighter authentic teal) so white label text clears WCAG AA
  // at every point of the gradient - 4.88:1 and 7.22:1. See BRANDING.md.
  primary:
    'bg-gradient-to-b from-brand-600 to-brand-800 text-white shadow-glow ring-1 ring-inset ring-white/20 hover:from-brand-700 hover:to-brand-900 hover:shadow-float active:translate-y-px',
  secondary:
    'bg-white/80 text-slate-700 shadow-card ring-1 ring-inset ring-slate-900/10 backdrop-blur-sm hover:bg-white hover:text-slate-900 hover:ring-slate-900/15 active:translate-y-px',
  ghost: 'text-slate-600 hover:bg-white/70 hover:text-slate-900',
  danger:
    'bg-gradient-to-b from-rose-500 to-rose-600 text-white shadow-[0_8px_20px_-6px_rgb(225_29_72_/_0.5)] ring-1 ring-inset ring-white/20 hover:from-rose-600 hover:to-rose-700 active:translate-y-px',
};

const SIZE_STYLES: Record<Size, string> = {
  sm: 'h-8 px-3.5 text-[13px] gap-1.5',
  md: 'h-10 px-5 text-sm gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'focus-ring inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0',
          VARIANT_STYLES[variant],
          SIZE_STYLES[size],
          className
        )}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
