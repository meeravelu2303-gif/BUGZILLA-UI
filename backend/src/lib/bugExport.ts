import ExcelJS from 'exceljs';
import type { NormalizedBug } from '../schemas/bug';
import type { Category, Priority, Severity } from './classification';
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

export interface ExportBug extends NormalizedBug {
  triage: { severity: Severity; priority: Priority; category: Category; browsers: string[] };
  /** Endpoints and Expected/Actual, parsed from the bug's description. */
  report: DefectReport;
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
  now?: Date;
}

const BRAND = 'FF0D6875';

/** Mirrors frontend `bugDisplayId`, so the sheet and the screen label bugs identically. */
export function bugDisplayId(bug: { id: number; alias: string[] }): string {
  return bug.alias[0] || `KPA-${String(bug.id).padStart(3, '0')}`;
}

/** Mirrors frontend `TestTypePill`: the product name decides which bench a bug came from. */
function testTypeOf(product: string): string {
  if (/\bUI\b/i.test(product)) return 'UI Automation';
  if (/\bAPI\b/i.test(product) || /\bAdmin\b/i.test(product)) return 'API Automation';
  return '';
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
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
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
    { header: 'Product', key: 'product', width: 14 },
    { header: 'Component', key: 'component', width: 24 },
    { header: 'Endpoints', key: 'endpoints', width: 44 },
    { header: 'Test Type', key: 'testType', width: 15 },
    { header: 'Classification', key: 'classification', width: 28 },
    { header: 'Severity', key: 'severity', width: 11 },
    { header: 'Priority', key: 'priority', width: 9 },
    { header: 'Category', key: 'category', width: 13 },
    { header: 'Expected Status', key: 'expectedStatus', width: 11 },
    { header: 'Actual Status', key: 'actualStatus', width: 11 },
    { header: 'Expected', key: 'expected', width: 42 },
    { header: 'Actual', key: 'actual', width: 42 },
    { header: 'Browsers', key: 'browsers', width: 16 },
    { header: 'Status', key: 'status', width: 13 },
    { header: 'Resolution', key: 'resolution', width: 12 },
    { header: 'Assignee', key: 'assignee', width: 22 },
    { header: 'Assignee Email', key: 'assigneeEmail', width: 26 },
    { header: 'Reporter', key: 'reporter', width: 20 },
    { header: `Created (${tz})`, key: 'created', width: 18 },
    { header: `Last Changed (${tz})`, key: 'changed', width: 18 },
  ];

  const WRAPPED = ['summary', 'endpoints', 'classification', 'expected', 'actual'] as const;
  const widthOf = (key: string) => sheet.getColumn(key).width ?? 10;

  for (const bug of bugs) {
    const { report } = bug;
    const values = {
      displayId: bugDisplayId(bug),
      summary: bug.summary,
      product: bug.product,
      component: bug.component,
      // One endpoint per line: a comma-joined list of URL paths is unreadable.
      endpoints: fitCell(report.endpoints.join('\n')),
      testType: testTypeOf(bug.product),
      classification: report.classification,
      severity: bug.triage.severity,
      priority: bug.triage.priority,
      category: bug.triage.category,
      expectedStatus: report.expectedStatus,
      actualStatus: report.actualStatus,
      expected: fitCell(report.expected),
      actual: fitCell(report.actual),
      browsers: bug.triage.browsers.join(', '),
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
      idCell.value = { text: bugDisplayId(bug), hyperlink: `${ctx.appOrigin}/bugs/${bug.id}` };
      idCell.font = { color: { argb: BRAND }, underline: true };
    }

    const fill = SEVERITY_FILL[bug.triage.severity];
    if (fill) {
      row.getCell('severity').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    }

    // Tint the pair so the eye finds it: green for the contract, red for what broke it.
    if (report.expected) {
      row.getCell('expected').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
    }
    if (report.actual) {
      row.getCell('actual').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1F2' } };
    }
    // A status mismatch is the headline of an API bug - make it unmissable.
    if (report.actualStatus && report.actualStatus !== report.expectedStatus) {
      row.getCell('actualStatus').font = { bold: true, color: { argb: 'FFBE123C' } };
    }
    if (report.expectedStatus) {
      row.getCell('expectedStatus').font = { bold: true, color: { argb: 'FF047857' } };
    }

    row.height = rowHeightFor(WRAPPED.map((key) => ({ text: String(values[key] ?? ''), width: widthOf(key) })));
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
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
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
    ['', ''],
    ['Filters', ctx.filters.length === 0 ? 'None - every bug you can access' : ''],
    ...ctx.filters.map((f): [string, string] => [`  ${f.label}`, f.value]),
    ['', ''],
    ['About the columns', ''],
    ['  Endpoints', 'Every endpoint the failure affects, one per line. Blank for UI bugs.'],
    ['  Expected / Actual', 'Taken from the bug description, one check per line as "check → value".'],
    [
      '  Expected / Actual Status',
      'Filled only when the checks are HTTP status codes. Blank when a bug checks something else (e.g. response headers) - see Expected / Actual.',
    ],
  ];
  for (const [label, value] of infoRows) info.addRow({ label, value });
  info.getColumn('label').font = { bold: true };
  info.getColumn('value').alignment = { wrapText: true, vertical: 'top' };

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
