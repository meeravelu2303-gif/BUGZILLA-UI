import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react';
import { cn } from '../../../lib/utils';

/**
 * Tooltip, on Radix.
 *
 * A dense table leans on these for truncated summaries and icon-only buttons,
 * so the accessible behaviour matters: Radix shows them on FOCUS as well as
 * hover, which a `title` attribute and most hand-rolled versions do not.
 */
const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = forwardRef<
  ElementRef<typeof TooltipPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        // Dark-on-light by design: a tooltip is transient, and inverting it
        // separates it from the white surfaces it floats over.
        'z-50 max-w-xs rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-float',
        'data-[state=delayed-open]:animate-pop-in',
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

/** The common case in one element, so a call site is not four nested tags. */
function Hint({ label, children, ...props }: { label: ReactNode; children: ReactNode } & ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent {...props}>{label}</TooltipContent>
    </Tooltip>
  );
}

export { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent, Hint };
