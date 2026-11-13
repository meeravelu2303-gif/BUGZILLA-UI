/** A bug report as editable sections, and back to text. */
export interface Segment {
  heading: string | null;
  body: string;
  meta: boolean;
  emptyInOriginal?: boolean;
}

export type ReportDoc = Segment[];

const META_NAMES = ['Representative endpoint', 'Classification', 'Category', 'Endpoint', 'Module', 'Severity'];

const BLOCK_NAMES: Array<[string, boolean]> = [
  ['Reproduce with Playwright', false],
  ['Steps to reproduce', true],
  ['What this means', false],
  ['Why it matters', false],
  ['Browsers affected', false],
  ['Platform', false],
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

const esc = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const META_RE = new RegExp(`^(${META_NAMES.map(esc).join('|')})\\s*:(.*)$`, 'i');
const BLOCK_RE = BLOCK_NAMES.map(
  ([name, suffix]) => new RegExp(`^(${esc(name)}${suffix ? '[^:\\n]*' : ''})\\s*:(.*)$`, 'i'),
);

/** Real line endings. */
export function normalise(text: string): string {
  const unified = text.replace(/\r\n?/g, '\n');
  return unified.includes('\n') ? unified : unified.replace(/\\r\\n|\\n/g, '\n');
}

function blockHeading(line: string): { heading: string; rest: string } | null {
  for (const pattern of BLOCK_RE) {
    const match = pattern.exec(line);
    if (match) return { heading: match[1].trimEnd(), rest: match[2].trim() };
  }
  return null;
}

export function parseReport(text: string): ReportDoc {
  const doc: ReportDoc = [];
  let current: Segment | null = null;
  let seenBlock = false;

  for (const line of normalise(text).split('\n')) {
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

  for (const segment of doc) {
    segment.body = segment.body.replace(/^\n+/, '').trimEnd();
    if (segment.heading !== null && !segment.body.trim()) segment.emptyInOriginal = true;
  }
  return doc;
}

export function serializeReport(doc: ReportDoc): string {
  const parts: string[] = [];
  const meta = doc.filter((segment) => segment.meta && (segment.body.trim() || segment.emptyInOriginal));
  if (meta.length)
    parts.push(
      meta
        .map((segment) => `${segment.heading}: ${segment.body.replace(/\s*\n\s*/g, ' ').trim()}`.trimEnd())
        .join('\n'),
    );

  for (const segment of doc) {
    if (segment.meta) continue;
    const body = segment.body.trimEnd().replace(/^\n+/, '');
    if (!body.trim()) {
      if (segment.emptyInOriginal) parts.push(`${segment.heading}:`);
      continue;
    }
    if (segment.heading === null) parts.push(body);
    else if (!body.includes('\n') && body.length <= 80) parts.push(`${segment.heading}: ${body}`);
    else parts.push(`${segment.heading}:\n${body}`);
  }
  return parts.join('\n\n');
}

/** ---- The fields the editor shows by name ----. */
export type FieldKind = 'line' | 'text' | 'code';

export interface ReportField {
  key: string;
  label: string;
  names: (string | null)[];
  kind: FieldKind;
  meta?: boolean;
  write: string | null;
  placeholder?: string;
  group: 'overview' | 'reproduce' | 'result' | 'developer';
}

export const REPORT_FIELDS: ReportField[] = [
  {
    key: 'classification',
    label: 'Classification',
    names: ['Classification'],
    kind: 'line',
    meta: true,
    write: 'Classification',
    group: 'overview',
    placeholder: 'e.g. Input Validation Gap',
  },
  {
    key: 'endpoint',
    label: 'Endpoint',
    names: ['Representative endpoint', 'Endpoint'],
    kind: 'line',
    meta: true,
    write: 'Endpoint',
    group: 'overview',
    placeholder: 'e.g. POST /v2/auth/login',
  },
  {
    key: 'module',
    label: 'Module',
    names: ['Module'],
    kind: 'line',
    meta: true,
    write: 'Module',
    group: 'overview',
    placeholder: 'e.g. Auth',
  },
  {
    key: 'summary',
    label: 'Summary',
    names: [null, 'Summary'],
    kind: 'text',
    write: null,
    group: 'overview',
    placeholder: 'What is wrong, in plain words.',
  },
  {
    key: 'preconditions',
    label: 'Preconditions',
    names: ['Preconditions'],
    kind: 'text',
    write: 'Preconditions',
    group: 'reproduce',
  },
  {
    key: 'steps',
    label: 'Steps to reproduce',
    names: ['Steps to reproduce', 'Steps'],
    kind: 'text',
    write: 'Steps to reproduce',
    group: 'reproduce',
    placeholder: '1. Sign in as …\n2. Open …\n3. Click …',
  },
  {
    key: 'curl',
    label: 'curl',
    names: ['curl'],
    kind: 'code',
    write: 'curl',
    group: 'reproduce',
    placeholder: "curl -X POST 'https://…' -H 'Content-Type: application/json' -d '{…}'",
  },
  {
    key: 'repro',
    label: 'Playwright repro',
    names: ['Reproduce with Playwright', 'Repro'],
    kind: 'code',
    write: 'Reproduce with Playwright',
    group: 'reproduce',
  },
  {
    key: 'expected',
    label: 'Expected result',
    names: ['Expected'],
    kind: 'code',
    write: 'Expected',
    group: 'result',
    placeholder: 'no Authorization header → 401',
  },
  {
    key: 'actual',
    label: 'Actual result',
    names: ['Actual'],
    kind: 'code',
    write: 'Actual',
    group: 'result',
    placeholder: 'no Authorization header → 200',
  },
  {
    key: 'responseBody',
    label: 'Response body',
    names: ['Response body'],
    kind: 'code',
    write: 'Response body',
    group: 'result',
  },
  {
    key: 'whatThisMeans',
    label: 'What this means',
    names: ['What this means'],
    kind: 'text',
    write: 'What this means',
    group: 'developer',
  },
  {
    key: 'whyItMatters',
    label: 'Why it matters',
    names: ['Why it matters'],
    kind: 'text',
    write: 'Why it matters',
    group: 'developer',
  },
  {
    key: 'howToFix',
    label: 'How to fix',
    names: ['How to fix'],
    kind: 'text',
    write: 'How to fix',
    group: 'developer',
    placeholder: 'The change a developer should make.',
  },
];

const ORDER = REPORT_FIELDS.map((reportField) => reportField.key);

function headingMatches(segment: Segment, name: string | null): boolean {
  if (name === null) return segment.heading === null;
  if (segment.heading === null) return false;
  const normalizedHeading = segment.heading.toLowerCase();
  const normalizedName = name.toLowerCase();
  return (
    normalizedHeading === normalizedName ||
    (normalizedHeading.startsWith(normalizedName) && /^[\s(]/.test(normalizedHeading.slice(normalizedName.length)))
  );
}

export function fieldOf(segment: Segment): ReportField | undefined {
  return REPORT_FIELDS.find(
    (reportField) =>
      Boolean(reportField.meta) === segment.meta && reportField.names.some((name) => headingMatches(segment, name)),
  );
}

function indexOfField(doc: ReportDoc, field: ReportField): number {
  for (const name of field.names) {
    const i = doc.findIndex((segment) => Boolean(field.meta) === segment.meta && headingMatches(segment, name));
    if (i !== -1) return i;
  }
  return -1;
}

export function getField(doc: ReportDoc, key: string): string {
  const field = REPORT_FIELDS.find((reportField) => reportField.key === key)!;
  const i = indexOfField(doc, field);
  return i === -1 ? '' : doc[i].body;
}

export function setField(doc: ReportDoc, key: string, value: string): ReportDoc {
  const field = REPORT_FIELDS.find((reportField) => reportField.key === key)!;
  const next = doc.map((segmentItem) => ({ ...segmentItem }));
  const i = indexOfField(next, field);
  if (i !== -1) {
    next[i].body = field.meta ? value.replace(/\n/g, ' ') : value;
    return next;
  }
  if (!value.trim()) return next;

  const segment: Segment = {
    heading: field.write,
    body: field.meta ? value.replace(/\n/g, ' ') : value,
    meta: Boolean(field.meta),
  };
  if (field.meta) {
    const lastMeta = next.map((item) => item.meta).lastIndexOf(true);
    next.splice(lastMeta + 1, 0, segment);
    return next;
  }
  const myOrder = ORDER.indexOf(field.key);
  let insertAt = next.map((item) => item.meta).lastIndexOf(true) + 1;
  next.forEach((item, index) => {
    const reportField = fieldOf(item);
    if (reportField && !reportField.meta && ORDER.indexOf(reportField.key) < myOrder) insertAt = index + 1;
  });
  next.splice(insertAt, 0, segment);
  return next;
}

/** Sections the editor has no named field for (Owner, Environment, a second Summary, …). */
export function otherSegments(doc: ReportDoc): { index: number; segment: Segment }[] {
  const claimed = new Set(REPORT_FIELDS.map((reportField) => indexOfField(doc, reportField)).filter((i) => i !== -1));
  return doc.map((segment, index) => ({ index, segment })).filter(({ index }) => !claimed.has(index));
}

export function setSegmentBody(doc: ReportDoc, index: number, body: string): ReportDoc {
  return doc.map((segment, i) => (i === index ? { ...segment, body } : segment));
}

/** Keeps a Category: header line, if the report has one, in step with the category picker. */
export function syncCategoryLine(doc: ReportDoc, category: string): ReportDoc {
  return doc.map((segment) =>
    segment.meta && segment.heading?.toLowerCase() === 'category' ? { ...segment, body: category } : segment,
  );
}
