import { FilePenLine, Pencil, Plus, Tag, X } from 'lucide-react';
import { DescriptionReport } from './DescriptionReport';
import { useId, useState } from 'react';
import { ApiError } from '../../api/client';
import { useCommentHistory, useCommentTagSuggestions, useEditComment, useUpdateCommentTags } from '../../api/hooks';
import { Button } from '../ui/Button';
import { useDebounce } from '../../lib/useDebounce';
import { useToast } from '../../context/ToastContext';
import type { Comment } from '../../types';
import { formatDateTime } from '../../lib/utils';
import { Avatar } from '../ui/Avatar';
import { Linkify } from '../ui/Linkify';

/**
 * Tags on one comment ("needs-info", "repro", ...). Saved immediately - unlike
 * bug fields, a tag is not part of the bug's change history, so there is
 * nothing for the save bar to batch it with.
 */
function CommentTags({ bugId, comment, editable }: { bugId: number; comment: Comment; editable: boolean }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const listId = useId();
  const update = useUpdateCommentTags(bugId);
  const { toast } = useToast();
  const debounced = useDebounce(text, 250);
  const { data: suggestions } = useCommentTagSuggestions(debounced, adding);

  async function change(add?: string[], remove?: string[]) {
    try {
      await update.mutateAsync({ commentId: comment.id, add, remove });
    } catch (err) {
      toast({ variant: 'error', title: 'Could not update tags', description: err instanceof ApiError ? err.message : 'Please try again.' });
    }
  }

  function commit() {
    const tag = text.trim();
    if (!tag) return setAdding(false);
    if (/[\s,]/.test(tag) || tag.length > 24) {
      toast({ variant: 'error', title: 'Invalid tag', description: 'Tags are one word, up to 24 characters.' });
      return;
    }
    void change([tag]);
    setText('');
    setAdding(false);
  }

  if (!editable && comment.tags.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
      {comment.tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-md bg-sky-50 py-0.5 pl-1.5 pr-1 text-[0.7333rem] font-medium text-sky-800 ring-1 ring-inset ring-sky-600/20">
          <Tag className="h-3 w-3" aria-hidden />
          {t}
          {editable && (
            <button
              type="button"
              onClick={() => change(undefined, [t])}
              className="focus-ring rounded p-0.5 text-sky-500 hover:bg-sky-100 hover:text-sky-900"
              aria-label={`Remove tag ${t}`}
            >
              <X className="h-2.5 w-2.5" aria-hidden />
            </button>
          )}
        </span>
      ))}
      {editable &&
        (adding ? (
          <>
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commit();
                } else if (e.key === 'Escape') {
                  setText('');
                  setAdding(false);
                }
              }}
              onBlur={commit}
              list={listId}
              placeholder="tag"
              aria-label="New tag"
              className="focus-ring w-24 rounded-md border border-sky-200 bg-white px-1.5 py-0.5 text-[0.7333rem]"
            />
            <datalist id={listId}>
              {(suggestions?.tags ?? []).filter((s) => !comment.tags.includes(s)).map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={update.isPending}
            className="focus-ring inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[0.7333rem] font-medium text-slate-500 hover:bg-white/80 hover:text-slate-800"
          >
            <Plus className="h-3 w-3" aria-hidden /> Tag
          </button>
        ))}
    </div>
  );
}

export function CommentThread({ bugId, comments, tagsEnabled = false }: { bugId: number; comments: Comment[]; tagsEnabled?: boolean }) {
  const followUps = comments.filter((c) => c.count > 0);

  if (followUps.length === 0) {
    return <p className="px-5 py-6 text-center text-sm text-slate-600">No comments yet. Be the first to add one.</p>;
  }

  return (
    <ol className="flex flex-col gap-4 px-5 py-4">
      {followUps.map((comment) =>
        comment.isReportRevision ? (
          <ReportRevisionEntry key={comment.id} comment={comment} />
        ) : (
          <DiscussionComment key={comment.id} bugId={bugId} comment={comment} tagsEnabled={tagsEnabled} />
        )
      )}
    </ol>
  );
}

/**
 * One discussion comment. Its author can correct it in place (Edit); once
 * edited it says so, and anyone can open the earlier versions - an edit never
 * hides what was said before.
 */
