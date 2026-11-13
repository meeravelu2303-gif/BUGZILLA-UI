import type { Response } from 'express';

const NOT_AVAILABLE =
  'This proof link is not valid. It may have expired, or it was changed after it was created. ' +
  'Export the Excel again from the Bug Tracker to get fresh links.';

export function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (match) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[match]!,
  );
}

export function setProofSecurityHeaders(res: Response): void {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; sandbox allow-same-origin allow-downloads",
  );
  res.setHeader('Cache-Control', 'private, max-age=300');
}

export function sendProofUnavailable(res: Response, status = 404): void {
  setProofSecurityHeaders(res);
  res.status(status).type('text/plain').send(NOT_AVAILABLE);
}

export function formatFileSize(bytes = 0): string {
  return bytes > 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
