import { ChevronDown, type LucideIcon } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { cn } from '../../../lib/utils';

const STORAGE_KEY = 'bug-editor:collapsed';

function readCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

function writeCollapsed(id: string, collapsed: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readCollapsed(), [id]: collapsed }));
  } catch {
    // Private window or blocked storage: the section still works, it just won't be remembered.
  }
}

/**
 * One collapsible group of fields in the bug editor. Open/closed is remembered
 * per section across bugs, so someone who never uses time tracking folds it
 * away once instead of scrolling past it on every bug.
 *
 * A section with unsaved changes shows a count, and cannot be folded shut
 * while it does - hiding a pending edit is how it gets saved by surprise.
 */
export function EditSection({
  id,
  title,
  icon: Icon,
  changes = 0,
  defaultOpen = true,
  summary,
  children,
}: {
  id: string;
  title: string;
  icon: LucideIcon;
  changes?: number;
  defaultOpen?: boolean;
  /** Shown beside the title while collapsed, so a folded section still says something. */
  summary?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => {
    const stored = readCollapsed()[id];
    return stored === undefined ? defaultOpen : !stored;
  });
  const panelId = useId();
  const isOpen = open || changes > 0;

  return (
    <section className="border-b border-white/40 last:border-b-0">
      <h3>
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => {
            if (changes > 0) return;
            setOpen(!isOpen);
            writeCollapsed(id, isOpen);
          }}
          className="focus-ring flex w-full items-center gap-2 px-5 py-3 text-left transition-colors hover:bg-white/40"
        >
          <Icon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</span>
          {changes > 0 && (
            <span className="rounded-full bg-brand-600 px-1.5 py-px text-[10px] font-semibold tabular-nums text-white">
              {changes} <span className="sr-only">unsaved</span>
            </span>
          )}
          {!isOpen && summary && <span className="ml-auto truncate pl-2 text-xs text-slate-500">{summary}</span>}
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', !isOpen && '-rotate-90', isOpen && 'ml-auto', changes > 0 && 'opacity-30')}
            aria-hidden
          />
        </button>
      </h3>
      {isOpen && (
        <div id={panelId} className="flex flex-col gap-4 px-5 pb-5 pt-1">
          {children}
        </div>
      )}
    </section>
  );
}

/** Marks a field with an unsaved edit: a brand bar on its left edge. */
export function Changed({ when, children, className }: { when: boolean; children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'relative transition-[padding]',
        when && 'pl-3 before:absolute before:inset-y-0.5 before:left-0 before:w-[3px] before:rounded-full before:bg-brand-500',
        className
      )}
    >
      {children}
    </div>
  );
}
