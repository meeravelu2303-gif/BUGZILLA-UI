import { AlertTriangle, Code2, Eye, FileText, Plus, RefreshCw, Save, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type TextareaHTMLAttributes } from 'react';
import { ApiError } from '../../api/client';
import { useUpdateReport } from '../../api/hooks';
import { useToast } from '../../context/ToastContext';
import {
  REPORT_FIELDS,
  getField,
  otherSegments,
  parseReport,
  serializeReport,
  setField,
  setSegmentBody,
  syncCategoryLine,
  type ReportDoc,
  type ReportField,
} from '../../lib/reportDoc';
import { cn } from '../../lib/utils';
import { CATEGORIES, type Bug } from '../../types';
import { Button } from '../ui/Button';
import { DescriptionReport } from './DescriptionReport';

type Mode = 'form' | 'raw' | 'preview';

const GROUPS: Array<{ id: ReportField['group']; title: string; hint: string }> = [
  { id: 'overview', title: 'Overview', hint: 'What kind of defect this is and where it lives.' },
  { id: 'reproduce', title: 'Reproduce', hint: 'How a developer sees it for themselves.' },
  { id: 'result', title: 'Result', hint: 'What should have happened, and what did.' },
  { id: 'developer', title: 'For the developer', hint: 'Impact and the fix.' },
];

/** A textarea that grows with its content (up to a cap), so short fields stay short. */
function AutoTextarea({ value, minRows = 2, maxRows = 18, className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; minRows?: number; maxRows?: number }) {
  const rows = Math.min(maxRows, Math.max(minRows, value.split('\n').length + (value.length > 90 ? Math.floor(value.length / 90) : 0)));
  return <textarea value={value} rows={rows} className={cn('focus-ring w-full resize-y rounded-xl border px-3 py-2 text-sm', className)} {...props} />;
}

function FieldEditor({
  field,
  value,
  original,
  onChange,
  onRemove,
}: {
  field: ReportField;
  value: string;
  original: string;
  onChange: (v: string) => void;
  onRemove?: () => void;
}) {
  const changed = value !== original;
  const id = `report-${field.key}`;
  return (
    <div className={cn('flex flex-col gap-1.5', changed && 'relative pl-3 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-full before:bg-brand-500')}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {field.label}
          {changed && <span className="ml-2 text-[11px] font-medium text-brand-700">edited</span>}
        </label>
        {onRemove && value && (
          <button type="button" onClick={onRemove} className="focus-ring rounded text-xs text-slate-400 hover:text-rose-600">
            Remove section
          </button>
        )}
      </div>
      {field.kind === 'line' ? (
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="focus-ring h-9 w-full rounded-xl border border-hairline bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400"
        />
      ) : (
        <AutoTextarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          spellCheck={field.kind !== 'code'}
          minRows={field.kind === 'code' ? 3 : 2}
          className={
            field.kind === 'code'
              ? 'border-slate-800 bg-slate-900 font-mono text-[12.5px] leading-relaxed text-slate-100 placeholder:text-slate-500'
              : 'border-hairline bg-white leading-6 text-slate-900 placeholder:text-slate-400'
          }
        />
      )}
    </div>
  );
}

/**
 * Edits the WHOLE bug report - classification, category, endpoint, summary,
 * steps, curl, expected/actual, response body, how to fix, and any other
 * section - as named fields, as raw text, or previewed exactly as the bug page
 * will show it. Saved as a report revision (see backend lib/reportRevision.ts).
 */
