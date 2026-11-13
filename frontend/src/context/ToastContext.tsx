import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cn } from '../lib/utils';

type ToastVariant = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (omit: Omit<Toast, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_BAR: Record<ToastVariant, string> = {
  success: 'bg-emerald-500',
  error: 'bg-rose-500',
  info: 'bg-brand-500',
};

const VARIANT_ICON: Record<ToastVariant, ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />,
  error: <XCircle className="h-5 w-5 shrink-0 text-rose-600" aria-hidden />,
  info: <Info className="h-5 w-5 shrink-0 text-brand-700" aria-hidden />,
};

let idCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((previous) => previous.filter((toastItem) => toastItem.id !== id));
  }, []);

  const toast = useCallback(
    (omit: Omit<Toast, 'id'>) => {
      const id = ++idCounter;
      setToasts((previous) => [...previous, { ...omit, id }]);
      setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
        {toasts.map((toastItem) => (
          <div
            key={toastItem.id}
            role="status"
            className={cn(
              'glass-raised pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-2xl py-3.5 pl-5 pr-3 text-slate-900 animate-toast-in',
            )}
          >
            <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', VARIANT_BAR[toastItem.variant])} />
            {VARIANT_ICON[toastItem.variant]}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{toastItem.title}</p>
              {toastItem.description && (
                <p className="mt-0.5 text-[0.8667rem] leading-snug text-slate-600">{toastItem.description}</p>
              )}
            </div>
            <button
              onClick={() => dismiss(toastItem.id)}
              className="focus-ring shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-900/5 hover:text-slate-700"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
