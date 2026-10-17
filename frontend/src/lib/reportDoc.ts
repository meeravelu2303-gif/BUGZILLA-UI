/**
 * A bug report as editable sections, and back to text.
 *
 * The bench files reports in a line-anchored format - `Classification:` header
 * lines, then `Expected:` / `Actual:` / `curl:` / `How to fix:` blocks - and
 * three parsers read it (the bug page, the Excel export, the grouping facts).
 * So the editor does not invent a new format: it splits the text into those
 * same sections, lets each be edited, and writes them back with the same
 * headings. Sections it does not know are kept verbatim and stay editable, so
 * nothing in a report can be lost by editing another part of it.
 */

export interface Segment {
  /** Exact heading as written (e.g. "Response body (HTTP 500)"); null for the leading prose. */
  heading: string | null;
  body: string;
  /** A one-line `Label: value` header line from the top of the report. */
  meta: boolean;
  /**
   * The heading was already empty in the original. Kept on save: readers take the FIRST
   * matching heading, so dropping an empty "Steps to reproduce:" would make a later one count.
   * A section the user empties (it had content) is removed instead.
   */
  emptyInOriginal?: boolean;
}

export type ReportDoc = Segment[];

/** Header lines - only recognised before the first block heading, as the bug page reads them. */
const META_NAMES = ['Representative endpoint', 'Classification', 'Category', 'Endpoint', 'Module', 'Severity'];

