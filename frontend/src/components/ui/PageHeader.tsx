import { ChevronRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';

export interface Crumb {
  label: string;
  to?: string;
}

/**
 * The one page header. Every page uses it, so titles sit at the same size and
 * position everywhere and actions always live in the same corner.
 */
export function PageHeader({
  title,
  description,
  crumbs,
  actions,
  icon: Icon,
  eyebrow,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  crumbs?: Crumb[];
  actions?: ReactNode;
  /** A glyph in a soft brand tile beside the title - for top-level pages. */
  icon?: LucideIcon;
  /** A small label above the title (e.g. a section name). */
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-6', className)}>
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
          {crumbs.map((c, i) => (
            <span key={`${c.label}-${i}`} className="flex items-center gap-1.5">
              {c.to ? (
                <Link to={c.to} className="focus-ring rounded font-medium hover:text-brand-700">
                  {c.label}
                </Link>
              ) : (
                <span className="font-medium text-slate-700">{c.label}</span>
              )}
              {i < crumbs.length - 1 && <ChevronRight className="h-3 w-3 text-slate-400" aria-hidden />}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-center gap-4">
          {Icon && (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md ring-1 ring-inset ring-white/30">
              <Icon className="h-6 w-6" aria-hidden />
            </span>
          )}
          <div className="min-w-0">
            {eyebrow && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-700">{eyebrow}</p>}
            <h1 className="text-[1.65rem] font-semibold leading-tight tracking-tight text-slate-900">{title}</h1>
            {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** The page column every screen renders into: one width scale, one gutter, one entrance. */
export function PageContainer({
  children,
  width = 'wide',
  className,
}: {
  children: ReactNode;
  width?: 'narrow' | 'medium' | 'wide' | 'full';
  className?: string;
}) {
  const widths = { narrow: 'max-w-[900px]', medium: 'max-w-[1200px]', wide: 'max-w-[1400px]', full: 'max-w-[1600px]' };
  return <div className={cn('mx-auto animate-page-in px-4 py-6 sm:px-6 lg:px-8 lg:py-8', widths[width], className)}>{children}</div>;
}
