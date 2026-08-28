import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

export interface MultiSelectOption {
  value: string;
  label: string;
  /** Optional right-aligned hint, e.g. how many bugs carry this value. */
  count?: number;
}

/**
 * A checkbox popover for one filter axis. Selecting several values within an
 * axis means OR; separate axes AND, which is what the backend query builds.
 *
 * Built from primitives rather than a dropdown library: the app has no
 * component library and adding one for a single control would be a new runtime
 * dependency for a checkbox list.
 */
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

  // Close on outside click and on Escape - a popover that can only be dismissed
  // by clicking its own trigger feels broken.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const summary = selected.length === 0 ? `All ${label.toLowerCase()}` : selected.length === 1 ? selected[0] : `${label} (${selected.length})`;

  return (
    <div ref={root} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          'focus-ring flex h-9 w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 text-sm transition-colors',
          // An active facet is marked with the brand teal, so which controls are
          // narrowing the list is visible without reading every label.
          selected.length > 0
            ? 'border-brand-500 font-medium text-slate-900'
            : 'border-slate-200 text-slate-500 hover:border-slate-300'
        )}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable
          className="absolute left-0 z-30 mt-1.5 max-h-72 w-64 overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
        >
          {options.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-500">Nothing to filter by yet.</p>
          ) : (
            <>
              {options.map((opt) => {
                const isOn = selected.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isOn}
                    onClick={() => onToggle(opt.value)}
                    className="focus-ring flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-slate-50"
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                        isOn ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white'
                      )}
                    >
                      {isOn && <Check className="h-3 w-3" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-slate-700" title={opt.label}>
                      {opt.label}
                    </span>
                    {opt.count !== undefined && <span className="shrink-0 font-mono text-xs text-slate-400">{opt.count}</span>}
                  </button>
                );
              })}
              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={onClear}
                  className="focus-ring mt-1 w-full rounded-md border-t border-slate-100 px-2 py-1.5 text-left text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
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
