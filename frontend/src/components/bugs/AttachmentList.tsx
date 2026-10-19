import { Archive, Download, FileText, Image as ImageIcon, Paperclip, Pencil, Video as VideoIcon } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import { useUpdateAttachment } from '../../api/hooks';
import { useToast } from '../../context/ToastContext';
import type { Attachment, UpdateAttachmentInput } from '../../types';
import { cn, formatBytes, formatDateTime } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Input } from '../ui/Field';

function iconFor(contentType: string) {
  if (contentType.startsWith('video/')) return VideoIcon;
  if (contentType.startsWith('image/')) return ImageIcon;
  if (contentType === 'text/plain' || contentType.includes('patch')) return FileText;
  return Paperclip;
}

function AttachmentEditor({
  bugId,
  attachment,
  privateAllowed,
  onDone,
}: {
  bugId: number;
  attachment: Attachment;
  privateAllowed: boolean;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    summary: attachment.summary,
    fileName: attachment.fileName,
    contentType: attachment.contentType,
    isObsolete: attachment.isObsolete,
    isPatch: attachment.isPatch,
    isPrivate: attachment.isPrivate,
  });
  const update = useUpdateAttachment(bugId);
  const { toast } = useToast();

  const errors = {
    summary: form.summary.trim() ? '' : 'A description is required.',
    fileName: form.fileName.trim() ? '' : 'A file name is required.',
    contentType: /^[\w.+-]+\/[\w.+-]+$/.test(form.contentType.trim()) ? '' : 'e.g. image/png or text/plain',
  };
  const input: UpdateAttachmentInput = {};
  if (form.summary.trim() !== attachment.summary) input.summary = form.summary.trim();
  if (form.fileName.trim() !== attachment.fileName) input.fileName = form.fileName.trim();
  if (form.contentType.trim() !== attachment.contentType) input.contentType = form.contentType.trim();
  if (form.isObsolete !== attachment.isObsolete) input.isObsolete = form.isObsolete;
  if (form.isPatch !== attachment.isPatch) input.isPatch = form.isPatch;
  if (privateAllowed && form.isPrivate !== attachment.isPrivate) input.isPrivate = form.isPrivate;
  const changed = Object.keys(input).length > 0;
  const invalid = Object.values(errors).some(Boolean);

  async function save() {
    try {
      await update.mutateAsync({ attachmentId: attachment.id, input });
      toast({ variant: 'success', title: 'Attachment updated' });
      onDone();
    } catch (err) {
      toast({ variant: 'error', title: 'Could not update the attachment', description: err instanceof ApiError ? err.message : 'Please try again.' });
    }
  }

  return (
    <form
      className="ml-12 flex flex-col gap-3 rounded-xl border border-brand-200 bg-white/80 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (changed && !invalid) void save();
      }}
      onKeyDown={(e) => e.key === 'Escape' && onDone()}
    >
      <Input label="Description" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} error={errors.summary || undefined} autoFocus />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="File name" value={form.fileName} onChange={(e) => setForm({ ...form, fileName: e.target.value })} error={errors.fileName || undefined} />
        <Input
          label="Content type"
          value={form.contentType}
          onChange={(e) => setForm({ ...form, contentType: e.target.value })}
          error={errors.contentType || undefined}
          className="font-mono text-xs"
        />
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-700">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={form.isObsolete} onChange={(e) => setForm({ ...form, isObsolete: e.target.checked })} className="rounded border-line text-brand-700 focus:ring-brand-600" />
          Obsolete - superseded by a newer file
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={form.isPatch} onChange={(e) => setForm({ ...form, isPatch: e.target.checked })} className="rounded border-line text-brand-700 focus:ring-brand-600" />
          Patch
        </label>
        {privateAllowed && (
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={form.isPrivate} onChange={(e) => setForm({ ...form, isPrivate: e.target.checked })} className="rounded border-line text-brand-700 focus:ring-brand-600" />
            Private
          </label>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={update.isPending} disabled={!changed || invalid}>
          Save attachment
        </Button>
      </div>
    </form>
  );
}

