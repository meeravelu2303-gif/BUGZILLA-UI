import { Command as CommandPrimitive } from 'cmdk';
import { Search } from 'lucide-react';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import { cn } from '../../../lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog';

/**
 * Command menu, on cmdk - the engine for Ctrl/Cmd+K.
 *
 * The existing CommandPalette hand-rolled its own filtering and arrow-key
 * handling over a flat array. That works for a fixed nav list, but not for the
 * grouped, async, mixed-source palette this is becoming (bugs, products,
 * components and actions in one list). cmdk brings scoring-based filtering,
 * grouping with headings that hide when empty, and a correct listbox/option
 * aria pairing.
 *
 * Deliberately NOT wired to any data here - this is the presentational shell.
 * The palette itself keeps owning what it searches, so the BFF query layer is
 * untouched.
 */
const Command = forwardRef<
  ElementRef<typeof CommandPrimitive>,
  ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn('flex h-full w-full flex-col overflow-hidden rounded-2xl bg-white', className)}
    {...props}
  />
));
Command.displayName = CommandPrimitive.displayName;

/** The palette as a modal, positioned high so it does not jump as results change. */
function CommandDialog({
  open,
  onOpenChange,
  label = 'Command palette',
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        /*
         * Anchored near the top rather than centred: a centred palette shifts
         * vertically every time the result count changes, which makes the list
         * feel unstable under the cursor.
         *
         * Expressed as a self-alignment inside the dialog's flex wrapper, not
         * as `top-[12vh] translate-y-0` - Framer owns the inline transform
         * while this animates, so a translate utility here would be discarded.
         */
        className="mt-[12vh] max-w-xl self-start overflow-hidden p-0"
      >
        {/* Radix requires a title/description for the dialog's aria wiring. */}
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <DialogDescription className="sr-only">
          Search bugs, products and components, or run a quick action.
        </DialogDescription>
        <Command
          // Results are filtered by the caller against live data, so cmdk's own
          // fuzzy scoring is switched off - otherwise it filters a second time
          // and hides rows the server already judged to be matches.
          shouldFilter={false}
          loop
        >
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

const CommandInput = forwardRef<
  ElementRef<typeof CommandPrimitive.Input>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <div className="flex items-center gap-2.5 border-b border-hairline px-4">
    <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        'h-12 w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-50',
        className
      )}
      {...props}
    />
  </div>
));
CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandList = forwardRef<
  ElementRef<typeof CommandPrimitive.List>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn('max-h-[22rem] overflow-y-auto overflow-x-hidden p-1.5', className)}
    {...props}
  />
));
CommandList.displayName = CommandPrimitive.List.displayName;

const CommandEmpty = forwardRef<
  ElementRef<typeof CommandPrimitive.Empty>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
  <CommandPrimitive.Empty ref={ref} className="py-8 text-center text-sm text-slate-500" {...props} />
));
CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

const CommandGroup = forwardRef<
  ElementRef<typeof CommandPrimitive.Group>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      'overflow-hidden p-1 text-slate-900',
      '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5',
      '[&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold',
      '[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide',
      '[&_[cmdk-group-heading]]:text-slate-400',
      className
    )}
    {...props}
  />
));
CommandGroup.displayName = CommandPrimitive.Group.displayName;

const CommandItem = forwardRef<
  ElementRef<typeof CommandPrimitive.Item>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-700 outline-none',
      // cmdk marks the highlighted row with data-selected, which follows both
      // the arrow keys and the pointer - so hover and keyboard agree.
      'data-[selected=true]:bg-brand-50 data-[selected=true]:text-brand-900',
      'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
      className
    )}
    {...props}
  />
));
CommandItem.displayName = CommandPrimitive.Item.displayName;

function CommandShortcut({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('ml-auto text-2xs tracking-widest text-slate-400', className)} {...props} />;
}

function CommandSeparator({ className, ...props }: ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>) {
  return <CommandPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-hairline', className)} {...props} />;
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};
