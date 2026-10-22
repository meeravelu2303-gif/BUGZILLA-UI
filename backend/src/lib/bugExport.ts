import ExcelJS from 'exceljs';
import type { NormalizedBug } from '../schemas/bug';
import { testTypeLabel, type Category, type Priority, type Severity, type Source, type TestType } from './classification';
import type { DefectReport } from './defectReport';

/**
 * Builds the bug list as a real Excel workbook (.xlsx), not a CSV renamed.
 *
 * The difference matters to the people opening it: a CSV loses every date
 * (Excel re-parses "2026-09-14T06:36:52Z" as text, or worse, as the wrong day
 * in a dd/mm locale), drops leading zeros, and opens with no header styling, no
 * filters and no frozen row. This writes typed cells - dates are dates, the
 * header is frozen, and every column already has an AutoFilter - so the sheet
 * is usable the moment it opens.
 */

/** One proof file on a bug (screenshot, video, trace, evidence text), for the export sheet. */
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
  /** Endpoints and Expected/Actual, parsed from the bug's description. */
  report: DefectReport;
  /** The bug's most recent comment - identical to the description when nothing has been added since. */
  lastComment?: { text: string; author: string; createdAt: string };
  /** Every comment after the description, newest first. */
  history?: Array<{ text: string; author: string; createdAt: string }>;
  /** Non-obsolete attachments (screenshots, videos, evidence), newest first. */
  proof?: BugProof[];
  /** The bug's full first comment, verbatim — nothing a developer needs is lost to column parsing. */
  description?: string;
  /** The text inside the bug's evidence files (request/response, crash diagnosis), newest first. */
  evidenceText?: string;
}

/** Excel refuses a cell over 32,767 characters and reports the whole file as corrupt. */
const CELL_LIMIT = 32_000;

function fitCell(text: string): string {
  return text.length > CELL_LIMIT ? `${text.slice(0, CELL_LIMIT)}… (truncated)` : text;
}

/**
 * Row height for wrapped cells.
 *
 * Excel does not grow a row to fit wrapped text in a file it did not write
 * itself - every row opens 15pt tall, so a three-endpoint cell shows one line
 * and hides the rest behind the row below. Estimate the line count per wrapped
 * column instead and set the height explicitly.
 */
function rowHeightFor(cells: Array<{ text: string; width: number }>): number {
  const lines = Math.max(
    1,
    ...cells.map(({ text, width }) =>
      text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / Math.max(1, width - 2))), 0)
    )
  );
  // 15pt per line plus a little air; Excel's hard ceiling is 409pt.
  return Math.min(409, lines * 15 + 4);
}

export interface ExportContext {
  /** Who pulled the file - recorded on the info sheet, since sheets get forwarded. */
  exportedBy: string;
  /** Human-readable description of the filters, so the sheet explains itself. */
  filters: Array<{ label: string; value: string }>;
  /** Origin of the web app, when known, so each bug id links back to its page. */
  appOrigin?: string;
  /**
   * A no-login link to a page with all of one bug's proof files (signed and expiring - see
   * lib/proofLinks). Bugzilla's own attachment link asks for a Bugzilla login the readers don't have.
   */
  proofLink?: (bugId: number) => string;
  /** Shown on the info sheet: the day the proof links stop working. */
  proofLinksUntil?: Date;
  /** Evidence pack only: the newest screenshot per bug, embedded as a row thumbnail. */
  thumbnails?: Map<number, { buffer: Buffer; extension: 'png' | 'jpeg' }>;
  now?: Date;
}

const BRAND = 'FF0D6875';

/**
 * Notes that are written again and again (by the test bench on every run, or by QA re-checking by hand).
 * Each new one replaces the last, so only the newest of each kind is still true: an older "still 1317px
 * wide on 1 Oct" re-check is out of date once a newer one says 1283px.
 */
const REPEATING_NOTE: Array<[kind: string, test: RegExp]> = [
  ['status', /^(Re-checked by the automated test bench|Correction to the automated note)/],
  ['reproduced', /^(Reproduced by kpost-testbench|Reopening: this defect was observed again)/],
  [
    'recheck',
    /^(Re-?checked|Re-?tested|Re-?verified|Re-?confirmed|Re-?observed|Reproduced again|Update \d{4}-\d\d-\d\d)/i,
  ],
];

/** Bugzilla's own line for every file upload - the Proof column already lists every file. */
const ATTACHMENT_NOTE = /^Created attachment \d+/;
const DUPLICATE_NOTE = /^\*\*\* Bug (\d+) has been marked as a duplicate of this bug\. \*\*\*$/;
/** A finding that stays true however many re-checks follow it - never dropped. */
const FINDING = /root cause|suggested fix|where it comes from|exact source of the problem/i;

type Comment = { text: string; author: string; createdAt: string };

