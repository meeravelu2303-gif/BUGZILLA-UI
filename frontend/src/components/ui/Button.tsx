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

const VARIANT_STYLES: Record<Variant, string> = {
  // brand-700/800 (not the lighter authentic teal) so white label text clears WCAG AA
  // at every point of the gradient - 4.88:1 and 7.22:1. See BRANDING.md.
  primary: 'bg-gradient-to-b from-brand-700 to-brand-800 text-white hover:from-brand-800 hover:to-brand-900 shadow-glass',
  secondary: 'bg-white/70 text-slate-700 ring-1 ring-inset ring-white/60 backdrop-blur-sm hover:bg-white/90',
  ghost: 'text-slate-600 hover:bg-white/50',
  danger: 'bg-gradient-to-b from-rose-500 to-rose-600 text-white hover:from-rose-600 hover:to-rose-700 shadow-glass',
};

const SIZE_STYLES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'focus-ring inline-flex items-center justify-center rounded-xl font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
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
