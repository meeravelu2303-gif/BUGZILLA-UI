import ExcelJS from 'exceljs';
import type { NormalizedBug } from '../dto/bug.dto';
import {
  testTypeLabel,
  type Category,
  type Priority,
  type Severity,
  type Source,
  type TestType,
} from './classification.service';
import type { DefectReport } from './defectReport.service';

/** Builds the bug list as a real Excel workbook (.xlsx), not a CSV renamed. */
export interface BugProof {
  id: number;
  fileName: string;
  summary: string;
  createdAt: string;
  contentType: string;
  size: number;
}

export interface ExportBug extends NormalizedBug {
  triage: {
    severity: Severity;
    priority: Priority;
    category: Category;
    browsers: string[];
    source: Source;
    testType: TestType;
  };
  report: DefectReport;
  lastComment?: { text: string; author: string; createdAt: string };
  history?: Array<{ text: string; author: string; createdAt: string }>;
  proof?: BugProof[];
  description?: string;
  evidenceText?: string;
}

const CELL_LIMIT = 32_000;

function fitCell(text: string): string {
  return text.length > CELL_LIMIT ? `${text.slice(0, CELL_LIMIT)}… (truncated)` : text;
}

function rowHeightFor(cells: Array<{ text: string; width: number }>): number {
  const lines = Math.max(
    1,
    ...cells.map(({ text, width }) =>
      text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / Math.max(1, width - 2))), 0),
    ),
  );
  return Math.min(409, lines * 15 + 4);
}

export interface ExportContext {
  exportedBy: string;
  filters: Array<{ label: string; value: string }>;
  appOrigin?: string;
  proofLink?: (bugId: number) => string;
  proofLinksUntil?: Date;
  thumbnails?: Map<number, { buffer: Buffer; extension: 'png' | 'jpeg' }>;
  now?: Date;
}

const BRAND = 'FF0D6875';

const REPEATING_NOTE: Array<[kind: string, test: RegExp]> = [
  ['status', /^(Re-checked by the automated test bench|Correction to the automated note)/],
  ['reproduced', /^(Reproduced by kpost-testbench|Reopening: this defect was observed again)/],
  [
    'recheck',
    /^(Re-?checked|Re-?tested|Re-?verified|Re-?confirmed|Re-?observed|Reproduced again|Update \d{4}-\d\d-\d\d)/i,
  ],
];

const ATTACHMENT_NOTE = /^Created attachment \d+/;
const DUPLICATE_NOTE = /^\*\*\* Bug (\d+) has been marked as a duplicate of this bug\. \*\*\*$/;
const FINDING = /root cause|suggested fix|where it comes from|exact source of the problem/i;

type Comment = { text: string; author: string; createdAt: string };

/** A bug's comments as a developer should read them. */
export function currentComments(newestFirst: Comment[]): Comment[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  let duplicateAt: Comment | undefined;
  const kept = newestFirst.filter((comment) => {
    const text = comment.text.trim();
    if (ATTACHMENT_NOTE.test(text)) return false;
    const duplicate = text.match(DUPLICATE_NOTE);
    if (duplicate) {
      duplicates.push(`#${duplicate[1]}`);
      duplicateAt ??= comment;
      return false;
    }
    const kind = REPEATING_NOTE.find(([, test]) => test.test(text))?.[0];
    if (!kind) return true;
    const newest = !seen.has(kind);
    seen.add(kind);
    return newest || (kind === 'recheck' && FINDING.test(text));
  });
  if (duplicateAt) {
    kept.push({
      ...duplicateAt,
      text: `Bugs merged into this one as duplicates: ${duplicates.sort().join(', ')}.`,
    });
    kept.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }
  return kept;
}

/** Mirrors frontend bugDisplayId, so the sheet and the screen label bugs identically. */
export function bugDisplayId(bug: { id: number }): string {
  return `KPA-${String(bug.id).padStart(3, '0')}`;
}

const SEVERITY_FILL: Partial<Record<Severity, string>> = {
  Critical: 'FFFFE4E6',
  Major: 'FFFFEDD5',
  Minor: 'FFFEF3C7',
  Trivial: 'FFF1F5F9',
};

function toLocalWallClock(iso: string): Date | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
}

