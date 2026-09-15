import { normaliseDescription } from './grouping';

/**
 * The fields a tester reads first, lifted out of a bench-filed description:
 * which endpoints failed, and what was expected versus what actually came back.
 *
 * Both benches write a stable, line-anchored format - `Classification:`,
 * `Representative endpoint:` / `Endpoint:`, an "Affects N endpoints" list, then
 * `Expected:` and `Actual:` blocks. This reads those anchors. Anything missing
 * comes back empty rather than throwing, so a hand-filed bug with free-form
 * text still exports, just with blank report columns.
 */
export interface DefectReport {
  classification: string;
  /** Every affected endpoint, e.g. "POST /v2/dashboard/homeDashboardMsgs/". Empty for UI bugs. */
  endpoints: string[];
  /** Expected block, one `check → value` per line. */
  expected: string;
  actual: string;
  /**
   * HTTP status codes, when the Expected/Actual blocks are status-code checks
   * ("no Authorization header → 401"). Empty when they check something else,
   * such as header values - a status column that guessed would be worse than
   * one that is blank.
   */
  expectedStatus: string;
  actualStatus: string;
}

export const EMPTY_REPORT: DefectReport = {
  classification: '',
  endpoints: [],
  expected: '',
  actual: '',
  expectedStatus: '',
  actualStatus: '',
};

/** Lines that start a new section and so end an Expected/Actual block. */
const SECTION_START =
  /^(Expected|Actual|Response body[^:\n]*|Repro|Reproduce with Playwright|curl|Owner|Environment|Run date|Filed by|Correlation ID[^:\n]*|Browsers affected|Screenshot[^:\n]*|Trace[^:\n]*|Steps[^:\n]*)\s*:/i;

const METHOD_PATH = /^([A-Z]{3,7})\s+(\/\S*)/;
const NOT_APPLICABLE = /^\(?\s*(not applicable|n\/?a|none)\s*\)?$/i;

function labelled(text: string, label: string): string {
  const m = new RegExp(`^\\s*${label}\\s*:\\s*(.+?)\\s*$`, 'im').exec(text);
  return m ? m[1] : '';
}

/** The lines under `label:` up to the next section heading, trimmed. */
function block(lines: string[], label: string): string {
  const start = lines.findIndex((l) => new RegExp(`^\\s*${label}\\s*:`, 'i').test(l));
  if (start === -1) return '';

  const out: string[] = [];
  const inline = lines[start].replace(new RegExp(`^\\s*${label}\\s*:`, 'i'), '').trim();
  if (inline) out.push(inline);

  for (const line of lines.slice(start + 1)) {
    if (SECTION_START.test(line.trim())) break;
    out.push(line);
  }
  return tidyChecks(out.join('\n').trim());
}

/**
 * The bench pads its checks into columns for a monospace description:
 * `content-security-policy    →  \S`. In a proportional spreadsheet font that
 * padding is just noise, so collapse it to a single `check → value`.
 */
function tidyChecks(text: string): string {
  return text
    .split('\n')
    .map((l) => l.replace(/\s*(→|->)\s*/, ' → ').trimEnd())
    .join('\n');
}

/** Status codes when EVERY check's value is a 3-digit HTTP status, else ''. */
function statusCodes(checks: string): string {
  if (!checks) return '';
  const values = checks
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.includes(' → ') ? l.slice(l.lastIndexOf(' → ') + 3) : l).trim());
  if (values.length === 0 || !values.every((v) => /^[1-5]\d\d$/.test(v))) return '';
  return [...new Set(values)].join(', ');
}

function endpointsOf(text: string, lines: string[]): string[] {
  const found: string[] = [];

  // Current format: "Affects 3 endpoints — one shared fix resolves all of them:" then "  - POST /path".
  const affects = lines.findIndex((l) => /^\s*Affects\s+\d+\s+endpoints?\b/i.test(l));
  if (affects !== -1) {
    for (const line of lines.slice(affects + 1)) {
      const item = /^\s*[-•*]\s+(.+?)\s*$/.exec(line);
      if (!item) {
        if (line.trim() === '') continue;
        break;
      }
      const m = METHOD_PATH.exec(item[1]);
      if (m) found.push(`${m[1]} ${m[2]}`);
    }
  }

  // Older format: "Affected endpoints (3), observed by …" then "- POST /path (…) x 4".
  if (found.length === 0) {
    for (const m of text.matchAll(/^\s*[-•]\s*([A-Z]{3,7})\s+(\/\S+)\s*\([^)]*\)\s*x\s*\d+\s*$/gim)) {
      found.push(`${m[1]} ${m[2]}`);
    }
  }

  // A single named endpoint, when there is no list.
  if (found.length === 0) {
    const single = labelled(text, 'Representative endpoint') || labelled(text, 'Endpoint');
    if (single && !NOT_APPLICABLE.test(single)) found.push(single);
  }

  return [...new Set(found)];
}

export function parseDefectReport(description: string | undefined): DefectReport {
  if (!description) return EMPTY_REPORT;
  const text = normaliseDescription(description);
  const lines = text.split('\n');

  const expected = block(lines, 'Expected');
  const actual = block(lines, 'Actual');

  return {
    classification: labelled(text, 'Classification'),
    endpoints: endpointsOf(text, lines),
    expected,
    actual,
    expectedStatus: statusCodes(expected),
    actualStatus: statusCodes(actual),
  };
}
