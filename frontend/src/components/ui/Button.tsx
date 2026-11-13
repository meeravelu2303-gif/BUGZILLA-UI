import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'focus-ring inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-lg font-medium transition-[background-color,box-shadow,border-color,transform] duration-200 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-brand-600 text-white shadow-hairline hover:bg-brand-700 active:bg-brand-800',
        secondary:
          'border border-hairline bg-white text-slate-700 shadow-hairline hover:border-line hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100',
        ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200',
        danger: 'bg-rose-600 text-white shadow-hairline hover:bg-rose-700 active:bg-rose-800',
        outline:
          'border border-brand-200 bg-brand-50 text-brand-800 hover:border-brand-300 hover:bg-brand-100 active:bg-brand-200',
      },
      size: {
        sm: 'h-8 gap-1.5 px-3 text-xs',
        md: 'h-9 gap-2 px-3.5 text-sm',
        lg: 'h-10 gap-2 px-4 text-md',
        icon: 'h-9 w-9',
        'icon-sm': 'h-8 w-8',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, asChild, children, ...props }, ref) => {
    const RootElement = asChild ? Slot : 'button';
    return (
      <RootElement
        ref={ref}
        {...(asChild ? {} : { disabled: disabled || loading })}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            {children}
          </>
        )}
      </RootElement>
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