/**
 * A bug's comments as a developer should read them, newest first: the newest of each repeating note,
 * every finding (a measured root cause, a suggested fix), and every other comment - a developer's reply
 * or a reopen explanation is never out of date. Bugzilla's "Created attachment" lines are dropped, and
 * the one-line-per-duplicate notices become a single "merged into this bug" line.
 */
export function currentComments(newestFirst: Comment[]): Comment[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  let duplicateAt: Comment | undefined;
  const kept = newestFirst.filter((c) => {
    const text = c.text.trim();
    if (ATTACHMENT_NOTE.test(text)) return false;
    const dup = text.match(DUPLICATE_NOTE);
    if (dup) {
      duplicates.push(`#${dup[1]}`);
      duplicateAt ??= c;
      return false;
    }
    const kind = REPEATING_NOTE.find(([, test]) => test.test(text))?.[0];
    if (!kind) return true;
    const newest = !seen.has(kind);
    seen.add(kind);
    // An automated note restates the bug's title, which can itself say "root cause" - so only a hand
    // re-check can count as a finding. A finding re-check still counts as that kind's newest, so an
    // older re-check behind it is dropped.
    return newest || (kind === 'recheck' && FINDING.test(text));
  });
  if (duplicateAt) {
    kept.push({
      ...duplicateAt,
      text: `Bugs merged into this one as duplicates: ${duplicates.sort().join(', ')}.`,
    });
    kept.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return kept;
}

/** Mirrors frontend `bugDisplayId`, so the sheet and the screen label bugs identically. */
export function bugDisplayId(bug: { id: number }): string {
  return `KPA-${String(bug.id).padStart(3, '0')}`;
}

/** Pale fills matching the app's badge palette - readable when printed, too. */
const SEVERITY_FILL: Partial<Record<Severity, string>> = {
  Critical: 'FFFFE4E6',
  Major: 'FFFFEDD5',
  Minor: 'FFFEF3C7',
  Trivial: 'FFF1F5F9',
};

/**
 * Excel cells carry no time zone. A JS `Date` is written as its UTC instant, so
 * a bug filed at 12:06 in Chennai would open reading 06:36 - correct, and wrong
 * to everyone looking at it. Shift to the server's wall-clock time instead, and
 * name the offset in the header so the value is never ambiguous.
 */
function toLocalWallClock(iso: string): Date | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
}

