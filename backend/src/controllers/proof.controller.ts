import { proofQueryString, proofSecret, signProof, verifyProof } from '../services/proofLinks.service';
import { asyncHandler } from '../helpers/response.helper';
import { env } from '../config/app.config';
import { INLINE_CONTENT_TYPES, RawAttachment, proofClient } from '../services/proof.service';
import { escapeHtml, setProofSecurityHeaders, sendProofUnavailable, formatFileSize } from '../helpers/proofPage.helper';

export const getBugProof = asyncHandler(async (req, res) => {
  const bugId = Number(req.params.bugId);
  const expires = Number(req.query.e);
  if (verifyProof(proofSecret(env), 'bug', bugId, req.query) !== bugId) return sendProofUnavailable(res);

  const [attachmentsResponse, bugResponse] = await Promise.all([
    proofClient.get<{ bugs: Record<string, RawAttachment[]> }>(`/bug/${bugId}/attachment`, {
      include_fields: 'id,bug_id,file_name,summary,creation_time,content_type,size,is_obsolete,is_private',
    }),
    proofClient.get<{ bugs: Array<{ summary?: string }> }>(`/bug/${bugId}`, { include_fields: 'summary' }),
  ]);
  const files = (attachmentsResponse.bugs?.[String(bugId)] ?? [])
    .filter((attachment) => !attachment.is_obsolete && !attachment.is_private)
    .sort((x, y) => String(y.creation_time).localeCompare(String(x.creation_time)));
  const title = bugResponse.bugs?.[0]?.summary ?? '';

  const items = files.map((file) => {
    const href = `../file/${file.id}?${proofQueryString(signProof(proofSecret(env), 'file', file.id, bugId, expires))}`;
    const type = file.content_type ?? '';
    const when = String(file.creation_time ?? '')
      .slice(0, 16)
      .replace('T', ' ');
    const head =
      `<div class="meta"><a href="${escapeHtml(href)}">${escapeHtml(file.file_name ?? `attachment ${file.id}`)}</a>` +
      ` &middot; ${escapeHtml(when)} UTC &middot; ${formatFileSize(file.size)}</div>` +
      (file.summary ? `<div class="sum">${escapeHtml(file.summary)}</div>` : '');
    const body = /^image\/(png|jpeg|gif|webp)$/i.test(type)
      ? `<a href="${escapeHtml(href)}"><img src="${escapeHtml(href)}" alt="${escapeHtml(file.file_name ?? '')}" loading="lazy"></a>`
      : /^video\/(webm|mp4)$/i.test(type)
        ? `<video src="${escapeHtml(href)}" controls preload="metadata"></video>`
        : '';
    return `<section>${head}${body}</section>`;
  });

  setProofSecurityHeaders(res);
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
        `<h1>Bug ${bugId}: ${escapeHtml(title)}</h1>` +
        `<p>${files.length} proof file(s), newest first. This link works without a login until ` +
        `${escapeHtml(new Date(expires).toISOString().slice(0, 10))}.</p>` +
        (items.join('') || '<section>No proof files are attached to this bug.</section>') +
        `</body></html>`,
    );
});

export const getProofFile = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const bugId = verifyProof(proofSecret(env), 'file', id, req.query);
  if (bugId === null) return sendProofUnavailable(res);

  const response = await proofClient.get<{ attachments: Record<string, RawAttachment> }>(`/bug/attachment/${id}`);
  const attachment = response.attachments?.[String(id)];
  if (!attachment || attachment.bug_id !== bugId || attachment.is_private || !attachment.data)
    return sendProofUnavailable(res);

  const type = attachment.content_type ?? 'application/octet-stream';
  const name = (attachment.file_name ?? `attachment-${id}`).replace(/[^\w.-]+/g, '_');
  const inline = INLINE_CONTENT_TYPES.test(type);
  setProofSecurityHeaders(res);
  res.setHeader('Content-Type', inline ? type : 'application/octet-stream');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${name}"`);
  res.send(Buffer.from(attachment.data, 'base64'));
});