/** Block headings. `true` = the heading may carry a suffix before its colon, e.g. "(HTTP 500)". */
const BLOCK_NAMES: Array<[string, boolean]> = [
  ['Reproduce with Playwright', false],
  ['Steps to reproduce', true],
  ['What this means', false],
  ['Why it matters', false],
  ['Browsers affected', false],
  ['Evidence attached', false],
  ['Correlation ID', true],
  ['Response body', true],
  ['Preconditions', false],
  ['How to fix', false],
  ['Environment', false],
  ['Screenshot', true],
  ['Tested by', false],
  ['Filed by', false],
  ['Run date', false],
  ['Expected', false],
  ['Summary', false],
  ['Actual', false],
  ['Owner', false],
  ['Repro', false],
  ['Trace', true],
  ['curl', false],
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const META_RE = new RegExp(`^(${META_NAMES.map(esc).join('|')})\\s*:(.*)$`, 'i');
const BLOCK_RE = BLOCK_NAMES.map(([name, suffix]) => new RegExp(`^(${esc(name)}${suffix ? '[^:\\n]*' : ''})\\s*:(.*)$`, 'i'));

/**
 * Real line endings. Some bench filings arrive with every newline escaped as a literal `\n` and
 * no real ones at all; only those are unescaped. A report that already has real lines keeps its
 * literal `\n`s - they are usually inside a JSON response body and part of the evidence.
 */
export function normalise(text: string): string {
  const unified = text.replace(/\r\n?/g, '\n');
  return unified.includes('\n') ? unified : unified.replace(/\\r\\n|\\n/g, '\n');
}

function blockHeading(line: string): { heading: string; rest: string } | null {
  for (const re of BLOCK_RE) {
    const m = re.exec(line);
    if (m) return { heading: m[1].trimEnd(), rest: m[2].trim() };
  }
  return null;
}

export function parseReport(text: string): ReportDoc {
  const doc: ReportDoc = [];
  let current: Segment | null = null;
  let seenBlock = false;

  for (const line of normalise(text).split('\n')) {
    // Header lines only in the opening run: once prose has started, "Endpoint: …" is part of it.
    if (!seenBlock && (current === null || current.meta)) {
      const meta = META_RE.exec(line);
      if (meta) {
        doc.push({ heading: meta[1], body: meta[2].trim(), meta: true });
        current = null;
        continue;
      }
    }
    const block = blockHeading(line);
    if (block) {
      seenBlock = true;
      current = { heading: block.heading, body: block.rest, meta: false };
      doc.push(current);
      continue;
    }
    if (!current) {
      if (line.trim() === '') continue;
      current = { heading: null, body: '', meta: false };
      doc.push(current);
    }
    current.body = current.body ? `${current.body}\n${line}` : line;
  }

  for (const s of doc) {
    s.body = s.body.replace(/^\n+/, '').trimEnd();
    if (s.heading !== null && !s.body.trim()) s.emptyInOriginal = true;
  }
  return doc;
}

export function serializeReport(doc: ReportDoc): string {
  const parts: string[] = [];
  const meta = doc.filter((s) => s.meta && (s.body.trim() || s.emptyInOriginal));
  if (meta.length) parts.push(meta.map((s) => `${s.heading}: ${s.body.replace(/\s*\n\s*/g, ' ').trim()}`.trimEnd()).join('\n'));

  for (const s of doc) {
    if (s.meta) continue;
    const body = s.body.trimEnd().replace(/^\n+/, '');
    if (!body.trim()) {
      if (s.emptyInOriginal) parts.push(`${s.heading}:`);
      continue;
    }
    if (s.heading === null) parts.push(body);
    else if (!body.includes('\n') && body.length <= 80) parts.push(`${s.heading}: ${body}`);
    else parts.push(`${s.heading}:\n${body}`);
  }
  return parts.join('\n\n');
}

// ---- The fields the editor shows by name ----

export type FieldKind = 'line' | 'text' | 'code';

export interface ReportField {
  key: string;
  label: string;
  /** Headings that hold this field (first match wins); null = the leading prose. */
  names: (string | null)[];
  kind: FieldKind;
  meta?: boolean;
  /** Heading written when the field is new. */
  write: string | null;
  placeholder?: string;
  group: 'overview' | 'reproduce' | 'result' | 'developer';
}

export const REPORT_FIELDS: ReportField[] = [
  { key: 'classification', label: 'Classification', names: ['Classification'], kind: 'line', meta: true, write: 'Classification', group: 'overview', placeholder: 'e.g. Input Validation Gap' },
  { key: 'endpoint', label: 'Endpoint', names: ['Representative endpoint', 'Endpoint'], kind: 'line', meta: true, write: 'Endpoint', group: 'overview', placeholder: 'e.g. POST /v2/auth/login' },
  { key: 'module', label: 'Module', names: ['Module'], kind: 'line', meta: true, write: 'Module', group: 'overview', placeholder: 'e.g. Auth' },
  { key: 'summary', label: 'Summary', names: [null, 'Summary'], kind: 'text', write: null, group: 'overview', placeholder: 'What is wrong, in plain words.' },
  { key: 'preconditions', label: 'Preconditions', names: ['Preconditions'], kind: 'text', write: 'Preconditions', group: 'reproduce' },
  { key: 'steps', label: 'Steps to reproduce', names: ['Steps to reproduce', 'Steps'], kind: 'text', write: 'Steps to reproduce', group: 'reproduce', placeholder: '1. Sign in as …\n2. Open …\n3. Click …' },
  { key: 'curl', label: 'curl', names: ['curl'], kind: 'code', write: 'curl', group: 'reproduce', placeholder: "curl -X POST 'https://…' -H 'Content-Type: application/json' -d '{…}'" },
  { key: 'repro', label: 'Playwright repro', names: ['Reproduce with Playwright', 'Repro'], kind: 'code', write: 'Reproduce with Playwright', group: 'reproduce' },
  { key: 'expected', label: 'Expected result', names: ['Expected'], kind: 'code', write: 'Expected', group: 'result', placeholder: 'no Authorization header → 401' },
  { key: 'actual', label: 'Actual result', names: ['Actual'], kind: 'code', write: 'Actual', group: 'result', placeholder: 'no Authorization header → 200' },
  { key: 'responseBody', label: 'Response body', names: ['Response body'], kind: 'code', write: 'Response body', group: 'result' },
  { key: 'whatThisMeans', label: 'What this means', names: ['What this means'], kind: 'text', write: 'What this means', group: 'developer' },
  { key: 'whyItMatters', label: 'Why it matters', names: ['Why it matters'], kind: 'text', write: 'Why it matters', group: 'developer' },
  { key: 'howToFix', label: 'How to fix', names: ['How to fix'], kind: 'text', write: 'How to fix', group: 'developer', placeholder: 'The change a developer should make.' },
];

/** Canonical order of the known fields, for placing a newly-added section sensibly. */
const ORDER = REPORT_FIELDS.map((f) => f.key);

function headingMatches(segment: Segment, name: string | null): boolean {
  if (name === null) return segment.heading === null;
  if (segment.heading === null) return false;
  const h = segment.heading.toLowerCase();
  const n = name.toLowerCase();
  return h === n || (h.startsWith(n) && /^[\s(]/.test(h.slice(n.length)));
}

export function fieldOf(segment: Segment): ReportField | undefined {
  return REPORT_FIELDS.find((f) => Boolean(f.meta) === segment.meta && f.names.some((n) => headingMatches(segment, n)));
}

function indexOfField(doc: ReportDoc, field: ReportField): number {
  for (const name of field.names) {
    const i = doc.findIndex((s) => Boolean(field.meta) === s.meta && headingMatches(s, name));
    if (i !== -1) return i;
  }
  return -1;
}

export function getField(doc: ReportDoc, key: string): string {
  const field = REPORT_FIELDS.find((f) => f.key === key)!;
  const i = indexOfField(doc, field);
  return i === -1 ? '' : doc[i].body;
}

export function setField(doc: ReportDoc, key: string, value: string): ReportDoc {
  const field = REPORT_FIELDS.find((f) => f.key === key)!;
  const next = doc.map((s) => ({ ...s }));
  const i = indexOfField(next, field);
  if (i !== -1) {
    next[i].body = field.meta ? value.replace(/\n/g, ' ') : value;
    return next;
  }
  if (!value.trim()) return next;

  const segment: Segment = { heading: field.write, body: field.meta ? value.replace(/\n/g, ' ') : value, meta: Boolean(field.meta) };
  if (field.meta) {
    const lastMeta = next.map((s) => s.meta).lastIndexOf(true);
    next.splice(lastMeta + 1, 0, segment);
    return next;
  }
  // After the closest known field that comes before it in the canonical order.
  const myOrder = ORDER.indexOf(field.key);
  let insertAt = next.map((s) => s.meta).lastIndexOf(true) + 1;
  next.forEach((s, idx) => {
    const f = fieldOf(s);
    if (f && !f.meta && ORDER.indexOf(f.key) < myOrder) insertAt = idx + 1;
  });
  next.splice(insertAt, 0, segment);
  return next;
}

/** Sections the editor has no named field for (Owner, Environment, a second Summary, …). */
export function otherSegments(doc: ReportDoc): { index: number; segment: Segment }[] {
  const claimed = new Set(REPORT_FIELDS.map((f) => indexOfField(doc, f)).filter((i) => i !== -1));
  return doc.map((segment, index) => ({ index, segment })).filter(({ index }) => !claimed.has(index));
}

export function setSegmentBody(doc: ReportDoc, index: number, body: string): ReportDoc {
  return doc.map((s, i) => (i === index ? { ...s, body } : s));
}

/** Keeps a `Category:` header line, if the report has one, in step with the category picker. */
export function syncCategoryLine(doc: ReportDoc, category: string): ReportDoc {
  return doc.map((s) => (s.meta && s.heading?.toLowerCase() === 'category' ? { ...s, body: category } : s));
}
