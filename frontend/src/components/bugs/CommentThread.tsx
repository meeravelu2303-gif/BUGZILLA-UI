import { FilePenLine, Plus, Tag, X } from 'lucide-react';
import { DescriptionReport } from './DescriptionReport';
import { useId, useState } from 'react';
import { ApiError } from '../../api/client';
import { useCommentTagSuggestions, useUpdateCommentTags } from '../../api/hooks';
import { useDebounce } from '../../lib/useDebounce';
import { useToast } from '../../context/ToastContext';
import type { Comment } from '../../types';
import { formatDateTime } from '../../lib/utils';
import { Avatar } from '../ui/Avatar';

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
        <span key={t} className="inline-flex items-center gap-1 rounded-md bg-sky-50 py-0.5 pl-1.5 pr-1 text-[11px] font-medium text-sky-800 ring-1 ring-inset ring-sky-600/20">
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
              className="focus-ring w-24 rounded-md border border-sky-200 bg-white px-1.5 py-0.5 text-[11px]"
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
            className="focus-ring inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-white/80 hover:text-slate-800"
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
        <li key={comment.id} className="flex gap-3">
          <Avatar name={comment.author} size="md" />
          <div className="min-w-0 flex-1 rounded-xl border border-white/50 bg-white/50">
            <div className="flex items-center justify-between gap-3 rounded-t-xl border-b border-white/40 bg-white/40 px-4 py-2">
              <span className="text-sm font-medium text-slate-900">
                {comment.author}
                {comment.isPrivate && <span className="ml-2 rounded bg-amber-100 px-1.5 py-px text-[10px] font-semibold uppercase text-amber-800">Private</span>}
              </span>
              <time dateTime={comment.creationTime} className="text-xs text-slate-600">
                {formatDateTime(comment.creationTime)}
              </time>
            </div>
            <p className="whitespace-pre-wrap px-4 py-3 text-sm text-slate-700">{comment.text}</p>
            <CommentTags bugId={bugId} comment={comment} editable={tagsEnabled} />
          </div>
        </li>
        )
      )}
    </ol>
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
          <div className="mt-3 rounded-xl border border-slate-200 bg-white/70 p-4">
            <DescriptionReport description={body} />
          </div>
        )}
      </div>
    </li>
  );
}
