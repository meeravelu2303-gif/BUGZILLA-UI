import { normaliseDescription } from './grouping.service';

/** The fields a tester reads first. */
export interface DefectReport {
  classification: string;
  endpoints: string[];
  steps: string;
  expected: string;
  actual: string;
  expectedStatus: string;
  actualStatus: string;
  narrative: string;
  curl: string;
}

export const EMPTY_REPORT: DefectReport = {
  classification: '',
  endpoints: [],
  steps: '',
  expected: '',
  actual: '',
  expectedStatus: '',
  actualStatus: '',
  narrative: '',
  curl: '',
};

const SECTION_START =
  /^(Expected|Actual|Response body[^:\n]*|Repro|Reproduce with Playwright|curl|Owner|Environment|Run date|Filed by|Correlation ID[^:\n]*|Browsers affected|Screenshot[^:\n]*|Trace[^:\n]*|Steps[^:\n]*|Summary|What this means|Why it matters|How to fix|Classification|Category|Endpoint|Module|Representative endpoint)\s*:/i;

const LEADING_LABEL = /^\s*(Classification|Category|Endpoint|Module|Representative endpoint)\s*:/i;

const METHOD_PATH = /^([A-Z]{3,7})\s+(\/\S*)/;
const NOT_APPLICABLE = /^\(?\s*(not applicable|n\/?a|none)\s*\)?$/i;

function labelled(text: string, label: string): string {
  const match = new RegExp(`^\\s*${label}\\s*:\\s*(.+?)\\s*$`, 'im').exec(text);
  return match ? match[1] : '';
}

function block(lines: string[], label: string): string {
  const start = lines.findIndex((line) => new RegExp(`^\\s*${label}\\s*:`, 'i').test(line));
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

function tidyChecks(text: string): string {
  return text
    .split('\n')
    .map((value) => value.replace(/\s*(→|->)\s*/, ' → ').trimEnd())
    .join('\n');
}

function statusCodes(checks: string): string {
  if (!checks) return '';
  const values = checks
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => (value.includes(' → ') ? value.slice(value.lastIndexOf(' → ') + 3) : value).trim());
  if (values.length === 0 || !values.every((value) => /^[1-5]\d\d$/.test(value))) return '';
  return [...new Set(values)].join(', ');
}

function endpointsOf(text: string, lines: string[]): string[] {
  const found: string[] = [];

  const affects = lines.findIndex((line) => /^\s*Affects\s+\d+\s+endpoints?\b/i.test(line));
  if (affects !== -1) {
    for (const line of lines.slice(affects + 1)) {
      const item = /^\s*[-•*]\s+(.+?)\s*$/.exec(line);
      if (!item) {
        if (line.trim() === '') continue;
        break;
      }
      const match = METHOD_PATH.exec(item[1]);
      if (match) found.push(`${match[1]} ${match[2]}`);
    }
  }

  if (found.length === 0) {
    for (const match of text.matchAll(/^\s*[-•]\s*([A-Z]{3,7})\s+(\/\S+)\s*\([^)]*\)\s*x\s*\d+\s*$/gim)) {
      found.push(`${match[1]} ${match[2]}`);
    }
  }

  if (found.length === 0) {
    const single = labelled(text, 'Representative endpoint') || labelled(text, 'Endpoint');
    if (single && !NOT_APPLICABLE.test(single)) found.push(single);
  }

  return [...new Set(found)];
}

function stepsBlock(lines: string[]): string {
  const start = lines.findIndex((line) => /^\s*Steps[^:\n]*:/i.test(line));
  if (start === -1) return '';

  const out: string[] = [];
  const inline = lines[start].replace(/^\s*Steps[^:\n]*:/i, '').trim();
  if (inline) out.push(inline);

  for (const line of lines.slice(start + 1)) {
    if (SECTION_START.test(line.trim())) break;
    out.push(line);
  }
  return out.join('\n').trim();
}

function narrativeOf(lines: string[]): string {
  const summary = block(lines, 'Summary');
  if (summary) return summary;

  let i = 0;
  while (i < lines.length && (LEADING_LABEL.test(lines[i]) || lines[i].trim() === '')) i++;

  const out: string[] = [];
  for (const line of lines.slice(i)) {
    if (SECTION_START.test(line.trim())) break;
    out.push(line);
  }
  return out.join('\n').trim();
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
    steps: stepsBlock(lines),
    expected,
    actual,
    expectedStatus: statusCodes(expected),
    actualStatus: statusCodes(actual),
    narrative: narrativeOf(lines),
    curl: block(lines, 'curl'),
  };
}
