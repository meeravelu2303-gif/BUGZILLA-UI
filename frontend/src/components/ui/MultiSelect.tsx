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
          'focus-ring flex w-full items-center justify-between gap-2 rounded-xl border bg-white/80 px-3 py-2 text-sm backdrop-blur-sm',
          selected.length > 0 ? 'border-brand-600/40 text-slate-900' : 'border-white/60 text-slate-700'
        )}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-500 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable
          className="absolute left-0 z-30 mt-1 max-h-72 w-64 overflow-auto rounded-xl border border-white/60 bg-white/95 p-1 shadow-lg backdrop-blur-md"
        >
          {options.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-600">Nothing to filter by yet.</p>
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
                    className="focus-ring flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100"
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                        isOn ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-400 bg-white'
                      )}
                    >
                      {isOn && <Check className="h-3 w-3" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-slate-800" title={opt.label}>
                      {opt.label}
                    </span>
                    {opt.count !== undefined && <span className="shrink-0 font-mono text-xs text-slate-500">{opt.count}</span>}
                  </button>
                );
              })}
              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={onClear}
                  className="focus-ring mt-1 w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium text-brand-800 hover:bg-brand-50"
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