export function AttachmentList({
  bugId,
  attachments,
  privateAllowed = false,
}: {
  bugId: number;
  attachments: Attachment[];
  privateAllowed?: boolean;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [showObsolete, setShowObsolete] = useState(false);

  if (attachments.length === 0) {
    return <p className="px-5 py-6 text-center text-sm text-slate-600">No attachments.</p>;
  }

  const obsoleteCount = attachments.filter((a) => a.isObsolete).length;
  const shown = attachments.filter((a) => showObsolete || !a.isObsolete || a.id === editing);

  return (
    <>
      <ul className="flex flex-col divide-y divide-white/30">
        {shown.map((a) => {
          const Icon = iconFor(a.contentType);
          const url = `/api/bugs/${bugId}/attachments/${a.id}`;
          const isVideo = a.contentType.startsWith('video/');
          return (
            <li key={a.id} className={cn('flex flex-col gap-2 px-5 py-3', a.isObsolete && 'opacity-70')}>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-medium text-slate-900">
                    <span className={cn('truncate', a.isObsolete && 'line-through decoration-slate-400')}>{a.fileName}</span>
                    {a.isObsolete && <span className="shrink-0 rounded bg-slate-200 px-1.5 py-px text-[10px] font-semibold uppercase text-slate-600">Obsolete</span>}
                    {a.isPatch && <span className="shrink-0 rounded bg-violet-100 px-1.5 py-px text-[10px] font-semibold uppercase text-violet-700">Patch</span>}
                    {a.isPrivate && <span className="shrink-0 rounded bg-amber-100 px-1.5 py-px text-[10px] font-semibold uppercase text-amber-800">Private</span>}
                  </p>
                  <p className="truncate text-xs text-slate-600">
                    {a.summary} · {formatBytes(a.size)} · {a.creator} · {formatDateTime(a.creationTime)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(editing === a.id ? null : a.id)}
                  aria-expanded={editing === a.id}
                  className="focus-ring flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-white/70"
                  aria-label={`Edit ${a.fileName}`}
                >
                  <Pencil className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Edit</span>
                </button>
                <a
                  href={`${url}?download=1`}
                  download={a.fileName}
                  className="focus-ring flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Download</span>
                </a>
              </div>
              {editing === a.id && <AttachmentEditor bugId={bugId} attachment={a} privateAllowed={privateAllowed} onDone={() => setEditing(null)} />}
              {/^image\/(png|jpe?g|gif|webp)$/i.test(a.contentType) && editing !== a.id && (
                <a href={url} target="_blank" rel="noreferrer" className="ml-12 block w-fit" title={`Open ${a.fileName} full size`}>
                  <img src={url} alt={a.summary || a.fileName} loading="lazy" className="max-h-48 rounded-lg border border-white/40 object-contain shadow-sm transition-opacity hover:opacity-90" />
                </a>
              )}
              {isVideo && editing !== a.id && (
                // eslint-disable-next-line jsx-a11y/media-has-caption -- test-evidence recordings, no captions to provide
                <video src={url} controls preload="metadata" className="ml-12 max-h-64 rounded-lg border border-white/40" />
              )}
            </li>
          );
        })}
      </ul>
      {obsoleteCount > 0 && (
        <button
          type="button"
          onClick={() => setShowObsolete((v) => !v)}
          className="focus-ring flex w-full items-center justify-center gap-1.5 border-t border-white/30 px-5 py-2.5 text-xs font-medium text-slate-600 hover:bg-white/40"
        >
          <Archive className="h-3.5 w-3.5" aria-hidden />
          {showObsolete ? 'Hide' : 'Show'} {obsoleteCount} obsolete {obsoleteCount === 1 ? 'file' : 'files'}
        </button>
      )}
    </>
  );
}