function offsetLabel(at: Date): string {
  const minutes = -at.getTimezoneOffset();
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

export async function buildBugWorkbook(bugs: ExportBug[], ctx: ExportContext): Promise<Buffer> {
  const now = ctx.now ?? new Date();
  const tz = offsetLabel(now);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Bug Tracker';
  wb.created = now;

  // ------------------------------------------------------------------ Bugs --
  const sheet = wb.addWorksheet('Bugs', {
    // Header stays put while scrolling a 1,000-row sheet.
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  /*
   * Reading order, left to right: what the bug is, WHERE it is (component next
   * to its endpoints), how bad it is, then what was expected against what came
   * back - the pair a developer needs side by side - and only then the
   * workflow and people columns.
   */
  sheet.columns = [
    { header: 'Bug ID', key: 'displayId', width: 12 },
    { header: 'Summary', key: 'summary', width: 55 },
    // Evidence pack only — a picture people can glance at. (Claude reads cells, not embedded pictures,
    // which is why the same screenshots also sit as real files in each bug's folder of the pack.)
    ...(ctx.thumbnails ? [{ header: 'Screenshot', key: 'thumbnail', width: 30 }] : []),
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
    { header: `Created (${tz})`, key: 'created', width: 18 },
    { header: `Last Changed (${tz})`, key: 'changed', width: 18 },
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
  // ~8 lines: every row stays scannable; a longer cell still holds its full text (click to read all).
  const MAX_ROW_HEIGHT = 120;

  for (const bug of bugs) {
    const { report } = bug;
    const values = {
      displayId: bugDisplayId(bug),
      summary: bug.summary,
      // The bug's own plain-English narrative - the first thing a developer should read.
      narrative: fitCell(report.narrative),
      product: bug.product,
      component: bug.component,
      subcomponent: bug.subcomponentName,
      // One endpoint per line: a comma-joined list of URL paths is unreadable.
      endpoints: fitCell(report.endpoints.join('\n')),
      // Same four labels the list badge shows (UI/API Automation, Manual UI/API test).
      testType: testTypeLabel(bug.triage.source, bug.triage.testType),
      classification: report.classification,
      severity: bug.triage.severity,
      priority: bug.triage.priority,
      category: bug.triage.category,
      // Numbered repro steps - the only detail some UI bugs have (no Expected/Actual pair).
      steps: fitCell(report.steps),
      expectedStatus: report.expectedStatus,
      actualStatus: report.actualStatus,
      expected: fitCell(report.expected),
      actual: fitCell(report.actual),
      // Blank for UI bugs (they have `steps` instead) — a runnable repro command, not prose, so a
      // developer or an assistant working from this sheet alone can reproduce the failure directly.
      curl: fitCell(report.curl),
      // Every proof file with its date, newest first — the date is what tells a developer whether
      // the evidence is from today's re-check or from when the bug was first filed.
      evidenceText: fitCell(bug.evidenceText ?? ''),
      description: fitCell(bug.description ?? ''),
      proof: fitCell(
        (bug.proof ?? []).map((p) => `${p.createdAt.slice(0, 16).replace('T', ' ')}  ${p.fileName}`).join('\n')
      ),
      browsers: bug.triage.browsers.join(', '),
      // One column: the newest comment first (the current word on the bug), then every comment still
      // worth reading - see currentComments. Newest first: if the cell has to be cut, the oldest go.
      history: fitCell(
        currentComments(bug.history ?? [])
          .map((c) => `[${c.createdAt.slice(0, 16).replace('T', ' ')} UTC] ${c.author}:\n${c.text.trim()}`)
          .join('\n\n')
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

    if (ctx.appOrigin) {
      const idCell = row.getCell('displayId');
      idCell.value = {
        text: bugDisplayId(bug),
        hyperlink: `${ctx.appOrigin}/bugs/${bug.id}`,
      };
      idCell.font = { color: { argb: BRAND }, underline: true };
    }

    if (bug.proof?.length && ctx.proofLink) {
      const cell = row.getCell('proof');
      cell.value = {
        text: `Open all proof (no login) ▸\n${values.proof}`,
        hyperlink: ctx.proofLink(bug.id),
      };
      cell.font = { color: { argb: BRAND }, underline: true };
    }

    // A command reads as a command in a monospace face - the one typographic cue that tells a
    // developer "paste this into a terminal" rather than "this is more prose to read".
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

    // Tint the pair so the eye finds it: green for the contract, red for what broke it.
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
    // A status mismatch is the headline of an API bug - make it unmissable.
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

    // Long evidence/description cells stay wrapped and complete, but do not set the row height —
    // otherwise every row stretches to Excel's maximum and the sheet stops being scannable.
    const height = rowHeightFor(
      WRAPPED.filter((key) => !LONG_TEXT.has(key)).map((key) => ({
        text: String(values[key] ?? ''),
        width: widthOf(key),
      }))
    );
    const thumb = ctx.thumbnails?.get(bug.id);
    if (thumb) {
      const imageId = wb.addImage({
        buffer: thumb.buffer as unknown as ExcelJS.Buffer,
        extension: thumb.extension,
      });
      const col = sheet.getColumn('thumbnail').number - 1;
      sheet.addImage(imageId, {
        tl: { col: col + 0.05, row: row.number - 1 + 0.05 },
        ext: { width: 200, height: 120 },
        editAs: 'oneCell',
      });
    }
    row.height = Math.min(MAX_ROW_HEIGHT, Math.max(height, thumb ? 96 : 0));
  }

  sheet.getColumn('created').numFmt = 'yyyy-mm-dd hh:mm';
  sheet.getColumn('changed').numFmt = 'yyyy-mm-dd hh:mm';

  // Top-align everything so a tall wrapped row still reads left to right;
  // wrap the long-text columns; centre the two short status columns.
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
  // Wrapped so the narrow "Expected Status" column does not truncate its own title.
  header.alignment = { vertical: 'middle', wrapText: true };
  header.height = 32;

  // AutoFilter over the used range, so every column is sortable/filterable on
  // open. Skipped on an empty export: a filter over a header-only range is
  // rejected by some Excel builds as a corrupt file.
  if (bugs.length > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sheet.columnCount },
    };
  }

  // ---------------------------------------------------------- Export info --
  /*
   * Spreadsheets get forwarded, and a forwarded sheet of 92 bugs says nothing
   * about WHICH 92. This sheet records the filters, who exported it and when,
   * so the file still explains itself a week later in someone else's inbox.
   */
  const info = wb.addWorksheet('Export info');
  info.columns = [
    { key: 'label', width: 22 },
    { key: 'value', width: 60 },
  ];
  const infoRows: Array<[string, string | number]> = [
    ['Exported at', `${now.toLocaleString('en-GB', { hour12: false })} (${tz})`],
    ['Exported by', ctx.exportedBy],
    ['Bugs in this file', bugs.length],
    ...(ctx.proofLinksUntil
      ? [
          [
            'Proof links work until',
            `${ctx.proofLinksUntil.toISOString().slice(0, 10)} - no login needed, office network only`,
          ] as [string, string],
        ]
      : []),
    ['', ''],
    ['Filters', ctx.filters.length === 0 ? 'None - every bug you can access' : ''],
    ...ctx.filters.map((f): [string, string] => [`  ${f.label}`, f.value]),
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

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
