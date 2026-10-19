import { CalendarDays, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PRESETS, describeRange, matchPreset, monthRange, toDay, type DateField } from '../../lib/dateRange';
import { cn } from '../../lib/utils';

/**
 * The date filter: which bugs were filed (or last changed) in a day, a month or
 * any range. Because the Excel export takes exactly the list's filters, this is
 * also how a daily or monthly report is made - pick the day or month, then
 * Export to Excel.
 */
export function DateRangeFilter({
  field,
  from,
  to,
  onChange,
  className,
}: {
  field: DateField;
  from: string;
  to: string;
  onChange: (range: { field: DateField; from?: string; to?: string }) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const [draftField, setDraftField] = useState<DateField>(field);
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  // Re-seed from the URL each time it opens, so the popover always shows what is applied.
  useEffect(() => {
    if (!open) return;
    setDraftField(field);
    setCustomFrom(from);
    setCustomTo(to);
  }, [open, field, from, to]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = Boolean(from || to);
  const today = toDay(new Date());
  const current = matchPreset({ from: from || undefined, to: to || undefined });
  const singleDay = from && from === to ? from : '';
  const wholeMonth = (() => {
    if (!from || !to) return '';
    const m = from.slice(0, 7);
    const r = monthRange(m);
    return r.from === from && r.to === to ? m : '';
  })();

  function apply(range: { from?: string; to?: string }, close = true) {
    onChange({ field: draftField, ...range });
    if (close) setOpen(false);
  }

  const customInvalid = Boolean(customFrom && customTo && customFrom > customTo);
  const fieldWord = draftField === 'updated' ? 'updated' : 'filed';

  return (
    <div ref={root} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          'focus-ring flex h-10 w-full items-center justify-between gap-2 rounded-xl border bg-white/85 px-3 text-sm shadow-[inset_0_1px_1px_rgb(15_23_42_/_0.03)] transition-all',
          active
            ? 'border-brand-500 bg-brand-50/60 font-medium text-brand-900 ring-2 ring-brand-500/15'
            : 'border-line text-slate-600 hover:border-slate-500/55 hover:bg-white'
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <CalendarDays className={cn('h-4 w-4 shrink-0', active ? 'text-brand-700' : 'text-slate-400')} aria-hidden />
          <span className="truncate">
            {active ? `${field === 'updated' ? 'Updated' : 'Created'}: ${describeRange({ from: from || undefined, to: to || undefined })}` : 'Any date'}
          </span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      {open && (
        <div role="dialog" aria-label="Filter by date" className="glass-raised absolute left-0 z-30 mt-1.5 w-[22rem] rounded-2xl p-4 animate-toast-in">
          {/* Which date */}
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm" role="radiogroup" aria-label="Date to filter on">
            {(['created', 'updated'] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={draftField === f}
                onClick={() => {
                  setDraftField(f);
                  // Switching the axis of an applied range re-applies it to the new axis.
                  if (active) onChange({ field: f, from: from || undefined, to: to || undefined });
                }}
                className={cn(
                  'focus-ring rounded-md px-2 py-1.5 font-medium transition-colors',
                  draftField === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                )}
              >
                {f === 'created' ? 'Created' : 'Last updated'}
              </button>
            ))}
          </div>

          {/* Quick picks */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => apply(p.range())}
                aria-pressed={current === p.id}
                className={cn(
                  'focus-ring rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors',
                  current === p.id ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Daily and monthly reports */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              A single day
              <input
                type="date"
                max={today}
                value={singleDay}
                onChange={(e) => e.target.value && apply({ from: e.target.value, to: e.target.value })}
                className="focus-ring h-9 rounded-lg border border-hairline px-2 text-sm text-slate-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              A whole month
              <input
                type="month"
                max={today.slice(0, 7)}
                value={wholeMonth}
                onChange={(e) => e.target.value && apply(monthRange(e.target.value))}
                className="focus-ring h-9 rounded-lg border border-hairline px-2 text-sm text-slate-900"
              />
            </label>
          </div>

          {/* Any range */}
          <fieldset className="mt-4 border-t border-hairline pt-3">
            <legend className="text-xs font-medium text-slate-600">Custom range</legend>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                type="date"
                aria-label="From"
                value={customFrom}
                max={customTo || today}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="focus-ring h-9 min-w-0 flex-1 rounded-lg border border-hairline px-2 text-sm text-slate-900"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                aria-label="To"
                value={customTo}
                min={customFrom || undefined}
                max={today}
                onChange={(e) => setCustomTo(e.target.value)}
                className="focus-ring h-9 min-w-0 flex-1 rounded-lg border border-hairline px-2 text-sm text-slate-900"
              />
            </div>
            {customInvalid && <p className="mt-1 text-xs text-rose-600">The start is after the end.</p>}
            <p className="mt-1 text-[11px] text-slate-500">Leave one end empty for an open range. Both days are included.</p>
          </fieldset>

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => apply({})}
              disabled={!active}
              className="focus-ring rounded px-1 text-xs font-medium text-slate-500 hover:text-slate-900 disabled:opacity-40"
            >
              Clear date
            </button>
            <button
              type="button"
              onClick={() => apply({ from: customFrom || undefined, to: customTo || undefined })}
              disabled={customInvalid || (!customFrom && !customTo)}
              className="focus-ring rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-40"
            >
              Apply range
            </button>
          </div>
          <p className="mt-3 border-t border-hairline pt-2 text-[11px] text-slate-500">
            Shows bugs {fieldWord} in the chosen days. <span className="font-medium text-slate-600">Export to Excel</span> then downloads exactly
            these - a daily or monthly report.
          </p>
        </div>
      )}
    </div>
  );
}
