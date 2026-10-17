import { Check, Pencil, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { BugEditor } from '../../../lib/useBugEditor';
import { cn } from '../../../lib/utils';

/**
 * The bug title, editable in place. Enter or the tick stages the new title into
 * the shared draft (the save bar commits it with everything else); Escape puts
 * the text back. Staged-but-unsaved titles get the same brand marker as fields.
 */
export function EditableSummary({ editor, readOnly = false }: { editor: BugEditor; readOnly?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(editor.draft.summary);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const changed = editor.isDirty('summary');

  useEffect(() => {
    if (!editing) setText(editor.draft.summary);
  }, [editor.draft.summary, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const trimmed = text.trim();
  const error = !trimmed ? 'A bug needs a summary.' : trimmed.length > 255 ? `${trimmed.length}/255 - too long.` : '';

  function stage() {
    if (error) return;
    editor.set('summary', trimmed);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="mt-2">
        <div className="flex items-start gap-2">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value.replace(/\n/g, ' '))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                stage();
              } else if (e.key === 'Escape') {
                setText(editor.draft.summary);
                setEditing(false);
              }
            }}
            rows={2}
            aria-label="Bug summary"
            aria-invalid={error ? true : undefined}
            className={cn(
              'focus-ring w-full resize-none rounded-xl border border-brand-300 bg-white px-3 py-2 text-xl font-semibold leading-snug tracking-tight text-slate-900',
              error && 'border-rose-400'
            )}
          />
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={stage}
              disabled={Boolean(error)}
              className="focus-ring rounded-lg bg-brand-700 p-2 text-white hover:bg-brand-800 disabled:opacity-40"
              aria-label="Keep this summary"
            >
              <Check className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => {
                setText(editor.draft.summary);
                setEditing(false);
              }}
              className="focus-ring rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              aria-label="Cancel editing the summary"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
        <p className={cn('mt-1 text-xs', error ? 'text-rose-600' : 'text-slate-500')}>
          {error || `Enter to keep, Esc to cancel · ${trimmed.length}/255`}
        </p>
      </div>
    );
  }

  return (
    <div className={cn('group mt-2 flex items-start gap-2', changed && 'relative pl-3 before:absolute before:inset-y-1 before:left-0 before:w-[3px] before:rounded-full before:bg-brand-500')}>
      <h1 className="text-[1.6rem] font-semibold leading-snug tracking-tight text-slate-900">{editor.draft.summary}</h1>
      {!readOnly && <button
        type="button"
        onClick={() => setEditing(true)}
        className="focus-ring mt-1.5 shrink-0 rounded-lg p-1.5 text-slate-400 opacity-0 transition-opacity hover:bg-white hover:text-slate-700 focus-visible:opacity-100 group-hover:opacity-100"
        aria-label="Edit summary"
        title="Edit summary"
      >
        <Pencil className="h-4 w-4" aria-hidden />
      </button>}
    </div>
  );
}
