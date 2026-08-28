import { Download, FileText, Image as ImageIcon, Paperclip, Video as VideoIcon } from 'lucide-react';
import type { Attachment } from '../../types';
import { formatBytes, formatDateTime } from '../../lib/utils';

function iconFor(contentType: string) {
  if (contentType.startsWith('video/')) return VideoIcon;
  if (contentType.startsWith('image/')) return ImageIcon;
  if (contentType === 'text/plain' || contentType.includes('patch')) return FileText;
  return Paperclip;
}

export function AttachmentList({ bugId, attachments }: { bugId: number; attachments: Attachment[] }) {
  if (attachments.length === 0) {
    return <p className="px-5 py-6 text-center text-sm text-slate-600">No attachments.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-white/30">
      {attachments.map((a) => {
        const Icon = iconFor(a.contentType);
        const url = `/api/bugs/${bugId}/attachments/${a.id}`;
        const isVideo = a.contentType.startsWith('video/');
        return (
          <li key={a.id} className="flex flex-col gap-2 px-5 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{a.fileName}</p>
                <p className="truncate text-xs text-slate-600">
                  {a.summary} · {formatBytes(a.size)} · {a.creator} · {formatDateTime(a.creationTime)}
                </p>
              </div>
              <a
                href={`${url}?download=1`}
                download={a.fileName}
                className="focus-ring flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </a>
            </div>
            {isVideo && (
              // eslint-disable-next-line jsx-a11y/media-has-caption -- test-evidence recordings, no captions to provide
              <video src={url} controls preload="metadata" className="ml-12 max-h-64 rounded-lg border border-white/40" />
            )}
          </li>
        );
      })}
    </ul>
  );
}
