import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import {
  createContext,
  forwardRef,
  useContext,
  useState,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '../../../lib/utils';
import { modalVariants, overlayVariants } from '../../../lib/motion';

/**
 * Dialog, on Radix, animated with Framer Motion.
 *
 * Radix gives focus trapping, scroll locking, Escape handling and the aria
 * wiring. Framer gives the motion - and getting an EXIT animation out of Radix
 * needs a specific arrangement, which is most of what this file is:
 *
 *   1. Radix unmounts its content the instant `open` goes false, which would
 *      cut any exit animation off before its first frame. `forceMount` stops
 *      that and hands mounting to us.
 *   2. With Radix no longer unmounting, AnimatePresence has to do it - and it
 *      can only see the open state if something tracks it. Hence the context
 *      below, which captures `open` even when the caller left the Dialog
 *      UNCONTROLLED (`<Dialog>` with no props, as the login About panel uses).
 *
 * Without step 2 an uncontrolled dialog would animate in and then vanish
 * instantly on close, which is worse than not animating at all.
 */

const DialogOpenContext = createContext(false);

/**
 * Tracks `open` whether the caller controls it or not.
 *
 * `open` may be undefined (uncontrolled), controlled by a prop, or controlled
 * with an `onOpenChange` the caller also needs - so internal state shadows it
 * and the caller's handler is always still called.
 */
function Dialog({
  open,
  defaultOpen,
  onOpenChange,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Root>) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen ?? false);
  const isControlled = open !== undefined;
  const actual = isControlled ? open : uncontrolled;

  return (
    <DialogPrimitive.Root
      open={actual}
      defaultOpen={defaultOpen}
      onOpenChange={(next) => {
        if (!isControlled) setUncontrolled(next);
        onOpenChange?.(next);
      }}
      {...props}
    >
      <DialogOpenContext.Provider value={actual}>{children}</DialogOpenContext.Provider>
    </DialogPrimitive.Root>
  );
}

const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { hideClose?: boolean }
>(({ className, children, hideClose, ...props }, ref) => {
  const open = useContext(DialogOpenContext);

  return (
    <AnimatePresence>
      {open && (
        <DialogPortal forceMount key="dialog">
          <DialogPrimitive.Overlay asChild forceMount>
            <motion.div
              variants={overlayVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              // Slate rather than black: a pure-black scrim over a white page
              // reads as a dead area, where a tinted one still feels like the
              // app is underneath.
              className="fixed inset-0 z-50 bg-slate-900/25 backdrop-blur-[2px]"
            />
          </DialogPrimitive.Overlay>

          {/*
            Centring is done by this flex wrapper, NOT by `left-1/2 top-1/2
            -translate-x-1/2 -translate-y-1/2` on the panel itself.

            That matters because Framer animates `scale` and `y`, which it
            applies as an inline `transform` - and an inline transform REPLACES
            the one Tailwind's translate utilities set. Centring the panel that
            way would leave every dialog pinned to the middle of its own
            top-left corner the moment it started animating.

            `pointer-events-none` on the wrapper lets clicks fall through to the
            overlay behind it, which is what closes the dialog; the panel turns
            them back on for itself.
          */}
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
            <DialogPrimitive.Content ref={ref} asChild forceMount {...props}>
              <motion.div
                variants={modalVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className={cn(
                  'pointer-events-auto w-full max-w-lg',
                  'rounded-2xl border border-hairline bg-white shadow-md',
                  // Tall content scrolls inside the dialog instead of pushing it off-screen.
                  'max-h-[calc(100vh-4rem)] overflow-y-auto',
                  className
                )}
              >
                {children}
                {!hideClose && (
                  <DialogPrimitive.Close
                    className="focus-ring absolute right-4 top-4 rounded-md p-1 text-slate-400 transition-colors duration-premium ease-premium hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Close"
                  >
                  <X className="h-4 w-4" />
                </DialogPrimitive.Close>
                )}
              </motion.div>
            </DialogPrimitive.Content>
          </div>
        </DialogPortal>
      )}
    </AnimatePresence>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 border-b border-hairline px-6 py-5', className)} {...props} />;
}

function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 border-t border-hairline px-6 py-4 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

function DialogBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-6 py-5', className)} {...props} />;
}

const DialogTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('font-display text-md font-semibold text-slate-900', className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-sm text-slate-500', className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

/** Kept exported for callers that render their own overlay. */
function DialogOverlay({ className, children }: { className?: string; children?: ReactNode }) {
  return <div className={cn('fixed inset-0 z-50 bg-slate-900/25', className)}>{children}</div>;
}

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
