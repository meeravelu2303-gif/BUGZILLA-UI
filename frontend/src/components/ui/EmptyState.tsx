import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="relative">
        <span aria-hidden className="absolute inset-0 rounded-full bg-brand-400/20 blur-xl" />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-white/80 shadow-glass ring-1 ring-inset ring-white/80">
          <Icon className="h-6 w-6 text-brand-700" aria-hidden />
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        {description && <p className="mt-1 max-w-sm text-sm text-slate-600">{description}</p>}
      </div>
      {action}
    </div>
  );
}