function DiscussionComment({ bugId, comment, tagsEnabled }: { bugId: number; comment: Comment; tagsEnabled: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.text);
  const [showVersions, setShowVersions] = useState(false);
  const edit = useEditComment(bugId);
  const history = useCommentHistory(bugId, comment.id, showVersions);
  const { toast } = useToast();
  const changed = draft.trim() !== comment.text.trim();

  async function save() {
    if (!draft.trim()) return toast({ variant: 'error', title: 'A comment cannot be empty' });
    if (!changed) return setEditing(false);
    try {
      await edit.mutateAsync({ commentId: comment.id, text: draft.trim() });
      toast({ variant: 'success', title: 'Comment updated', description: 'The earlier version is kept - anyone can view it.' });
      setEditing(false);
    } catch (err) {
      toast({ variant: 'error', title: 'Could not update the comment', description: err instanceof ApiError ? err.message : 'Please try again.' });
    }
  }

  return (
    <li className="flex gap-3">
      <Avatar name={comment.author} size="md" />
      <div className="min-w-0 flex-1 rounded-xl border border-white/50 bg-white/50">
        <div className="flex items-center justify-between gap-3 rounded-t-xl border-b border-white/40 bg-white/40 px-4 py-2">
          <span className="text-sm font-medium text-slate-900">
            {comment.author}
            {comment.isPrivate && <span className="ml-2 rounded bg-amber-100 px-1.5 py-px text-[0.6667rem] font-semibold uppercase text-amber-800">Private</span>}
          </span>
          <span className="flex items-center gap-2 text-xs text-slate-600">
            {comment.edited && (
              <button
                type="button"
                onClick={() => setShowVersions((v) => !v)}
                aria-expanded={showVersions}
                title={`Edited ${comment.edited.count} time${comment.edited.count === 1 ? '' : 's'}, last on ${formatDateTime(comment.edited.lastEditedAt)}`}
                className="focus-ring rounded italic text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
              >
                edited
              </button>
            )}
            <time dateTime={comment.creationTime}>{formatDateTime(comment.creationTime)}</time>
            {comment.canEdit && !editing && (
              <button
                type="button"
                onClick={() => {
                  setDraft(comment.text);
                  setEditing(true);
                }}
                aria-label="Edit your comment"
                className="focus-ring inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-slate-500 hover:bg-white/80 hover:text-brand-700"
              >
                <Pencil className="h-3 w-3" aria-hidden /> Edit
              </button>
            )}
          </span>
        </div>
        {editing ? (
          <div className="flex flex-col gap-2 px-4 py-3">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void save();
                } else if (e.key === 'Escape') {
                  setEditing(false);
                }
              }}
              rows={Math.min(14, Math.max(3, draft.split('\n').length + 1))}
              aria-label="Edit comment"
              className="focus-ring w-full resize-y rounded-xl border border-hairline bg-white px-3 py-2 text-sm leading-6 text-slate-900"
            />
            <div className="flex items-center justify-end gap-2">
              <span className="mr-auto text-xs text-slate-500">The earlier version stays visible under "edited". No email is sent.</span>
              <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(false)} disabled={edit.isPending}>
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={() => void save()} loading={edit.isPending} disabled={!changed || !draft.trim()}>
                Save comment
              </Button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap px-4 py-3 text-sm text-slate-700 [overflow-wrap:anywhere]">
            <Linkify text={comment.text} />
          </p>
        )}
        {showVersions && comment.edited && (
          <div className="mx-4 mb-3 flex flex-col gap-2 rounded-lg border border-hairline bg-slate-50/80 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Earlier versions</p>
            {history.isLoading && <p className="text-xs text-slate-500">Loading…</p>}
            {history.isError && <p className="text-xs text-rose-600">Could not load the earlier versions.</p>}
            {history.data?.versions.map((v, i) => (
              <div key={i} className="border-t border-hairline pt-2 first:border-t-0 first:pt-0">
                <p className="text-xs text-slate-500">Until {formatDateTime(v.replacedAt)} (changed by {v.editor})</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600 [overflow-wrap:anywhere]">
                  <Linkify text={v.text} />
                </p>
              </div>
            ))}
          </div>
        )}
        <CommentTags bugId={bugId} comment={comment} editable={tagsEnabled} />
      </div>
    </li>
  );
}

/**
 * A saved version of the bug report. Shown as one line in the thread rather than
 * a wall of text - the current version is already the Description above - with
 * the full version a click away, so "what did the report say before?" is answerable.
 */
function ReportRevisionEntry({ comment }: { comment: Comment }) {
  const [open, setOpen] = useState(false);
  const note = /\n\nEdit note: (.+)$/.exec(comment.text)?.[1];
  const body = note ? comment.text.slice(0, comment.text.lastIndexOf('\n\nEdit note: ')) : comment.text;
  return (
    <li className="flex gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200">
        <FilePenLine className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <p className="text-sm text-slate-700">
          <span className="font-medium text-slate-900">{comment.author}</span> edited the bug report
          <time dateTime={comment.creationTime} className="ml-2 text-xs text-slate-500">
            {formatDateTime(comment.creationTime)}
          </time>
        </p>
        {note && <p className="mt-0.5 text-sm italic text-slate-600">“{note}”</p>}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="focus-ring mt-1 rounded text-xs font-medium text-brand-700 hover:underline"
        >
          {open ? 'Hide this version' : 'View this version'}
        </button>
        {open && (
          <div className="mt-3 rounded-xl border border-hairline bg-white/70 p-4">
            <DescriptionReport description={body} />
          </div>
        )}
      </div>
    </li>
  );
}
