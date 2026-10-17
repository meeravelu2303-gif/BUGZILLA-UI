import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileText, ImagePlus, Loader2, RotateCcw, Upload, Video as VideoIcon, X, XCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { useToast } from '../../context/ToastContext';
import { defaultSummary, formatSize, uploadAttachment } from '../../lib/uploadAttachment';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';

type Status = 'queued' | 'uploading' | 'done' | 'failed' | 'rejected';

interface Item {
  id: string;
  file: File;
  summary: string;
  status: Status;
  progress: number;
  error?: string;
  preview?: string;
  controller?: AbortController;
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');

/**
 * Adds screenshots, videos and other evidence to an existing bug - for bugs that
 * were filed without proof, or need more.
 *
 * Files can be chosen, dropped, or pasted straight from the clipboard (a
 * screenshot taken with Win+Shift+S lands here with Ctrl+V). Each gets a preview
 * and an editable description, uploads with its own progress bar, and can be
 * cancelled or retried on its own. Up to Bugzilla's per-file limit.
 */
export function AttachmentUploader({
  bugId,
  maxBytes,
  onClose,
  compact = false,
}: {
  bugId: number;
  maxBytes: number;
  onClose?: () => void;
  /** Smaller drop zone, for a bug that already has files listed above it. */
  compact?: boolean;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [comment, setComment] = useState('');
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const qc = useQueryClient();
  const { toast } = useToast();

  const patch = (id: string, change: Partial<Item>) => setItems((list) => list.map((it) => (it.id === id ? { ...it, ...change } : it)));

  const addFiles = useCallback(
    (files: File[]) => {
      setItems((list) => {
        const next = [...list];
        for (const file of files) {
          if (next.some((it) => it.file.name === file.name && it.file.size === file.size && it.status !== 'done')) continue;
          const tooBig = file.size > maxBytes;
          const empty = file.size === 0;
          next.push({
            id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
            file,
            summary: defaultSummary(file),
            status: tooBig || empty ? 'rejected' : 'queued',
            progress: 0,
            error: empty ? 'This file is empty.' : tooBig ? `Too large - ${formatSize(file.size)}; the limit is ${formatSize(maxBytes)}.` : undefined,
            preview: file.type.startsWith('image/') || file.type.startsWith('video/') ? URL.createObjectURL(file) : undefined,
          });
        }
        return next;
      });
    },
    [maxBytes]
  );

  // Paste a screenshot from the clipboard anywhere on the page while the uploader is open.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (!files.length) return; // plain text paste - leave it alone
      e.preventDefault();
      addFiles(
        files.map((f) =>
          // Clipboard images arrive as "image.png"; give them a name worth keeping.
          /^image\.(png|jpe?g|gif|webp)$/i.test(f.name) ? new File([f], `screenshot-${stamp()}.${f.name.split('.').pop()}`, { type: f.type }) : f
        )
      );
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [addFiles]);

  // Release preview URLs when the uploader goes away.
  useEffect(
    () => () => {
      for (const it of itemsRef.current) if (it.preview) URL.revokeObjectURL(it.preview);
      for (const it of itemsRef.current) it.controller?.abort();
    },
    []
  );

  async function uploadOne(item: Item, withComment: string) {
    const controller = new AbortController();
    patch(item.id, { status: 'uploading', progress: 0, error: undefined, controller });
    try {
      await uploadAttachment(bugId, item.file, {
        summary: item.summary.trim() || defaultSummary(item.file),
        comment: withComment || undefined,
        signal: controller.signal,
        onProgress: (p) => patch(item.id, { progress: p }),
      });
      patch(item.id, { status: 'done', progress: 1, controller: undefined });
      return true;
    } catch (err) {
      const cancelled = err instanceof DOMException && err.name === 'AbortError';
      patch(item.id, {
        status: 'failed',
        controller: undefined,
        error: cancelled ? 'Cancelled.' : err instanceof Error ? err.message : 'The upload failed.',
      });
      return false;
    }
  }

  async function uploadAll() {
    const queue = itemsRef.current.filter((it) => it.status === 'queued' || it.status === 'failed');
    if (!queue.length) return;
    setRunning(true);
    let ok = 0;
    // One at a time: Bugzilla runs each upload as its own CGI process, and a 50 MB file is
    // held in memory there - several at once would compete for it.
    for (const [i, item] of queue.entries()) {
      const current = itemsRef.current.find((it) => it.id === item.id);
      if (!current || current.status === 'rejected') continue;
      if (await uploadOne(current, i === 0 ? comment.trim() : '')) ok++;
    }
    setRunning(false);
    await qc.invalidateQueries({ queryKey: ['bugs', bugId] });
    const failed = queue.length - ok;
    if (ok) {
      toast({
        variant: failed ? 'info' : 'success',
        title: `Added ${ok} file${ok === 1 ? '' : 's'} to the bug`,
        description: failed ? `${failed} did not upload - retry ${failed === 1 ? 'it' : 'them'} below.` : undefined,
      });
      setComment('');
    }
    if (!failed) {
      // Everything landed: clear the list (the files now show in Attachments above).
      setItems((list) => {
        for (const it of list) if (it.preview) URL.revokeObjectURL(it.preview);
        return list.filter((it) => it.status !== 'done' && it.status !== 'rejected');
      });
      onClose?.();
    }
  }

  function remove(id: string) {
    setItems((list) => {
      const it = list.find((x) => x.id === id);
      it?.controller?.abort();
      if (it?.preview) URL.revokeObjectURL(it.preview);
      return list.filter((x) => x.id !== id);
    });
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  }

  const pending = items.filter((it) => it.status === 'queued' || it.status === 'failed');
  const totalBytes = pending.reduce((n, it) => n + it.file.size, 0);

  return (
    <div className="flex flex-col gap-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), inputRef.current?.click())}
        role="button"
        tabIndex={0}
        aria-label="Add files: choose, drop, or paste a screenshot"
        className={cn(
          'focus-ring flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-center transition-colors',
          compact ? 'px-4 py-5' : 'px-6 py-9',
          dragging ? 'border-brand-500 bg-brand-50/70' : 'border-slate-300 bg-white/50 hover:border-brand-400 hover:bg-white/80'
        )}
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200">
          <ImagePlus className="h-5 w-5" aria-hidden />
        </span>
        <p className="text-sm text-slate-700">
          <span className="font-semibold text-brand-700">Choose files</span>, drop them here, or press{' '}
          <kbd className="rounded border border-slate-200 bg-white px-1 text-xs">Ctrl</kbd>+<kbd className="rounded border border-slate-200 bg-white px-1 text-xs">V</kbd> to paste a screenshot
        </p>
        <p className="text-xs text-slate-500">Screenshots, screen recordings, HAR files, logs · up to {formatSize(maxBytes)} each</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </div>

      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((it) => {
            const isImage = it.file.type.startsWith('image/');
            const isVideo = it.file.type.startsWith('video/');
            return (
              <li
                key={it.id}
                className={cn(
                  'flex gap-3 rounded-xl border bg-white/80 p-3',
                  it.status === 'rejected' || it.status === 'failed' ? 'border-rose-200' : it.status === 'done' ? 'border-emerald-200' : 'border-slate-200'
                )}
              >
                <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-slate-500">
                  {it.preview && isImage ? (
                    <img src={it.preview} alt="" className="h-full w-full object-cover" />
                  ) : it.preview && isVideo ? (
                    <video src={it.preview} muted preload="metadata" className="h-full w-full object-cover" />
                  ) : isVideo ? (
                    <VideoIcon className="h-5 w-5" aria-hidden />
                  ) : (
                    <FileText className="h-5 w-5" aria-hidden />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-medium text-slate-900" title={it.file.name}>
                      {it.file.name} <span className="font-normal text-slate-500">· {formatSize(it.file.size)}</span>
                    </p>
                    <span className="flex shrink-0 items-center gap-1">
                      {it.status === 'done' && <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Uploaded" />}
                      {it.status === 'failed' && !running && (
                        <button
                          type="button"
                          onClick={() => void uploadOne(it, '').then((ok) => { if (ok) void qc.invalidateQueries({ queryKey: ['bugs', bugId] }); })}
                          className="focus-ring rounded p-1 text-slate-500 hover:text-brand-700" aria-label={`Retry ${it.file.name}`} title="Retry">
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      )}
                      {it.status !== 'done' && (
                        <button
                          type="button"
                          onClick={() => remove(it.id)}
                          className="focus-ring rounded p-1 text-slate-400 hover:text-rose-600"
                          aria-label={it.status === 'uploading' ? `Cancel uploading ${it.file.name}` : `Remove ${it.file.name}`}
                          title={it.status === 'uploading' ? 'Cancel' : 'Remove'}
                        >
                          <X className="h-4 w-4" aria-hidden />
                        </button>
                      )}
                    </span>
                  </div>

                  {it.status === 'rejected' || it.status === 'failed' ? (
                    <p className="mt-1 flex items-center gap-1 text-xs text-rose-600">
                      <XCircle className="h-3.5 w-3.5" aria-hidden /> {it.error}
                    </p>
                  ) : it.status === 'uploading' ? (
                    <div className="mt-2">
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={Math.round(it.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${it.file.name}`}>
                        <div className="h-full rounded-full bg-brand-600 transition-[width] duration-300" style={{ width: `${Math.max(3, it.progress * 100)}%` }} />
                      </div>
                      <p className="mt-1 text-xs tabular-nums text-slate-500">
                        {it.progress >= 0.97 ? 'Saving in Bugzilla…' : `${Math.round(it.progress * 100)}% · ${formatSize(Math.round(it.file.size * it.progress))} of ${formatSize(it.file.size)}`}
                      </p>
                    </div>
                  ) : it.status === 'done' ? (
                    <p className="mt-1 text-xs text-emerald-700">Added to the bug.</p>
                  ) : (
                    <input
                      value={it.summary}
                      onChange={(e) => patch(it.id, { summary: e.target.value })}
                      maxLength={255}
                      aria-label={`Description for ${it.file.name}`}
                      placeholder="Describe this file"
                      className="focus-ring mt-1.5 h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800"
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pending.length > 0 && (
        <>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Comment <span className="font-normal text-slate-400">(optional - posted with the files)</span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              disabled={running}
              placeholder="e.g. Recording of the crash on Chrome 129 - starts at 0:12."
              className="focus-ring rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 placeholder:text-slate-400"
            />
          </label>
          <div className="flex items-center justify-end gap-2">
            {onClose && (
              <Button
                variant="secondary"
                onClick={() => {
                  for (const it of items) it.controller?.abort();
                  onClose();
                }}
              >
                {running ? 'Cancel all' : 'Cancel'}
              </Button>
            )}
            <Button onClick={uploadAll} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
              {running ? 'Uploading…' : `Upload ${pending.length} file${pending.length === 1 ? '' : 's'} · ${formatSize(totalBytes)}`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
