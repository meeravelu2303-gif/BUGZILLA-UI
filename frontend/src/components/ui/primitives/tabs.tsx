import * as TabsPrimitive from '@radix-ui/react-tabs';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import { cn } from '../../../lib/utils';

/**
 * Tabs, on Radix - roving focus and arrow-key navigation for free.
 *
 * Styled as an underline rail rather than a filled pill group: the dashboards
 * put tabs directly above dense data, and a filled group competes with the
 * table for weight.
 */
const Tabs = TabsPrimitive.Root;

const TabsList = forwardRef<
  ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn('flex items-center gap-1 border-b border-hairline', className)}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'focus-ring relative -mb-px whitespace-nowrap rounded-t-md px-3 py-2 text-sm font-medium text-slate-500 transition-colors',
      'hover:text-slate-900',
      // The active rail is drawn with a border on the trigger itself, so it
      // lines up with the list's own border rather than floating near it.
      'border-b-2 border-transparent',
      'data-[state=active]:border-brand-600 data-[state=active]:text-brand-700',
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = forwardRef<
  ElementRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn('focus-ring mt-4', className)} {...props} />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
