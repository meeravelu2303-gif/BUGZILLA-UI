import { Check, ChevronDown, Plus, Search, X } from 'lucide-react';
import { RequiredMark } from '../ui/Field';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';

/**
 * A searchable, grouped picker for the bug classification.
 *
 * Replaces a <datalist>: that one cannot be searched by anything but a prefix, cannot show group
 * headings, and its styling belongs to the browser. Here the search matches anywhere in the value
 * ("idor" finds security.idor), results are grouped under their family, and a value that matches
 * nothing can still be used as-is - the list is a guide to consistency, not a cage.
 */

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Ordered most relevant first; grouped by the part before the first dot. */
  options: string[];
  placeholder?: string;
  error?: string;
  hint?: string;
  id?: string;
  /** Shows the mandatory-field star after the label. */
  required?: boolean;
}

interface Row {
  kind: 'option' | 'custom';
  value: string;
}

const familyOf = (v: string) => v.split('.')[0];

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-amber-200/70 px-px text-inherit">{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  );
}

export function ClassificationPicker({ label, value, onChange, options, placeholder, error, hint, id, required }: Props) {
  const generated = useId();
  const baseId = id ?? generated;
  const listId = `${baseId}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});

  const q = query.trim().toLowerCase();

  /** Matches grouped by family, families in the order they first appear in `options`. */
  const groups = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const o of options) {
      if (q && !o.toLowerCase().includes(q)) continue;
      const f = familyOf(o);
      out.set(f, [...(out.get(f) ?? []), o]);
    }
    return [...out.entries()];
  }, [options, q]);

  const canUseCustom = q !== '' && !options.some((o) => o.toLowerCase() === q);

  /** Flat, navigable rows in display order - what the arrow keys walk. */
  const rows = useMemo<Row[]>(() => {
    const r: Row[] = groups.flatMap(([, items]) => items.map((v) => ({ kind: 'option' as const, value: v })));
    if (canUseCustom) r.push({ kind: 'custom', value: query.trim() });
    return r;
  }, [groups, canUseCustom, query]);

  const matchCount = groups.reduce((n, [, items]) => n + items.length, 0);

  useEffect(() => {
    if (!open) return;
    // Start on the current value if it is listed, so reopening shows where you are.
    const i = rows.findIndex((r) => r.value === value);
    setActive(i >= 0 && !q ? i : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, q]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (!rootRef.current?.contains(t) && !panelRef.current?.contains(t)) close(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /*
   * The panel is portalled to <body> and positioned against the trigger. Rendered inside the form it
   * was clipped: every glass card is its own stacking context (backdrop-filter), so the next card
   * painted over the open list. Opens upward when there is not room below.
   */
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const panelHeight = 400;
      const below = window.innerHeight - r.bottom;
      const up = below < panelHeight && r.top > below;
      setPanelStyle({
        position: 'fixed',
        left: r.left,
        width: r.width,
        ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
      });
    }
    place();
    // Not autoFocus: on its first frame the panel is unpositioned at the end of <body>, and
    // focusing it there scrolls the whole page down to it.
    searchRef.current?.focus({ preventScroll: true });
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  // Keep the keyboard-highlighted row in view.
  useEffect(() => {
    if (!open) return;
    // Scrolls the list only - scrollIntoView would also scroll the page behind it.
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!list || !row) return;
    const header = 28; // the sticky family heading sits over the top of the list
    if (row.offsetTop - header < list.scrollTop) list.scrollTop = row.offsetTop - header;
    else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
    }
  }, [active, open]);

  function close(refocus = true) {
    setOpen(false);
    setQuery('');
    if (refocus) triggerRef.current?.focus();
  }

  function choose(v: string) {
    onChange(v);
    close();
  }

  function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, rows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(rows.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (rows[active]) choose(rows[active].value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      close(false);
    }
  }

  let index = -1;

  return (
    <div ref={rootRef} className="relative flex flex-col gap-1.5">
      <label htmlFor={baseId} className="text-sm font-medium text-slate-700">
        {label}
        {required && <RequiredMark />}
      </label>

      <button
        ref={triggerRef}
        id={baseId}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          'focus-ring flex w-full items-center gap-2 rounded-xl border bg-white/80 px-3 py-2 text-left text-sm backdrop-blur-sm transition-colors',
          error ? 'border-rose-400' : open ? 'border-brand-500' : 'border-white/60 hover:border-line',
        )}
      >
        {value ? (
          <>
            <span className="shrink-0 rounded-md bg-slate-900/[0.06] px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-600">
              {familyOf(value)}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-slate-900">
              {value.includes('.') ? value.slice(familyOf(value).length + 1) : value}
            </span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-slate-500">{placeholder ?? 'Select…'}</span>
        )}
        {value && (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear classification"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-900/5 hover:text-slate-700"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-500 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      {open &&
        createPortal(
          <div ref={panelRef} style={panelStyle} className="z-[60] overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-900/10">
            <div className="flex items-center gap-2 border-b border-hairline px-3">
              <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <input
                ref={searchRef}
                role="combobox"
                aria-expanded
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={rows[active] ? `${baseId}-row-${active}` : undefined}
                aria-label={`Search ${label.toLowerCase()}`}
                autoComplete="off"
                spellCheck={false}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onSearchKey}
                placeholder="Search, e.g. idor, token, status…"
                className="h-11 min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="rounded p-0.5 text-slate-400 hover:text-slate-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div ref={listRef} id={listId} role="listbox" aria-label={label} className="max-h-72 overflow-y-auto overscroll-contain py-1">
              {groups.map(([family, items]) => (
                <div key={family} role="group" aria-label={family}>
                  <div className="sticky top-0 z-10 flex items-center justify-between bg-white/95 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 backdrop-blur">
                    <span>{family}</span>
                    <span className="font-medium normal-case tracking-normal text-slate-400">{items.length}</span>
                  </div>
                  {items.map((v) => {
                    index += 1;
                    const i = index;
                    const selected = v === value;
                    return (
                      <div
                        key={v}
                        id={`${baseId}-row-${i}`}
                        data-index={i}
                        role="option"
                        aria-selected={selected}
                        onMouseEnter={() => setActive(i)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => choose(v)}
                        className={cn(
                          'mx-1 flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 font-mono text-[13px]',
                          i === active ? 'bg-brand-600/10 text-brand-900' : 'text-slate-700',
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          <span className="text-slate-400">{family}.</span>
                          <Highlight text={v.slice(family.length + 1)} query={q} />
                        </span>
                        {selected && <Check className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />}
                      </div>
                    );
                  })}
                </div>
              ))}

              {matchCount === 0 && !canUseCustom && <p className="px-3 py-6 text-center text-sm text-slate-500">No classifications.</p>}

              {canUseCustom && (
                <div className={cn(matchCount > 0 && 'mt-1 border-t border-hairline pt-1')}>
                  {matchCount === 0 && <p className="px-3 pb-1 pt-2 text-xs text-slate-500">No match in the bench's list.</p>}
                  {(() => {
                    const i = rows.length - 1;
                    return (
                      <div
                        id={`${baseId}-row-${i}`}
                        data-index={i}
                        role="option"
                        aria-selected={false}
                        onMouseEnter={() => setActive(i)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => choose(query.trim())}
                        className={cn(
                          'mx-1 flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm',
                          i === active ? 'bg-brand-600/10 text-brand-900' : 'text-slate-700',
                        )}
                      >
                        <Plus className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                        <span className="min-w-0 truncate">
                          Use <span className="font-mono font-medium">"{query.trim()}"</span>
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-hairline bg-slate-50/80 px-3 py-1.5 text-[11px] text-slate-500">
              <span>
                {matchCount} of {options.length}
              </span>
              <span className="hidden sm:inline">↑↓ to move · Enter to select · Esc to close</span>
            </div>
          </div>,
          document.body,
        )}

      {error ? <p role="alert" className="text-xs font-medium text-rose-600">{error}</p> : hint ? <p className="text-xs text-slate-600">{hint}</p> : null}
    </div>
  );
}