export function ReportEditor({ bug, onClose }: { bug: Bug; onClose: () => void }) {
  const originalText = bug.description ?? '';
  const originalDoc = useMemo(() => parseReport(originalText), [originalText]);
  const originalCategory = bug.triage?.category ?? 'Unclassified';

  const [doc, setDoc] = useState<ReportDoc>(originalDoc);
  const [rawText, setRawText] = useState<string | null>(null);
  const [category, setCategory] = useState<string>(originalCategory);
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<Mode>('form');
  const [conflict, setConflict] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const save = useUpdateReport(bug.id);
  const { toast } = useToast();
  // The report version this edit started from; cleared by "Save anyway" to overwrite a newer one.
  const baseRevisions = useRef<number | undefined>(bug.reportHistory?.revisions ?? 0);

  const text = rawText ?? serializeReport(doc);
  const textChanged = text.trim() !== serializeReport(originalDoc).trim();
  const categoryChanged = category !== originalCategory;
  const dirty = textChanged || categoryChanged;

  // Leaving with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  function switchMode(next: Mode) {
    // Raw edits are folded back into sections when leaving the raw view.
    if (mode === 'raw' && rawText !== null) {
      setDoc(parseReport(rawText));
      setRawText(null);
    }
    if (next === 'raw') setRawText(serializeReport(doc));
    setMode(next);
  }

  function changeCategory(next: string) {
    setCategory(next);
    setDoc((d) => syncCategoryLine(d, next));
  }

  async function onSave() {
    if (!dirty || save.isPending) return;
    try {
      const res = await save.mutateAsync({
        text,
        ...(categoryChanged ? { category } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(baseRevisions.current !== undefined ? { baseRevisions: baseRevisions.current } : {}),
      });
      toast({
        variant: 'success',
        title: 'Bug report updated',
        description: [res.textChanged && 'report saved as a new revision', res.categoryChanged && `category set to ${category}`].filter(Boolean).join(' · '),
      });
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CONFLICT' && err.details?.reason === 'MID_AIR_COLLISION') {
        setConflict(true);
        return;
      }
      toast({ variant: 'error', title: 'Could not save the report', description: err instanceof ApiError ? err.message : 'Please try again.' });
    }
  }

  // Ctrl/Cmd+S saves, Escape (with nothing changed) closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void onSave();
      } else if (e.key === 'Escape' && !dirty) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const shown = (f: ReportField) => Boolean(getField(doc, f.key)) || Boolean(getField(originalDoc, f.key)) || added.has(f.key);
  const missing = REPORT_FIELDS.filter((f) => !shown(f));
  const others = otherSegments(doc).filter(({ segment }) => segment.heading !== null || segment.body.trim());
  const originalOthers = new Map(otherSegments(originalDoc).map(({ segment }) => [segment.heading, segment.body]));

  return (
    <div className="flex flex-col gap-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-slate-100 p-1 text-sm" role="tablist" aria-label="Editor view">
          {(
            [
              ['form', 'Fields', FileText],
              ['raw', 'Raw text', Code2],
              ['preview', 'Preview', Eye],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              onClick={() => switchMode(id)}
              className={cn(
                'focus-ring inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-colors',
                mode === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500">{dirty ? 'Unsaved changes' : 'No changes yet'}</span>
      </div>

      {conflict && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">
            <span className="font-semibold">Someone else edited this report while you were editing it.</span> Your edits are still here. Saving
            replaces their version - it stays in the history, so nothing is lost.
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              baseRevisions.current = undefined;
              setConflict(false);
              void onSave();
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Save anyway
          </Button>
        </div>
      )}

      {mode === 'form' && (
        <div className="flex flex-col gap-6">
          {GROUPS.map((group) => {
            const fields = REPORT_FIELDS.filter((f) => f.group === group.id && shown(f));
            if (group.id !== 'overview' && fields.length === 0) return null;
            return (
              <section key={group.id} className="flex flex-col gap-4">
                <header>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{group.title}</h3>
                  <p className="text-xs text-slate-400">{group.hint}</p>
                </header>

                {group.id === 'overview' && (
                  <div className={cn('flex flex-col gap-1.5', categoryChanged && 'relative pl-3 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-full before:bg-brand-500')}>
                    <label htmlFor="report-category" className="text-sm font-medium text-slate-700">
                      Category {categoryChanged && <span className="ml-2 text-[11px] font-medium text-brand-700">edited</span>}
                    </label>
                    <select
                      id="report-category"
                      value={category}
                      onChange={(e) => changeCategory(e.target.value)}
                      className="focus-ring h-9 w-full rounded-xl border border-hairline bg-white px-3 text-sm text-slate-900 sm:w-64"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className={cn('grid gap-4', group.id === 'result' ? 'lg:grid-cols-2' : 'grid-cols-1')}>
                  {fields.map((f) => (
                    <div key={f.key} className={cn(f.kind === 'line' ? '' : 'lg:col-span-1', group.id === 'result' && f.key === 'responseBody' && 'lg:col-span-2')}>
                      <FieldEditor
                        field={f}
                        value={getField(doc, f.key)}
                        original={getField(originalDoc, f.key)}
                        onChange={(v) => setDoc((d) => setField(d, f.key, v))}
                        onRemove={f.key === 'summary' ? undefined : () => setDoc((d) => setField(d, f.key, ''))}
                      />
                    </div>
                  ))}
                </div>
              </section>
            );
          })}

          {others.length > 0 && (
            <section className="flex flex-col gap-4">
              <header>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Other details</h3>
                <p className="text-xs text-slate-400">Everything else in the report - owner, environment, run date and so on.</p>
              </header>
              {others.map(({ index, segment }) => {
                const original = originalOthers.get(segment.heading) ?? '';
                const changed = segment.body !== original;
                return (
                  <div key={`${index}-${segment.heading}`} className={cn('flex flex-col gap-1.5', changed && 'relative pl-3 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-full before:bg-brand-500')}>
                    <label className="text-sm font-medium text-slate-700">{segment.heading ?? 'Notes'}</label>
                    {segment.meta ? (
                      <input
                        value={segment.body}
                        onChange={(e) => setDoc((d) => setSegmentBody(d, index, e.target.value))}
                        className="focus-ring h-9 w-full rounded-xl border border-hairline bg-white px-3 text-sm"
                      />
                    ) : (
                      <AutoTextarea
                        value={segment.body}
                        onChange={(e) => setDoc((d) => setSegmentBody(d, index, e.target.value))}
                        className="border-hairline bg-white leading-6 text-slate-900"
                      />
                    )}
                  </div>
                );
              })}
            </section>
          )}

          {missing.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500">Add a section</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {missing.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setAdded((s) => new Set(s).add(f.key))}
                    className="focus-ring inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-brand-50 hover:text-brand-800 hover:ring-brand-200"
                  >
                    <Plus className="h-3 w-3" aria-hidden /> {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'raw' && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="report-raw" className="text-sm font-medium text-slate-700">
            The whole report as text
          </label>
          <AutoTextarea
            id="report-raw"
            value={rawText ?? ''}
            onChange={(e) => setRawText(e.target.value)}
            minRows={16}
            maxRows={40}
            spellCheck={false}
            className="border-hairline bg-white font-mono text-[12.5px] leading-relaxed text-slate-900"
          />
          <p className="text-xs text-slate-500">
            Keep the <code className="rounded bg-slate-100 px-1">Heading:</code> lines (Expected:, Actual:, curl:, How to fix: …) - the bug page and the Excel export
            read the report by them.
          </p>
        </div>
      )}

      {mode === 'preview' && (
        <div className="rounded-xl border border-dashed border-line p-5">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Preview - as it will appear after saving</p>
          <DescriptionReport description={text} />
        </div>
      )}

      {/* Footer */}
      <div className="flex flex-col gap-3 border-t border-hairline pt-4 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
          Edit note <span className="font-normal text-slate-400">(optional - why, kept in the history)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            placeholder="e.g. Corrected the expected status after re-testing on staging."
            className="focus-ring h-9 rounded-xl border border-hairline bg-white px-3 text-sm font-normal text-slate-900 placeholder:text-slate-400"
          />
        </label>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              if (!dirty || window.confirm('Discard your changes to the report?')) onClose();
            }}
            disabled={save.isPending}
          >
            <X className="h-4 w-4" /> Cancel
          </Button>
          <Button onClick={onSave} loading={save.isPending} disabled={!dirty || !text.trim()} title="Save (Ctrl+S)">
            {!save.isPending && <Save className="h-4 w-4" />} Save report
          </Button>
        </div>
      </div>
    </div>
  );
}
