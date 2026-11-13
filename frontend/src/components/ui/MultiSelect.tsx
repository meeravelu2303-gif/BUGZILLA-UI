import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

export interface MultiSelectOption {
  value: string;
  label: string;
  count?: number;
}

/** A checkbox popover for one filter axis. */
export function MultiSelect({
  label,
  options,
  selected,
  onToggle,
  onClear,
  className,
}: {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const summary =
    selected.length === 0
      ? `All ${label.toLowerCase()}`
      : selected.length === 1
        ? selected[0]
        : `${label} (${selected.length})`;

  return (
    <div ref={root} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((currentOpen) => !currentOpen)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          'focus-ring flex h-10 w-full items-center justify-between gap-2 rounded-xl border bg-white/85 px-3 text-sm shadow-[inset_0_1px_1px_rgb(15_23_42_/_0.03)] transition-all',
          selected.length > 0
            ? 'border-brand-500 bg-brand-50/60 font-medium text-brand-900 ring-2 ring-brand-500/15'
            : 'border-line text-slate-600 hover:border-slate-500/55 hover:bg-white',
        )}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable
          className="glass-raised absolute left-0 z-30 mt-1.5 max-h-72 w-64 overflow-auto rounded-xl p-1.5 animate-toast-in"
        >
          {options.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-500">Nothing to filter by yet.</p>
          ) : (
            <>
              {options.map((option) => {
                const isOn = selected.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isOn}
                    onClick={() => onToggle(option.value)}
                    className="focus-ring flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-slate-50"
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                        isOn ? 'border-brand-700 bg-brand-700 text-white' : 'border-line bg-white',
                      )}
                    >
                      {isOn && <Check className="h-3 w-3" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-slate-700" title={option.label}>
                      {option.label}
                    </span>
                    {option.count !== undefined && (
                      <span className="shrink-0 font-mono text-xs text-slate-400">{option.count}</span>
                    )}
                  </button>
                );
              })}
              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={onClear}
                  className="focus-ring mt-1 w-full rounded-md border-t border-hairline px-2 py-1.5 text-left text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
                >
                  Clear {label.toLowerCase()}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
