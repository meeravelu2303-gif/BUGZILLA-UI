import { AlertTriangle, MessageSquarePlus, RefreshCw, Save, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { FIELD_LABELS, type BugEditor } from '../../../lib/useBugEditor';
import { cn } from '../../../lib/utils';
import { Button } from '../../ui/Button';

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

/**
 * The single place a bug edit is committed.
 *
 * Every field on the page stages into one draft and this bar saves it as ONE
 * Bugzilla update, so the history shows one coherent change ("resolved as
 * FIXED, cleared deadline, removed Ana from CC") with an optional comment
 * explaining it - rather than a separate entry per dropdown.
 */
export function SaveBar({
  editor,
  saving,
  conflict,
  onSave,
  onReloadLatest,
  privateComments,
  inline = false,
}: {
  /** Render inside the Details panel (under "Created") instead of floating over the page. */
  inline?: boolean;
  editor: BugEditor;
  saving: boolean;
  /** Set when the last save was refused because someone else saved first. */
  conflict: boolean;
  onSave: () => void;
  onReloadLatest: () => void;
  privateComments: boolean;
}) {
  const [showComment, setShowComment] = useState(false);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const hasComment = editor.comment.body.trim() !== '';
  const visible = editor.dirty.length > 0 || hasComment || conflict;

  const labels = [...new Set(editor.dirty.map((k) => FIELD_LABELS[k]))];
  const errorList = Object.entries(editor.errors).filter(([k]) => editor.isDirty(k as never) || k === 'resolution' || k === 'dupeOf');
  const blocked = errorList.length > 0;

  // Ctrl/Cmd+S saves from anywhere on the page, instead of the browser's "save page as".
  useEffect(() => {
    if (!visible) return;
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!blocked && !saving && !conflict) onSave();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, blocked, saving, conflict, onSave]);

  // Closing the tab or reloading with unsaved edits asks first.
  useEffect(() => {
    if (!visible) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [visible]);

  useEffect(() => {
    if (showComment) commentRef.current?.focus();
  }, [showComment]);

  // A move that needs a comment (reopening) opens the comment box by itself.
  useEffect(() => {
    if (editor.commentRequired) setShowComment(true);
  }, [editor.commentRequired]);

  if (!visible) return null;

  const count = labels.length;

  return (
    /*
     * Inline (the bug page): a section at the foot of the Details panel, right
     * under "Created", next to the fields being edited. Otherwise it floats.
     */
    <div
      className={
        inline
          ? 'border-t border-hairline'
          : 'pointer-events-none fixed inset-x-0 top-[4.75rem] z-40 flex justify-center px-4 sm:px-6 lg:pl-[calc(15rem+1.5rem)] xl:pl-[calc(17rem+1.5rem)]'
      }
    >
      <div
        role="region"
        aria-label="Unsaved changes"
        className={inline ? 'bg-brand-50/50' : 'pointer-events-auto w-full max-w-3xl animate-toast-in glass-raised rounded-2xl'}
      >
        {conflict && (
          <div className="flex flex-wrap items-center gap-3 rounded-t-2xl border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            <p className="min-w-0 flex-1">
              <span className="font-semibold">Someone else just updated this bug.</span> Load their changes - your edits stay in place - then
              save again.
            </p>
            <Button size="sm" variant="secondary" onClick={onReloadLatest}>
              <RefreshCw className="h-3.5 w-3.5" /> Load their changes
            </Button>
          </div>
        )}

        {showComment && (
          <div className="border-b border-hairline px-4 pt-3">
            <label htmlFor="save-comment" className="text-xs font-medium text-slate-600">
              {editor.commentRequired
                ? editor.draft.status === 'REOPENED'
                  ? 'Why reopen? What still fails after the fix - required'
                  : editor.draft.status === 'PENDING_APPROVAL'
                    ? 'Why does this need approval? (e.g. not in the requirements) - required'
                    : editor.draft.status === 'IN_REVIEW'
                      ? 'Link the pull request / commit the team lead should review - required'
                      : editor.baseline.status === 'IN_REVIEW' && editor.draft.status === 'IN_PROGRESS'
                        ? 'What did the review ask to change? - required'
                        : editor.baseline.status === 'IN_REVIEW'
                          ? 'Review approved and deployed - note the release or build - required'
                    : editor.draft.status === 'AWAITING_REQUIREMENT'
                      ? 'Which requirement is missing, and who will raise it? - required'
                      : editor.baseline.status === 'AWAITING_REQUIREMENT'
                        ? 'The requirement that was raised (ID or link), or why it was dropped - required'
                        : editor.baseline.status === 'PENDING_APPROVAL'
                          ? "The project manager's decision - required"
                          : 'Comment - required for this status change'
                : 'Comment - saved with this change, so the history says why'}
            </label>
            <textarea
              id="save-comment"
              ref={commentRef}
              value={editor.comment.body}
              onChange={(e) => editor.setComment({ ...editor.comment, body: e.target.value })}
              rows={3}
              placeholder="e.g. Fixed in build 2.4.1 - verified on Chrome and Firefox."
              className="focus-ring mt-1 w-full resize-y rounded-xl border border-hairline bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
            />
            {privateComments && (
              <label className="mb-2 mt-1 inline-flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={editor.comment.isPrivate}
                  onChange={(e) => editor.setComment({ ...editor.comment, isPrivate: e.target.checked })}
                  className="rounded border-line text-brand-700 focus:ring-brand-600"
                />
                Private - visible to the insider group only
              </label>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">
              {count > 0 ? `${count} unsaved ${count === 1 ? 'change' : 'changes'}` : hasComment ? 'New comment' : 'Nothing to save'}
            </p>
            {blocked ? (
              <p className="mt-0.5 truncate text-xs text-rose-600" title={errorList.map(([, m]) => m).join(' ')}>
                {errorList.length === 1 ? errorList[0][1] : `${errorList.length} fields need attention - ${errorList[0][1]}`}
              </p>
            ) : (
              <p className="mt-0.5 truncate text-xs text-slate-500" title={labels.join(', ')}>
                {labels.join(' · ') || 'Your comment will be posted on its own.'}
              </p>
            )}
          </div>

          <div className={cn('flex shrink-0 items-center gap-1.5', inline && 'w-full justify-end')}>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowComment((v) => !v)}
              aria-pressed={showComment}
              className={cn(hasComment && 'text-brand-700')}
              title="Add a comment to this change"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{hasComment ? 'Comment added' : 'Comment'}</span>
            </Button>
            <Button size="sm" variant="secondary" onClick={editor.reset} disabled={saving} title="Discard every unsaved change">
              <Undo2 className="h-3.5 w-3.5" /> Discard
            </Button>
            <Button size="sm" onClick={onSave} loading={saving} disabled={blocked || conflict} title={`Save (${isMac ? '⌘' : 'Ctrl'}+S)`}>
              {!saving && <Save className="h-3.5 w-3.5" />} Save
              <kbd className="ml-1 hidden rounded bg-white/20 px-1 text-[0.6667rem] font-medium sm:inline">{isMac ? '⌘S' : 'Ctrl S'}</kbd>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
