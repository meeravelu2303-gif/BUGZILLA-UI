import { Check, ChevronDown, Plus, Search, X } from 'lucide-react';
import { RequiredMark } from '../ui/Field';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  error?: string;
  hint?: string;
  id?: string;
  required?: boolean;
}

interface Row {
  kind: 'option' | 'custom';
  value: string;
}

const familyOf = (value: string) => value.split('.')[0];

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

export function ClassificationPicker({
  label,
  value,
  onChange,
  options,
  placeholder,
  error,
  hint,
  id,
  required,
}: Props) {
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

  const normalizedQuery = query.trim().toLowerCase();

  const groups = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const option of options) {
      if (normalizedQuery && !option.toLowerCase().includes(normalizedQuery)) continue;
      const family = familyOf(option);
      out.set(family, [...(out.get(family) ?? []), option]);
    }
    return [...out.entries()];
  }, [options, normalizedQuery]);

  const canUseCustom = normalizedQuery !== '' && !options.some((option) => option.toLowerCase() === normalizedQuery);

  const rows = useMemo<Row[]>(() => {
    const optionRows: Row[] = groups.flatMap(([, items]) =>
      items.map((optionValue) => ({ kind: 'option' as const, value: optionValue })),
    );
    if (canUseCustom) optionRows.push({ kind: 'custom', value: query.trim() });
    return optionRows;
  }, [groups, canUseCustom, query]);

  const matchCount = groups.reduce((total, [, items]) => total + items.length, 0);

  useEffect(() => {
    if (!open) return;
    const i = rows.findIndex((row) => row.value === value);
    setActive(i >= 0 && !normalizedQuery ? i : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, normalizedQuery]);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      const clickTarget = event.target as Node;
      if (!rootRef.current?.contains(clickTarget) && !panelRef.current?.contains(clickTarget)) close(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const domRect = triggerRef.current?.getBoundingClientRect();
      if (!domRect) return;
      const panelHeight = 400;
      const below = window.innerHeight - domRect.bottom;
      const up = below < panelHeight && domRect.top > below;
      setPanelStyle({
        position: 'fixed',
        left: domRect.left,
        width: domRect.width,
        ...(up ? { bottom: window.innerHeight - domRect.top + 6 } : { top: domRect.bottom + 6 }),
      });
    }
    place();
    searchRef.current?.focus({ preventScroll: true });
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!list || !row) return;
    const header = 28;
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

  function choose(chosenValue: string) {
    onChange(chosenValue);
    close();
  }

  function onSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((currentActive) => Math.min(currentActive + 1, rows.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((currentActive) => Math.max(currentActive - 1, 0));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActive(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActive(rows.length - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (rows[active]) choose(rows[active].value);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
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
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
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
            <span className="shrink-0 rounded-md bg-slate-900/[0.06] px-1.5 py-0.5 text-[0.7333rem] font-medium uppercase tracking-wide text-slate-600">
              {familyOf(value)}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-[0.8667rem] text-slate-900">
              {value.includes('.') ? value.slice(familyOf(value).length + 1) : value}
            </span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate font-mono text-[0.8667rem] text-slate-500">
            {placeholder ?? 'Select…'}
          </span>
        )}
        {value && (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear classification"
            onClick={(event) => {
              event.stopPropagation();
              onChange('');
            }}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-900/5 hover:text-slate-700"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-slate-500 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={panelStyle}
            className="z-[60] overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-900/10"
          >
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
                onChange={(event) => setQuery(event.target.value)}
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

            <div
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label={label}
              className="max-h-72 overflow-y-auto overscroll-contain py-1"
            >
              {groups.map(([family, items]) => (
                <div key={family} role="group" aria-label={family}>
                  <div className="sticky top-0 z-10 flex items-center justify-between bg-white/95 px-3 pb-1 pt-2 text-[0.7333rem] font-semibold uppercase tracking-wider text-slate-500 backdrop-blur">
                    <span>{family}</span>
                    <span className="font-medium normal-case tracking-normal text-slate-400">{items.length}</span>
                  </div>
                  {items.map((item) => {
                    index += 1;
                    const i = index;
                    const selected = item === value;
                    return (
                      <div
                        key={item}
                        id={`${baseId}-row-${i}`}
                        data-index={i}
                        role="option"
                        aria-selected={selected}
                        onMouseEnter={() => setActive(i)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => choose(item)}
                        className={cn(
                          'mx-1 flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 font-mono text-[0.8667rem]',
                          i === active ? 'bg-brand-600/10 text-brand-900' : 'text-slate-700',
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          <span className="text-slate-400">{family}.</span>
                          <Highlight text={item.slice(family.length + 1)} query={normalizedQuery} />
                        </span>
                        {selected && <Check className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />}
                      </div>
                    );
                  })}
                </div>
              ))}

              {matchCount === 0 && !canUseCustom && (
                <p className="px-3 py-6 text-center text-sm text-slate-500">No classifications.</p>
              )}

              {canUseCustom && (
                <div className={cn(matchCount > 0 && 'mt-1 border-t border-hairline pt-1')}>
                  {matchCount === 0 && (
                    <p className="px-3 pb-1 pt-2 text-xs text-slate-500">No match in the bench's list.</p>
                  )}
                  {(() => {
                    const i = rows.length - 1;
                    return (
                      <div
                        id={`${baseId}-row-${i}`}
                        data-index={i}
                        role="option"
                        aria-selected={false}
                        onMouseEnter={() => setActive(i)}
                        onMouseDown={(event) => event.preventDefault()}
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

            <div className="flex items-center justify-between border-t border-hairline bg-slate-50/80 px-3 py-1.5 text-[0.7333rem] text-slate-500">
              <span>
                {matchCount} of {options.length}
              </span>
              <span className="hidden sm:inline">↑↓ to move · Enter to select · Esc to close</span>
            </div>
          </div>,
          document.body,
        )}

      {error ? (
        <p role="alert" className="text-xs font-medium text-rose-600">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-slate-600">{hint}</p>
      ) : null}
    </div>
  );
}
