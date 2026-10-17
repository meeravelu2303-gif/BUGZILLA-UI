import { Router, type Response } from 'express';
import type { Env } from '../config/env';
import { BugzillaClient } from '../lib/bugzillaClient';
import { proofQueryString, proofSecret, signProof, verifyProof } from '../lib/proofLinks';

/**
 * GET /api/proof/bug/:bugId   - a page with every proof file of one bug (screenshots shown, videos playable)
 * GET /api/proof/file/:id     - one proof file
 *
 * No login: these are reached from links inside an exported sheet, and each link carries its own
 * signature and expiry (see lib/proofLinks). Files are fetched with the server's own Bugzilla key,
 * private attachments are never served, and anything a browser could execute (HTML, SVG, …) is
 * served as a download, never rendered on this origin.
 */

interface RawAttachment {
  id: number;
  bug_id: number;
  file_name?: string;
  summary?: string;
  creation_time?: string;
  content_type?: string;
  size?: number;
  is_obsolete?: number | boolean;
  is_private?: number | boolean;
  data?: string;
}

/** Types a browser may show inline. Everything else is forced to download as opaque bytes. */
const INLINE = /^(image\/(png|jpeg|gif|webp)|video\/(webm|mp4)|text\/plain|application\/json)$/i;

const NOT_AVAILABLE =
  'This proof link is not valid. It may have expired, or it was changed after it was created. ' +
  'Export the Excel again from the Bug Tracker to get fresh links.';

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function lockDown(res: Response): void {
  // Nothing on these responses may run script, load from elsewhere, or be framed.
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; sandbox allow-same-origin allow-downloads"
  );
  res.setHeader('Cache-Control', 'private, max-age=300');
}

function refuse(res: Response, status = 404): void {
  lockDown(res);
  res.status(status).type('text/plain').send(NOT_AVAILABLE);
}

function size(bytes = 0): string {
  return bytes > 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function proofRouter(env: Env): Router {
  const router = Router();
  const service = new BugzillaClient(env.BUGZILLA_URL, { kind: 'api_key', apiKey: env.BUGZILLA_API_KEY });

  router.get('/bug/:bugId', async (req, res, next) => {
    try {
      const bugId = Number(req.params.bugId);
      const expires = Number(req.query.e);
      if (verifyProof(proofSecret(env), 'bug', bugId, req.query) !== bugId) return refuse(res);

      const [attachResp, bugResp] = await Promise.all([
        service.get<{ bugs: Record<string, RawAttachment[]> }>(`/bug/${bugId}/attachment`, {
          include_fields: 'id,bug_id,file_name,summary,creation_time,content_type,size,is_obsolete,is_private',
        }),
        service.get<{ bugs: Array<{ summary?: string }> }>(`/bug/${bugId}`, { include_fields: 'summary' }),
      ]);
      const files = (attachResp.bugs?.[String(bugId)] ?? [])
        .filter((a) => !a.is_obsolete && !a.is_private)
        .sort((x, y) => String(y.creation_time).localeCompare(String(x.creation_time)));
      const title = bugResp.bugs?.[0]?.summary ?? '';

      const items = files.map((a) => {
        const href = `../file/${a.id}?${proofQueryString(signProof(proofSecret(env), 'file', a.id, bugId, expires))}`;
        const type = a.content_type ?? '';
        const when = String(a.creation_time ?? '')
          .slice(0, 16)
          .replace('T', ' ');
        const head =
          `<div class="meta"><a href="${esc(href)}">${esc(a.file_name ?? `attachment ${a.id}`)}</a>` +
          ` &middot; ${esc(when)} UTC &middot; ${size(a.size)}</div>` +
          (a.summary ? `<div class="sum">${esc(a.summary)}</div>` : '');
        const body = /^image\/(png|jpeg|gif|webp)$/i.test(type)
          ? `<a href="${esc(href)}"><img src="${esc(href)}" alt="${esc(a.file_name ?? '')}" loading="lazy"></a>`
          : /^video\/(webm|mp4)$/i.test(type)
            ? `<video src="${esc(href)}" controls preload="metadata"></video>`
            : '';
        return `<section>${head}${body}</section>`;
      });

      lockDown(res);
      res
        .type('html')
        .send(
          `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
            `<meta name="viewport" content="width=device-width,initial-scale=1">` +
            `<title>Bug ${bugId} proof</title><style>` +
            `body{font:14px/1.5 system-ui,sans-serif;margin:0;padding:16px;background:#f6f7f9;color:#1d2330}` +
            `h1{font-size:18px;margin:0 0 4px}p{color:#555;margin:0 0 16px}` +
            `section{background:#fff;border:1px solid #dde1e7;border-radius:8px;padding:12px;margin:0 0 12px}` +
            `.meta a{color:#0d6875;font-weight:600}.sum{color:#555;margin:2px 0 8px}` +
            `img,video{display:block;max-width:100%;border:1px solid #dde1e7;border-radius:4px}` +
            `@media (prefers-color-scheme:dark){body{background:#14181f;color:#e6e9ee}section{background:#1c222b;border-color:#2c3440}.sum,p{color:#a7b1bf}.meta a{color:#6fc6d1}}` +
            `</style></head><body>` +
            `<h1>Bug ${bugId}: ${esc(title)}</h1>` +
            `<p>${files.length} proof file(s), newest first. This link works without a login until ` +
            `${esc(new Date(expires).toISOString().slice(0, 10))}.</p>` +
            (items.join('') || '<section>No proof files are attached to this bug.</section>') +
            `</body></html>`
        );
    } catch (err) {
      next(err);
    }
  });

  router.get('/file/:id', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const bugId = verifyProof(proofSecret(env), 'file', id, req.query);
      if (bugId === null) return refuse(res);

      const resp = await service.get<{ attachments: Record<string, RawAttachment> }>(`/bug/attachment/${id}`);
      const a = resp.attachments?.[String(id)];
      // The signature names the bug too: a valid link for one bug's file can't be pointed at another bug.
      if (!a || a.bug_id !== bugId || a.is_private || !a.data) return refuse(res);

      const type = a.content_type ?? 'application/octet-stream';
      const name = (a.file_name ?? `attachment-${id}`).replace(/[^\w.-]+/g, '_');
      const inline = INLINE.test(type);
      lockDown(res);
      res.setHeader('Content-Type', inline ? type : 'application/octet-stream');
      res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${name}"`);
      res.send(Buffer.from(a.data, 'base64'));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