function offsetLabel(at: Date): string {
  const minutes = -at.getTimezoneOffset();
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

export async function buildBugWorkbook(bugs: ExportBug[], context: ExportContext): Promise<Buffer> {
  const now = context.now ?? new Date();
  const timeZone = offsetLabel(now);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Bug Tracker';
  workbook.created = now;

  const sheet = workbook.addWorksheet('Bugs', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  sheet.columns = [
    { header: 'Bug ID', key: 'displayId', width: 12 },
    { header: 'Summary', key: 'summary', width: 55 },
    ...(context.thumbnails ? [{ header: 'Screenshot', key: 'thumbnail', width: 30 }] : []),
    { header: 'Narrative', key: 'narrative', width: 50 },
    { header: 'Product', key: 'product', width: 14 },
    { header: 'Component', key: 'component', width: 24 },
    { header: 'Sub-component', key: 'subcomponent', width: 20 },
    { header: 'Endpoints', key: 'endpoints', width: 44 },
    { header: 'Test Type', key: 'testType', width: 15 },
    { header: 'Classification', key: 'classification', width: 28 },
    { header: 'Severity', key: 'severity', width: 11 },
    { header: 'Priority', key: 'priority', width: 9 },
    { header: 'Category', key: 'category', width: 13 },
    { header: 'Steps to Reproduce', key: 'steps', width: 50 },
    { header: 'Expected Status', key: 'expectedStatus', width: 11 },
    { header: 'Actual Status', key: 'actualStatus', width: 11 },
    { header: 'Expected', key: 'expected', width: 42 },
    { header: 'Actual', key: 'actual', width: 42 },
    { header: 'Reproduction (curl)', key: 'curl', width: 55 },
    { header: 'Evidence files (text)', key: 'evidenceText', width: 60 },
    { header: 'Proof (newest first)', key: 'proof', width: 50 },
    { header: 'Full description (as filed)', key: 'description', width: 70 },
    { header: 'Browsers', key: 'browsers', width: 16 },
    { header: 'Comments (newest first)', key: 'history', width: 70 },
    { header: 'Status', key: 'status', width: 13 },
    { header: 'Resolution', key: 'resolution', width: 12 },
    { header: 'Assignee', key: 'assignee', width: 22 },
    { header: 'Assignee Email', key: 'assigneeEmail', width: 26 },
    { header: 'Reporter', key: 'reporter', width: 20 },
    { header: `Created (${timeZone})`, key: 'created', width: 18 },
    { header: `Last Changed (${timeZone})`, key: 'changed', width: 18 },
  ];

  const WRAPPED = [
    'summary',
    'narrative',
    'endpoints',
    'classification',
    'steps',
    'expected',
    'actual',
    'curl',
    'evidenceText',
    'proof',
    'description',
    'history',
  ] as const;
  const widthOf = (key: string) => sheet.getColumn(key).width ?? 10;
  const LONG_TEXT = new Set(['description', 'evidenceText', 'history', 'curl', 'proof']);
  const MAX_ROW_HEIGHT = 120;

  for (const bug of bugs) {
    const { report } = bug;
    const values = {
      displayId: bugDisplayId(bug),
      summary: bug.summary,
      narrative: fitCell(report.narrative),
      product: bug.product,
      component: bug.component,
      subcomponent: bug.subcomponentName,
      endpoints: fitCell(report.endpoints.join('\n')),
      testType: testTypeLabel(bug.triage.source, bug.triage.testType),
      classification: report.classification,
      severity: bug.triage.severity,
      priority: bug.triage.priority,
      category: bug.triage.category,
      steps: fitCell(report.steps),
      expectedStatus: report.expectedStatus,
      actualStatus: report.actualStatus,
      expected: fitCell(report.expected),
      actual: fitCell(report.actual),
      curl: fitCell(report.curl),
      evidenceText: fitCell(bug.evidenceText ?? ''),
      description: fitCell(bug.description ?? ''),
      proof: fitCell(
        (bug.proof ?? [])
          .map((proof) => `${proof.createdAt.slice(0, 16).replace('T', ' ')}  ${proof.fileName}`)
          .join('\n'),
      ),
      browsers: bug.triage.browsers.join(', '),
      history: fitCell(
        currentComments(bug.history ?? [])
          .map(
            (comment) =>
              `[${comment.createdAt.slice(0, 16).replace('T', ' ')} UTC] ${comment.author}:\n${comment.text.trim()}`,
          )
          .join('\n\n'),
      ),
      status: bug.status,
      resolution: bug.resolution,
      assignee: bug.assignedTo?.name ?? '',
      assigneeEmail: bug.assignedTo?.email ?? '',
      reporter: bug.creator?.name ?? '',
      created: toLocalWallClock(bug.creationTime),
      changed: toLocalWallClock(bug.lastChangeTime),
    };
    const row = sheet.addRow(values);

    if (context.appOrigin) {
      const idCell = row.getCell('displayId');
      idCell.value = {
        text: bugDisplayId(bug),
        hyperlink: `${context.appOrigin}/bugs/${bug.id}`,
      };
      idCell.font = { color: { argb: BRAND }, underline: true };
    }

    if (bug.proof?.length && context.proofLink) {
      const cell = row.getCell('proof');
      cell.value = {
        text: `Open all proof (no login) ▸\n${values.proof}`,
        hyperlink: context.proofLink(bug.id),
      };
      cell.font = { color: { argb: BRAND }, underline: true };
    }

    if (report.curl) {
      row.getCell('curl').font = { name: 'Consolas', size: 10 };
    }

    const fill = SEVERITY_FILL[bug.triage.severity];
    if (fill) {
      row.getCell('severity').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: fill },
      };
    }

    if (report.expected) {
      row.getCell('expected').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFECFDF5' },
      };
    }
    if (report.actual) {
      row.getCell('actual').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFF1F2' },
      };
    }
    if (report.actualStatus && report.actualStatus !== report.expectedStatus) {
      row.getCell('actualStatus').font = {
        bold: true,
        color: { argb: 'FFBE123C' },
      };
    }
    if (report.expectedStatus) {
      row.getCell('expectedStatus').font = {
        bold: true,
        color: { argb: 'FF047857' },
      };
    }

    const height = rowHeightFor(
      WRAPPED.filter((key) => !LONG_TEXT.has(key)).map((key) => ({
        text: String(values[key] ?? ''),
        width: widthOf(key),
      })),
    );
    const thumb = context.thumbnails?.get(bug.id);
    if (thumb) {
      const imageId = workbook.addImage({
        buffer: thumb.buffer as unknown as ExcelJS.Buffer,
        extension: thumb.extension,
      });
      const column = sheet.getColumn('thumbnail').number - 1;
      sheet.addImage(imageId, {
        tl: { col: column + 0.05, row: row.number - 1 + 0.05 },
        ext: { width: 200, height: 120 },
        editAs: 'oneCell',
      });
    }
    row.height = Math.min(MAX_ROW_HEIGHT, Math.max(height, thumb ? 96 : 0));
  }

  sheet.getColumn('created').numFmt = 'yyyy-mm-dd hh:mm';
  sheet.getColumn('changed').numFmt = 'yyyy-mm-dd hh:mm';

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = { vertical: 'top' };
    });
    for (const key of WRAPPED) row.getCell(key).alignment = { vertical: 'top', wrapText: true };
    for (const key of ['expectedStatus', 'actualStatus']) {
      row.getCell(key).alignment = { vertical: 'top', horizontal: 'center' };
    }
  });

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  header.alignment = { vertical: 'middle', wrapText: true };
  header.height = 32;

  if (bugs.length > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sheet.columnCount },
    };
  }

  const info = workbook.addWorksheet('Export info');
  info.columns = [
    { key: 'label', width: 22 },
    { key: 'value', width: 60 },
  ];
  const infoRows: Array<[string, string | number]> = [
    ['Exported at', `${now.toLocaleString('en-GB', { hour12: false })} (${timeZone})`],
    ['Exported by', context.exportedBy],
    ['Bugs in this file', bugs.length],
    ...(context.proofLinksUntil
      ? [
          [
            'Proof links work until',
            `${context.proofLinksUntil.toISOString().slice(0, 10)} - no login needed, office network only`,
          ] as [string, string],
        ]
      : []),
    ['', ''],
    ['Filters', context.filters.length === 0 ? 'None - every bug you can access' : ''],
    ...context.filters.map((filter): [string, string] => [`  ${filter.label}`, filter.value]),
    ['', ''],
    ['About the columns', ''],
    [
      '  Narrative',
      'The bug\'s own plain-English description - its "Summary:" paragraph, or the opening prose when there is no explicit Summary label. Read this first.',
    ],
    ['  Endpoints', 'Every endpoint the failure affects, one per line. Blank for UI bugs.'],
    [
      '  Steps to Reproduce',
      'Numbered repro steps, verbatim from the bug. The main detail for UI bugs that have no Expected/Actual status pair (e.g. a missing control or a silent no-op).',
    ],
    ['  Expected / Actual', 'Taken from the bug description, one check per line as "check → value".'],
    [
      '  Expected / Actual Status',
      'Filled only when the checks are HTTP status codes. Blank when a bug checks something else (e.g. response headers) - see Expected / Actual.',
    ],
    [
      '  Reproduction (curl)',
      'The exact runnable curl command the bench used to find this failure, verbatim from the bug description. Blank for UI bugs (see Steps to Reproduce instead). Paste it directly into a terminal to reproduce the failure without opening Bugzilla.',
    ],
    [
      '  Evidence files (text)',
      "The actual contents of the bug's text evidence files (the request and response, a crash explanation), newest first. This is the evidence itself, not just a file name, so anyone reading the sheet - or Claude - has it without opening Bugzilla.",
    ],
    [
      '  Full description (as filed)',
      'The complete original bug report, word for word. The other columns pick pieces out of it; this one keeps everything.',
    ],
    [
      '  Screenshot',
      "Only in the evidence-pack (.zip) copy of this sheet: the newest screenshot of the bug. The same screenshot, and every other proof file, is also in the bug's own folder inside the pack.",
    ],
    [
      '  Proof (newest first)',
      'Every screenshot, video, trace and evidence file attached to the bug, with the date it was attached (UTC), newest first. Click the cell to open a page with all of this bug\'s screenshots (shown) and videos (playable) - no Bugzilla login needed, from any machine on the office network. The links stop working after the "Proof links work until" date above; export again for fresh ones. A date from the latest test run means the failure was re-confirmed with fresh proof that day.',
    ],
    [
      '  Comments (newest first)',
      "The bug's comments with date and author, newest first - the top one is the latest word on where the bug stands. The test bench writes a dated status note on every run; only the newest one is kept here, because each new note replaces the last. Every comment from a developer or a QA person (for example a measured root cause) is always kept.",
    ],
  ];
  for (const [label, value] of infoRows) info.addRow({ label, value });
  info.getColumn('label').font = { bold: true };
  info.getColumn('value').alignment = { wrapText: true, vertical: 'top' };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
