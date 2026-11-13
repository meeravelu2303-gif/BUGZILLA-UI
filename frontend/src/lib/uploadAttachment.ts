import { ApiError } from '../api/client';
import type { Attachment } from '../types';

/** Uploads one file to a bug as its raw bytes (POST /api/bugs/:id/attachments/upload). */
export function uploadAttachment(
  bugId: number,
  file: File,
  options: { summary?: string; comment?: string; onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/bugs/${bugId}/attachments/upload`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
    if (options.summary) xhr.setRequestHeader('X-Summary', encodeURIComponent(options.summary));
    if (options.comment) xhr.setRequestHeader('X-Comment', encodeURIComponent(options.comment));

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress?.(Math.min(0.97, event.loaded / event.total));
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && body && typeof body === 'object' && 'attachment' in body) {
        options.onProgress?.(1);
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
          },
        ),
      );
    };
    xhr.onerror = () => reject(new Error('The connection dropped during the upload.'));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    options.signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

export function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

/** A sensible default description: what kind of evidence it is, then its name. */
export function defaultSummary(file: File): string {
  const kind = file.type.startsWith('image/') ? 'Screenshot' : file.type.startsWith('video/') ? 'Video' : 'Evidence';
  return `${kind}: ${file.name}`;
}
