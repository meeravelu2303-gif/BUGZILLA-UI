import { ApiError } from '../api/client';
import type { Attachment } from '../types';

/**
 * Uploads one file to a bug as its raw bytes (POST /api/bugs/:id/attachments/upload).
 *
 * XMLHttpRequest rather than fetch because fetch still cannot report UPLOAD progress, and a
 * 40 MB screen recording with no progress bar looks frozen. Abort via the signal.
 */
export function uploadAttachment(
  bugId: number,
  file: File,
  opts: { summary?: string; comment?: string; onProgress?: (fraction: number) => void; signal?: AbortSignal } = {}
): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/bugs/${bugId}/attachments/upload`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
    if (opts.summary) xhr.setRequestHeader('X-Summary', encodeURIComponent(opts.summary));
    if (opts.comment) xhr.setRequestHeader('X-Comment', encodeURIComponent(opts.comment));

    xhr.upload.onprogress = (e) => {
      // The last few percent are Bugzilla storing the file, so cap the bar until it answers.
      if (e.lengthComputable) opts.onProgress?.(Math.min(0.97, e.loaded / e.total));
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // Not JSON - handled below as an unexpected error.
      }
      if (xhr.status >= 200 && xhr.status < 300 && body && typeof body === 'object' && 'attachment' in body) {
        opts.onProgress?.(1);
        resolve((body as { attachment: Attachment }).attachment);
        return;
      }
      reject(
        new ApiError(
          (body as ConstructorParameters<typeof ApiError>[0]) ?? {
            error: true,
            status: xhr.status,
            code: 'INTERNAL',
            message: xhr.status === 413 ? 'That file is too large to upload.' : 'The upload failed.',
          }
        )
      );
    };
    xhr.onerror = () => reject(new Error('The connection dropped during the upload.'));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    opts.signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

export function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** A sensible default description: what kind of evidence it is, then its name. */
export function defaultSummary(file: File): string {
  const kind = file.type.startsWith('image/') ? 'Screenshot' : file.type.startsWith('video/') ? 'Video' : 'Evidence';
  return `${kind}: ${file.name}`;
}
