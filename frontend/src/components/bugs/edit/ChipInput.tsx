import { Plus, RotateCcw, X } from 'lucide-react';
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../../lib/utils';

export interface ChipSuggestion {
  value: string;
  label: string;
}

interface ChipInputProps<T extends string | number> {
  label: string;
  /** The draft value - what will be saved. */
  values: T[];
  /** The stored value, so removals can be shown struck through and undone. */
  baseline: T[];
  onChange: (next: T[]) => void;
  /** Turns typed text into a value, or returns an error message. */
  parse: (raw: string) => { value: T } | { error: string };
  renderLabel?: (value: T) => ReactNode;
  /** Makes each chip a link - an in-app route or an external URL. */
  hrefFor?: (value: T) => string | undefined;
  placeholder?: string;
  suggestions?: ChipSuggestion[];
  hint?: string;
  emptyText?: string;
  disabled?: boolean;
}

/**
 * Editable list of values (CC, dependencies, aliases, links...).
 *
 * Removing a stored value does not make it vanish: it stays as a struck-through
 * chip with an undo until the bug is saved, so an accidental click on the wrong
 * "x" is visible and reversible rather than a silent change waiting in the save.
 */
export function ChipInput<T extends string | number>({
  label,
  values,
  baseline,
  onChange,
  parse,
  renderLabel = (v) => String(v),
  hrefFor,
  placeholder = 'Add…',
  suggestions,
  hint,
  emptyText = 'None',
  disabled,
}: ChipInputProps<T>) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const inputId = useId();
  const listId = useId();

  const current = new Set(values.map(String));
  const stored = new Set(baseline.map(String));
  // Stored order first, then additions in the order they were made.
  const chips: { value: T; state: 'kept' | 'added' | 'removed' }[] = [
    ...baseline.map((v) => ({ value: v, state: current.has(String(v)) ? ('kept' as const) : ('removed' as const) })),
    ...values.filter((v) => !stored.has(String(v))).map((v) => ({ value: v, state: 'added' as const })),
  ];

  function commit(raw: string) {
    const parts = raw.split(/[\s,;]+/).filter(Boolean);
    if (!parts.length) return;
    const next = [...values];
    for (const part of parts) {
      const result = parse(part);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      if (!next.map(String).includes(String(result.value))) next.push(result.value);
    }
    onChange(next);
    setText('');
    setError('');
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit(text);
    } else if (e.key === 'Backspace' && !text && values.length) {
      onChange(values.slice(0, -1));
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
        {label}
      </label>

      {chips.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={`${label} values`}>
          {chips.map(({ value, state }) => {
            const href = hrefFor?.(value);
            const content = renderLabel(value);
            const isExternal = href?.startsWith('http');
            return (
              <li
                key={String(value)}
                className={cn(
                  'group inline-flex max-w-full items-center gap-1 rounded-lg py-0.5 pl-2 pr-1 text-xs font-medium ring-1 ring-inset transition-colors',
                  state === 'kept' && 'bg-white/80 text-slate-700 ring-slate-300/70',
                  state === 'added' && 'bg-emerald-50 text-emerald-800 ring-emerald-600/30',
                  state === 'removed' && 'bg-slate-100/60 text-slate-400 line-through ring-slate-200'
                )}
                title={state === 'added' ? 'Added - not saved yet' : state === 'removed' ? 'Removed - not saved yet' : undefined}
              >
                {href && state !== 'removed' ? (
                  isExternal ? (
                    <a href={href} target="_blank" rel="noreferrer noopener" className="truncate hover:underline">
                      {content}
                    </a>
                  ) : (
                    <Link to={href} className="truncate hover:underline">
                      {content}
                    </Link>
                  )
                ) : (
                  <span className="truncate">{content}</span>
                )}
                {!disabled &&
                  (state === 'removed' ? (
                    <button
                      type="button"
                      onClick={() => onChange([...values, value])}
                      className="focus-ring rounded p-0.5 text-slate-500 no-underline hover:bg-slate-200 hover:text-slate-800"
                      aria-label={`Undo removing ${String(value)}`}
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onChange(values.filter((v) => String(v) !== String(value)))}
                      className="focus-ring rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      aria-label={`Remove ${String(value)}`}
                    >
                      <X className="h-3 w-3" aria-hidden />
                    </button>
                  ))}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">{emptyText}</p>
      )}

      {!disabled && (
        <div className="flex items-center gap-1.5">
          <input
            id={inputId}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError('');
            }}
            onKeyDown={onKeyDown}
            onBlur={() => text.trim() && commit(text)}
            placeholder={placeholder}
            list={suggestions?.length ? listId : undefined}
            aria-invalid={error ? true : undefined}
            className={cn(
              'focus-ring w-full rounded-lg border border-white/60 bg-white/80 px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-500',
              error && 'border-rose-400'
            )}
          />
          <button
            type="button"
            onClick={() => commit(text)}
            disabled={!text.trim()}
            className="focus-ring shrink-0 rounded-lg p-1.5 text-brand-700 hover:bg-brand-50 disabled:opacity-40"
            aria-label={`Add to ${label}`}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </button>
          {suggestions?.length ? (
            <datalist id={listId}>
              {suggestions
                .filter((s) => !current.has(s.value))
                .map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
            </datalist>
          ) : null}
        </div>
      )}
      {error ? <p className="text-xs text-rose-600">{error}</p> : hint ? <p className="text-xs text-slate-600">{hint}</p> : null}
    </div>
  );
}
