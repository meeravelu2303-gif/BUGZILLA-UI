import * as PopoverPrimitive from '@radix-ui/react-popover';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import { cn } from '../../../lib/utils';

/**
 * Popover, on Radix - the base for filter menus and column pickers.
 *
 * Radix handles the part hand-rolled dropdowns in this app got wrong: it flips
 * and shifts the panel to stay inside the viewport, so a filter opened near the
 * bottom of a long bug list renders upward instead of off-screen.
 */
const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

const PopoverContent = forwardRef<
  ElementRef<typeof PopoverPrimitive.Content>,
  ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = 'start', sideOffset = 6, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'z-50 min-w-[12rem] rounded-xl border border-hairline bg-white p-1 shadow-float',
        'data-[state=open]:animate-pop-in',
        // Radix measures the trigger and the space left; a long list then scrolls
        // inside the panel rather than overflowing the screen.
        'max-h-[var(--radix-popover-content-available-height)] overflow-y-auto',
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent };
