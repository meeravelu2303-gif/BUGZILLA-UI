// Builds docs/guides/bug-tracker-layman-guide.{html,docx} from the .md source.
// Needs the "docx" npm package: in any folder, `npm i docx@9`, then from there run
//   node <repo>/docs/guides/build-guide.mjs <repo>/docs/guides/bug-tracker-layman-guide.md <repo>/docs/guides
import fs from 'node:fs';
import path from 'node:path';
import {
  AlignmentType, BorderStyle, Document, HeadingLevel, LevelFormat, Packer, PageBreak, Paragraph, ShadingType,
  Table, TableCell, TableRow, TextRun, WidthType, Footer, PageNumber, TableOfContents,
} from 'docx';

const [, , mdPath, outDir] = process.argv;
const src = fs.readFileSync(mdPath, 'utf8').replace(/\r\n/g, '\n');
const base = path.basename(mdPath, '.md');

/* ------------------------------------------------------------- parse */
const lines = src.split('\n');
const blocks = [];
let i = 0;
const isTableLine = (l) => /^\s*\|.*\|\s*$/.test(l);
while (i < lines.length) {
  const l = lines[i];
  if (!l.trim()) { i++; continue; }
  if (l.startsWith('```')) {
    const buf = []; i++;
    while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
    i++; blocks.push({ t: 'code', text: buf.join('\n') }); continue;
  }
  if (/^---+\s*$/.test(l)) { blocks.push({ t: 'hr' }); i++; continue; }
  const h = /^(#{1,4})\s+(.*)$/.exec(l);
  if (h) { blocks.push({ t: 'h', level: h[1].length, text: h[2].trim() }); i++; continue; }
  if (l.startsWith('>')) {
    const buf = [];
    while (i < lines.length && lines[i].startsWith('>')) buf.push(lines[i++].replace(/^>\s?/, ''));
    blocks.push({ t: 'callout', text: buf.join(' ').trim() }); continue;
  }
  if (isTableLine(l)) {
    const rows = [];
    while (i < lines.length && isTableLine(lines[i])) rows.push(lines[i++]);
    const cells = (r) => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    const header = cells(rows[0]);
    const body = rows.slice(2).map(cells);
    blocks.push({ t: 'table', header, body }); continue;
  }
  if (/^\s*[-*]\s+/.test(l) || /^\s*\d+\.\s+/.test(l)) {
    const ordered = /^\s*\d+\./.test(l);
    const items = [];
    while (i < lines.length && (/^\s*[-*]\s+/.test(lines[i]) || /^\s*\d+\.\s+/.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))) {
      const m = /^(\s*)(?:[-*]|\d+\.)\s+(.*)$/.exec(lines[i]);
      if (m) items.push({ depth: m[1].length >= 2 ? 1 : 0, text: m[2] });
      else if (items.length) items[items.length - 1].text += ' ' + lines[i].trim();
      i++;
    }
    blocks.push({ t: 'list', ordered, items }); continue;
  }
  const buf = [];
  while (i < lines.length && lines[i].trim() && !/^(#|>|```|---|\s*[-*]\s|\s*\d+\.\s)/.test(lines[i]) && !isTableLine(lines[i])) buf.push(lines[i++].trim());
  blocks.push({ t: 'p', text: buf.join(' ') });
}

/* ------------------------------------------------------------ inline */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function inlineHtml(s) {
  let out = esc(s);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[\s(])\*([^*]+)\*(?=[\s).,;:]|$)/g, '$1<em>$2</em>');
  out = out.replace(/★/g, '<span class="req">★</span>');
  return out;
}
/** Markdown inline -> docx TextRuns. */
function inlineRuns(s, extra = {}) {
  const runs = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > last) runs.push(new TextRun({ text: s.slice(last, m.index), ...extra }));
    const tok = m[0];
    if (tok.startsWith('`')) runs.push(new TextRun({ text: tok.slice(1, -1), font: 'Consolas', size: 19, shading: { type: ShadingType.CLEAR, fill: 'EFF6FF' }, ...extra }));
    else if (tok.startsWith('**')) runs.push(new TextRun({ text: tok.slice(2, -2), bold: true, ...extra }));
    else runs.push(new TextRun({ text: tok.slice(1, -1), italics: true, ...extra }));
    last = m.index + tok.length;
  }
  if (last < s.length) runs.push(new TextRun({ text: s.slice(last), ...extra }));
  return runs;
}
const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/* -------------------------------------------------------------- html */
const title = blocks.find((b) => b.t === 'h' && b.level === 1)?.text ?? base;
let html = '';
const toc = [];
let firstH1 = true;
for (const b of blocks) {
  switch (b.t) {
    case 'h': {
      const id = slug(b.text);
      if (b.level <= 2 && !(b.level === 1 && firstH1)) toc.push({ level: b.level, id, text: b.text });
      if (b.level === 1) firstH1 = false;
      html += `<h${b.level} id="${id}">${inlineHtml(b.text)}</h${b.level}>\n`; break;
    }
    case 'p': html += `<p>${inlineHtml(b.text)}</p>\n`; break;
    case 'callout': html += `<div class="callout"><p>${inlineHtml(b.text)}</p></div>\n`; break;
    case 'hr': html += '<hr>\n'; break;
    case 'code': html += `<pre><code>${esc(b.text)}</code></pre>\n`; break;
    case 'list': {
      const tag = b.ordered ? 'ol' : 'ul';
      html += `<${tag}>`;
      let open = false;
      for (const it of b.items) {
        if (it.depth === 1) { if (!open) { html += '<ul>'; open = true; } html += `<li>${inlineHtml(it.text)}</li>`; }
        else { if (open) { html += '</ul></li>'; open = false; } else if (html.endsWith('</li>') || html.endsWith(`<${tag}>`)) {} html += `<li>${inlineHtml(it.text)}`; }
      }
      if (open) html += '</ul>';
      html += `</li></${tag}>\n`.replace(`<${tag}></li>`, `<${tag}>`);
      break;
    }
    case 'table': {
      html += '<div class="table-wrap"><table><thead><tr>' + b.header.map((c) => `<th>${inlineHtml(c)}</th>`).join('') + '</tr></thead><tbody>';
      for (const r of b.body) html += '<tr>' + r.map((c) => `<td>${inlineHtml(c)}</td>`).join('') + '</tr>';
      html += '</tbody></table></div>\n'; break;
    }
  }
}
// fix list items: the loop above appends "<li>text" without closing for depth-0 items; close them properly
html = html.replace(/<li>([^<]*(?:<(?!\/?li|ul|ol)[^>]*>[^<]*)*)(?=<li>|<\/ul>|<\/ol>|<ul>)/g, '<li>$1</li>');
html = html.replace(/<\/li><\/li>/g, '</li>');

const css = fs.readFileSync(path.join(path.dirname(mdPath), 'bugzilla-user-guide.html'), 'utf8').match(/<style>[\s\S]*?<\/style>/)[0]
  .replace('</style>', '.req{color:#dc2626;font-weight:700}.top .mark{font-size:13px}</style>');
const tocHtml = toc.map((t) => `<a class="toc-${t.level}" href="#${t.id}">${esc(t.text)}</a>`).join('');
const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>${css}</head>
<body>
<header class="top"><div class="mark">BT</div><div><div class="name">${esc(title)}</div><div class="sub">For admins, testers, developers and office staff · ${new Date().toISOString().slice(0, 10)}</div></div></header>
<div class="layout"><nav class="toc" aria-label="Contents">${tocHtml}</nav><main>
${html}
</main></div></body></html>`;
fs.writeFileSync(path.join(outDir, base + '.html'), page);

/* -------------------------------------------------------------- docx */
const DXA_W = 9360; // 6.5in text width on US Letter with 1in margins
const children = [];
function mkTable(b) {
  const n = b.header.length;
  const widths = [];
  // first column narrower when there are 3+ columns
  if (n >= 3) { const first = Math.round(DXA_W * 0.26); const rest = Math.round((DXA_W - first) / (n - 1)); widths.push(first); for (let k = 1; k < n; k++) widths.push(rest); }
  else if (n === 2) { widths.push(Math.round(DXA_W * 0.34), DXA_W - Math.round(DXA_W * 0.34)); }
  else widths.push(DXA_W);
  const cell = (text, head) => new TableCell({
    width: { size: 0, type: WidthType.DXA },
    shading: head ? { type: ShadingType.CLEAR, fill: 'EFF6FF' } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ children: inlineRuns(text, head ? { bold: true, color: '1E3A8A' } : {}), spacing: { before: 0, after: 0 } })],
  });
  const rows = [new TableRow({ tableHeader: true, children: b.header.map((c, k) => { const t = cell(c, true); t.options.width = { size: widths[k], type: WidthType.DXA }; return t; }) })];
  for (const r of b.body) rows.push(new TableRow({ children: b.header.map((_, k) => { const t = cell(r[k] ?? '', false); t.options.width = { size: widths[k], type: WidthType.DXA }; return t; }) }));
  return new Table({ width: { size: DXA_W, type: WidthType.DXA }, columnWidths: widths, rows,
    borders: Object.fromEntries(['top', 'bottom', 'left', 'right', 'insideHorizontal', 'insideVertical'].map((k) => [k, { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' }])) });
}
let h1Count = 0;
for (const b of blocks) {
  switch (b.t) {
    case 'h': {
      if (b.level === 1) {
        h1Count++;
        if (h1Count > 1) children.push(new Paragraph({ children: [new PageBreak()] }));
        children.push(new Paragraph({ heading: h1Count === 1 ? HeadingLevel.TITLE : HeadingLevel.HEADING_1, children: inlineRuns(b.text) }));
      } else children.push(new Paragraph({ heading: [null, null, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4][b.level], children: inlineRuns(b.text) }));
      break;
    }
    case 'p': children.push(new Paragraph({ children: inlineRuns(b.text), spacing: { after: 140 } })); break;
    case 'callout': children.push(new Paragraph({ children: inlineRuns(b.text), shading: { type: ShadingType.CLEAR, fill: 'EFF6FF' }, border: { left: { style: BorderStyle.SINGLE, size: 24, color: '2563EB', space: 8 } }, spacing: { before: 120, after: 160 }, indent: { left: 200 } })); break;
    case 'hr': children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'E2E8F0' } }, spacing: { before: 120, after: 120 } })); break;
    case 'code': for (const ln of b.text.split('\n')) children.push(new Paragraph({ children: [new TextRun({ text: ln || ' ', font: 'Consolas', size: 17 })], shading: { type: ShadingType.CLEAR, fill: 'F1F5F9' }, spacing: { before: 0, after: 0 } })); children.push(new Paragraph({ spacing: { after: 120 } })); break;
    case 'list': for (const it of b.items) children.push(new Paragraph({ children: inlineRuns(it.text), numbering: { reference: b.ordered ? 'nums' : 'bullets', level: it.depth }, spacing: { after: 60 } })); break;
    case 'table': children.push(mkTable(b)); children.push(new Paragraph({ spacing: { after: 120 } })); break;
  }
}
const doc = new Document({
  creator: 'UEducate Bug Tracker',
  title,
  styles: {
    default: { document: { run: { font: 'Calibri', size: 22 } } },
    paragraphStyles: [
      { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { size: 48, bold: true, color: '0F172A', font: 'Calibri' }, paragraph: { spacing: { after: 240 } } },
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 34, bold: true, color: '0F172A' }, paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 27, bold: true, color: '1D4ED8' }, paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 24, bold: true, color: '0F172A' }, paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 } },
      { id: 'Heading4', name: 'Heading 4', basedOn: 'Normal', next: 'Normal', run: { size: 22, bold: true, color: '475569' }, paragraph: { spacing: { before: 160, after: 60 }, outlineLevel: 3 } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets', levels: [
        { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } },
        { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1000, hanging: 270 } } } },
      ] },
      { reference: 'nums', levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } },
        { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1000, hanging: 270 } } } },
      ] },
    ],
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'UEducate Bug Tracker — Layman\'s Guide · page ', size: 18, color: '64748B' }), new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '64748B' })] })] }) },
    children: [
      children[0],
      new Paragraph({ children: [new TextRun({ text: 'Contents', bold: true, size: 28 })], spacing: { before: 200, after: 120 } }),
      new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }),
      new Paragraph({ children: [new TextRun({ text: 'If the contents list is empty, right-click it and choose "Update field".', italics: true, color: '64748B', size: 18 })] }),
      ...children.slice(1),
    ],
  }],
});
const buf = await Packer.toBuffer(doc);
fs.writeFileSync(path.join(outDir, base + '.docx'), buf);
console.log('built', base + '.html', '(' + fs.statSync(path.join(outDir, base + '.html')).size + ' B) and', base + '.docx', '(' + buf.length + ' B);', blocks.length, 'blocks,', toc.length, 'toc entries');
