import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

/*
 * Flat fills, 8px radius, no gradients.
 *
 * The previous button was a pill with a vertical gradient and a coloured halo,
 * because docs/BRANDING.md pinned it to UEducate's own 30px-radius CTA. That brand
 * constraint went with the teal, so the shape follows the new aesthetic: a
 * solid Royal Blue fill, a tight radius, and elevation implied by a ring rather
 * than a glow. Gradients on a control are the single loudest thing on a white
 * page, and this layout wants the DATA to be the loudest thing.
 *
 * Contrast is measured, as before: white on brand-600 is 5.17:1 and on
 * brand-700 (hover) 6.70:1, so the label clears AA in both states - which a
 * gradient could only promise at its darkest stop.
 */
const buttonVariants = cva(
  'focus-ring inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-lg font-medium transition-[background-color,box-shadow,border-color,transform] duration-200 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-brand-600 text-white shadow-hairline hover:bg-brand-700 active:bg-brand-800',
        /* The default for most actions: reads as a control, not a surface. */
        secondary:
          'border border-hairline bg-white text-slate-700 shadow-hairline hover:border-line hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100',
        ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200',
        danger: 'bg-rose-600 text-white shadow-hairline hover:bg-rose-700 active:bg-rose-800',
        /* An accent-weight action that is not the page's primary one. */
        outline:
          'border border-brand-200 bg-brand-50 text-brand-800 hover:border-brand-300 hover:bg-brand-100 active:bg-brand-200',
      },
      size: {
        sm: 'h-8 gap-1.5 px-3 text-xs',
        md: 'h-9 gap-2 px-3.5 text-sm',
        lg: 'h-10 gap-2 px-4 text-md',
        /* Square, for a lone icon - keeps the hit target without side padding. */
        icon: 'h-9 w-9',
        'icon-sm': 'h-8 w-8',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  /** Render the child element instead of a <button> - for a styled <Link>. */
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, asChild, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        // `asChild` forwards to an arbitrary element, which may not accept
        // `disabled` - so the attribute is only set when this really is a button.
        {...(asChild ? {} : { disabled: disabled || loading })}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {/*
          `asChild` hands rendering to Radix's Slot, which merges props onto a
          SINGLE child element and throws on more than one ("Expected a single
          React element child"). Emitting the spinner alongside `children`
          always produced two, so every asChild button - every styled <Link> -
          crashed the page, even with `loading` unset: `{false}` still counts
          as a child.

          So the spinner is only rendered in the real <button> branch. That is
          not a limitation worth working around with <Slottable>: `asChild`
          exists for links and menu triggers, which navigate rather than submit
          and have no pending state to show.
        */}
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            {children}
          </>
        )}
      </Comp>
    );
  }
);
Button.displayName = 'Button';

export { buttonVariants };
