import { normaliseDescription } from './grouping.service';

/** Ordered most severe first; the index doubles as the sort rank. */
export const SEVERITIES = ['Critical', 'Major', 'Minor', 'Trivial', 'Unclassified'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'Unclassified'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const CATEGORIES = [
  'Functional',
  'Performance',
  'Security',
  'Compatibility',
  'Accessibility',
  'Unclassified',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** The Playwright projects the UI bench runs, and therefore the only values that can appear in a [browser:…] tag. */
export const BROWSERS = ['chromium', 'firefox', 'webkit', 'mobile-chrome'] as const;
export type Browser = (typeof BROWSERS)[number];

/** Lower sorts first. */
export const SEVERITY_RANK: Record<Severity, number> = {
  Critical: 0,
  Major: 1,
  Minor: 2,
  Trivial: 3,
  Unclassified: 4,
};

export const SEVERITY_MEANING: Record<Severity, string> = {
  Critical: 'System crash, severe data loss, or total feature blockade with no workaround',
  Major: 'Significant loss of core functionality; a difficult workaround may exist',
  Minor: 'Small functional failure or limitation that does not impair basic operations',
  Trivial: 'Cosmetic - minor UI misalignment, spelling error, or visual glitch',
  Unclassified: 'Filed with a severity outside the classification model',
};

export const CATEGORY_MEANING: Record<Category, string> = {
  Functional: 'Incorrect output, logic failure, or a broken workflow',
  Performance: 'Slow responses, excessive resource use, or degradation under stress',
  Security: 'Vulnerability, data leak, or authorization flaw',
  Compatibility: 'Behaviour specific to certain clients, versions, devices or environments',
  Accessibility: 'A WCAG/assistive-technology violation - screen readers, keyboard-only use, or similar',
  Unclassified: 'No category tag, and no recognised classification in the description',
};

/** Severity paired with its priority, per the classification model. */
export const PRIORITY_FOR_SEVERITY: Record<Severity, Priority> = {
  Critical: 'P0',
  Major: 'P1',
  Minor: 'P2',
  Trivial: 'P3',
  Unclassified: 'Unclassified',
};

const PRIORITY_FROM_BUGZILLA: Record<string, Priority> = {
  Highest: 'P0',
  High: 'P1',
  Normal: 'P2',
  Low: 'P3',
  Lowest: 'P3',
};

const SEVERITY_FROM_BUGZILLA: Record<string, Severity> = {
  blocker: 'Critical',
  critical: 'Critical',
  major: 'Major',
  normal: 'Minor',
  minor: 'Minor',
  trivial: 'Trivial',
};

function severityOf(rawSeverity: string, rawPriority: string): Severity {
  const direct = SEVERITY_FROM_BUGZILLA[rawSeverity];
  if (direct) return direct;
  void rawPriority;
  return 'Unclassified';
}

/** The bench's flaw taxonomy, ported from KPOST-AUTOMATION-v1 src/utils/bugTracker.ts. */
export const CATEGORY_BY_CLASSIFICATION: Record<string, Category> = {
  'Security/XSS': 'Security',
  'Security/SQL Injection': 'Security',
  'Security/Access Control': 'Security',
  'Security/Information Disclosure': 'Security',
  'Security/Rate Limiting': 'Security',
  'Business Logic Flaw': 'Functional',
  'Input Validation Gap': 'Functional',
  'Incorrect HTTP Status': 'Functional',
  'Status Code Misreporting': 'Functional',
  'Schema Violation': 'Functional',
  'Unhandled NPE / Server Error': 'Functional',
  'Idempotency / Concurrency': 'Functional',
  'Transport/Header Contract': 'Functional',
  'Assertion Failure': 'Functional',
};

const CATEGORY_TAG = /\[cat:([A-Za-z]+)\]/;

const BROWSER_TAG = /\[browser:([A-Za-z0-9,-]+)\]/;
const PLATFORM_TAG = /\[platform:(web|mobile)\]/i;
const DEVICE_TAG = /\[device:([A-Za-z0-9,-]+)\]/;

export type UiPlatform = 'Web' | 'Mobile';

export function uiPlatformOf(whiteboard: string | undefined): UiPlatform | null {
  const match = PLATFORM_TAG.exec(whiteboard ?? '');
  return match ? (match[1].toLowerCase() === 'mobile' ? 'Mobile' : 'Web') : null;
}

export function devicesOf(whiteboard: string | undefined): string[] {
  const match = DEVICE_TAG.exec(whiteboard ?? '');
  return match
    ? match[1]
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
}

/** The browsers a bug was observed on. */
export function browsersOf(whiteboard: string | undefined): string[] {
  const tagged = BROWSER_TAG.exec(whiteboard ?? '');
  if (!tagged) return [];
  return tagged[1]
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

const CLASSIFICATION_LINE = /^\s*Classification:\s*(.+?)\s*$/m;

/** The raw Classification: value, kept for display - finer grained than Category. */
export function classificationOf(description: string | undefined): string | null {
  if (!description) return null;
  const match = CLASSIFICATION_LINE.exec(normaliseDescription(description));
  return match ? match[1] : null;
}

/** Category, preferring the explicit tag and falling back to the description. */
export function categoryOf(whiteboard: string | undefined, description: string | undefined): Category {
  const tagged = CATEGORY_TAG.exec(whiteboard ?? '');
  if (tagged) {
    const match = CATEGORIES.find((category) => category.toLowerCase() === tagged[1].toLowerCase());
    if (match) return match;
  }
  const classification = classificationOf(description);
  if (classification) return CATEGORY_BY_CLASSIFICATION[classification] ?? 'Unclassified';
  return 'Unclassified';
}

/** HOW a bug was filed: by a test bench, or by a person. */
export const SOURCES = ['Automation', 'Manual'] as const;
export type Source = (typeof SOURCES)[number];

const SOURCE_TAG = /\[source:(automation|manual)\]/i;

export function sourceOf(whiteboard: string | undefined, description: string | undefined): Source {
  const tagged = SOURCE_TAG.exec(whiteboard ?? '');
  if (tagged) return tagged[1].toLowerCase() === 'manual' ? 'Manual' : 'Automation';
  return /^Filed by: (?!manual\b)/m.test(description ?? '') ? 'Automation' : 'Manual';
}

/** Sets the source tag, REPLACING any that is already there. */
export function withSourceTag(whiteboard: string, source: Source): string {
  return `${whiteboard.replace(SOURCE_TAG, '').trim()}[source:${source.toLowerCase()}]`;
}

/** WHAT was tested: the API surface, or a user interface. */
export const TEST_TYPES = ['UI', 'API'] as const;
export type TestType = (typeof TEST_TYPES)[number];

export function testTypeOf(product: string | undefined): TestType {
  const name = product ?? '';
  if (/\bUI\b/i.test(name)) return 'UI';
  if (/\bAPI\b/i.test(name) || /\bAdmin\b/i.test(name)) return 'API';
  return 'UI';
}

/** The badge text: "UI Automation", "API Automation", "Manual UI test", "Manual API test". */
export function testTypeLabel(source: Source, testType: TestType): string {
  return source === 'Automation' ? `${testType} Automation` : `Manual ${testType} test`;
}

export interface Classification {
  severity: Severity;
  priority: Priority;
  category: Category;
  classification: string | null;
  browsers: string[];
  uiPlatform: UiPlatform | null;
  devices: string[];
  source: Source;
  testType: TestType;
}

/** Raw Bugzilla fields -> our classification. */
export function classify(raw: {
  severity?: string;
  priority?: string;
  whiteboard?: string;
  description?: string;
  product?: string;
}): Classification {
  const severity = severityOf(raw.severity ?? '', raw.priority ?? '');
  return {
    source: sourceOf(raw.whiteboard, raw.description),
    testType: testTypeOf(raw.product),
    severity,
    priority: PRIORITY_FROM_BUGZILLA[raw.priority ?? ''] ?? PRIORITY_FOR_SEVERITY[severity],
    category: categoryOf(raw.whiteboard, raw.description),
    classification: classificationOf(raw.description),
    browsers: browsersOf(raw.whiteboard),
    uiPlatform: uiPlatformOf(raw.whiteboard),
    devices: devicesOf(raw.whiteboard),
  };
}

/** Bugzilla bug_severity values to search for, per band. */
export const URGENT_SEVERITIES = ['blocker', 'critical'] as const;
export const URGENT_PRIORITY = 'Highest';
export function isUrgent(severity: string, priority: string): boolean {
  return (URGENT_SEVERITIES as readonly string[]).includes(severity.toLowerCase()) || priority === URGENT_PRIORITY;
}

export const BUGZILLA_SEVERITIES: Record<Exclude<Severity, 'Unclassified'>, string[]> = {
  Critical: ['blocker', 'critical'],
  Major: ['major'],
  Minor: ['normal', 'minor'],
  Trivial: ['trivial'],
};

export const BUGZILLA_PRIORITIES: Record<Exclude<Priority, 'Unclassified'>, string[]> = {
  P0: ['Highest'],
  P1: ['High'],
  P2: ['Normal'],
  P3: ['Low', 'Lowest'],
};

export interface BugFilters {
  severity?: Severity[];
  priority?: Priority[];
  category?: Category[];
  browser?: string[];
  source?: Source[];
  product?: string[];
  component?: string[];
  subcomponent?: string[];
  status?: string[];
  resolution?: string[];
  search?: string;
  assignedTo?: string;
  creator?: string;
  cc?: string;
  deleted?: 'exclude' | 'only' | 'include';
  urgent?: boolean;
  dateField?: 'created' | 'updated';
  from?: string;
  to?: string;
}

/** The day after YYYY-MM-DD, so an inclusive "to" becomes an exclusive upper bound. */
export function nextDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** A Bugzilla search query. */
export type BugzillaQuery = Record<string, string | number | string[]>;

function chartWriter(query: BugzillaQuery) {
  let row = 0;
  return {
    open(): void {
      row += 1;
      query[`f${row}`] = 'OP';
      query[`j${row}`] = 'OR';
    },
    openNegated(): void {
      row += 1;
      query[`n${row}`] = '1';
      query[`f${row}`] = 'OP';
      query[`j${row}`] = 'OR';
    },
    openAnd(): void {
      row += 1;
      query[`f${row}`] = 'OP';
    },
    push(field: string, value: string): void {
      row += 1;
      query[`f${row}`] = field;
      query[`o${row}`] = 'substring';
      query[`v${row}`] = value;
    },
    pushWith(field: string, operator: string, value: string): void {
      row += 1;
      query[`f${row}`] = field;
      query[`o${row}`] = operator;
      query[`v${row}`] = value;
    },
    pushNegated(field: string, value: string): void {
      row += 1;
      query[`n${row}`] = '1';
      query[`f${row}`] = field;
      query[`o${row}`] = 'substring';
      query[`v${row}`] = value;
    },
    close(): void {
      row += 1;
      query[`f${row}`] = 'CP';
    },
  };
}

const BUG_ID_TERM = /^(?:kpa[-\s]?|#|bug[-\s]?)?0*(\d{1,7})$/i;

export function bugIdFromSearch(term: string): number | null {
  const match = BUG_ID_TERM.exec(term.trim());
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function searchChart(filters: BugFilters, query: BugzillaQuery, chart: ReturnType<typeof chartWriter>): void {
  const term = filters.search?.trim();
  if (!term) return;

  const bugId = bugIdFromSearch(term);
  if (bugId === null) {
    query.summary = term;
    return;
  }

  chart.open();
  chart.pushWith('bug_id', 'equals', String(bugId));
  chart.push('short_desc', term);
  chart.push('alias', term);
  chart.close();
}

function whiteboardCharts(filters: BugFilters, chart: ReturnType<typeof chartWriter>): void {
  const selected = filters.category ?? [];
  const named = selected.filter((value) => value !== 'Unclassified');
  const wantsUnclassified = selected.includes('Unclassified');
  const browsers = filters.browser ?? [];
  const sources = [...new Set(filters.source ?? [])];
  const narrowBySource = sources.length > 0 && sources.length < SOURCES.length;
  if (selected.length === 0 && browsers.length === 0 && !narrowBySource) return;

  if (narrowBySource) {
    chart.open();
    for (const source of sources) chart.push('status_whiteboard', `[source:${source.toLowerCase()}]`);
    chart.close();
  }

  if (selected.length > 0) {
    const bothSides = named.length > 0 && wantsUnclassified;
    if (bothSides) chart.open();

    if (named.length > 0) {
      chart.open();
      for (const category of named) {
        chart.push('status_whiteboard', `[cat:${category}]`);
      }

      const wanted = new Set<Category>(named);
      const legacyFor = Object.entries(CATEGORY_BY_CLASSIFICATION).filter(([, mapped]) => wanted.has(mapped));
      if (legacyFor.length > 0) {
        chart.openAnd();
        chart.open();
        for (const [classification] of legacyFor) {
          chart.push('longdesc', `Classification: ${classification}`);
        }
        chart.close();
        chart.pushNegated('status_whiteboard', '[cat:');
        chart.close();
      }
      chart.close();
    }

    if (wantsUnclassified) {
      chart.openNegated();
      chart.push('status_whiteboard', '[cat:');
      chart.push('longdesc', 'Classification:');
      chart.close();
    }

    if (bothSides) chart.close();
  }

  if (browsers.length > 0) {
    chart.open();
    for (const browser of browsers) chart.push('status_whiteboard', browser);
    chart.close();
  }
}

/** Our filters -> Bugzilla search params. */
export function toBugzillaQuery(filters: BugFilters): BugzillaQuery {
  const query: BugzillaQuery = {};

  const severities = (filters.severity ?? []).filter((severity) => severity !== 'Unclassified') as Exclude<
    Severity,
    'Unclassified'
  >[];
  if (severities.length > 0) {
    query.bug_severity = [...new Set(severities.flatMap((severity) => BUGZILLA_SEVERITIES[severity]))];
  }

  const priorities = (filters.priority ?? []).filter((priority) => priority !== 'Unclassified') as Exclude<
    Priority,
    'Unclassified'
  >[];
  if (priorities.length > 0) {
    query.priority = [...new Set(priorities.flatMap((priority) => BUGZILLA_PRIORITIES[priority]))];
  }

  if (filters.product?.length) query.product = filters.product;
  if (filters.component?.length) query.component = filters.component;
  if (filters.subcomponent?.length) query.cf_subcomponent = filters.subcomponent;
  if (filters.status?.length) query.bug_status = filters.status;
  if (filters.resolution?.length) {
    query.resolution = filters.resolution.map((resolution) =>
      resolution === '' || resolution === 'Unresolved' ? '---' : resolution,
    );
  }
  if (filters.assignedTo) query.assigned_to = filters.assignedTo;
  if (filters.creator) query.creator = filters.creator;
  if (filters.cc) query.cc = filters.cc;

  const chart = chartWriter(query);
  if (filters.urgent) {
    chart.open();
    for (const sev of URGENT_SEVERITIES) chart.pushWith('bug_severity', 'equals', sev);
    chart.pushWith('priority', 'equals', URGENT_PRIORITY);
    chart.close();
  }
  whiteboardCharts(filters, chart);
  searchChart(filters, query, chart);

  if (filters.from || filters.to) {
    const column = filters.dateField === 'updated' ? 'delta_ts' : 'creation_ts';
    let [from, to] = [filters.from, filters.to];
    if (from && to && from > to) [from, to] = [to, from];
    if (from) chart.pushWith(column, 'greaterthaneq', from);
    if (to) chart.pushWith(column, 'lessthan', nextDay(to));
  }

  const deleted = filters.deleted ?? 'exclude';
  if (deleted === 'only') query.resolution = ['DELETED'];
  else if (deleted === 'exclude') chart.pushWith('resolution', 'notequals', 'DELETED');

  return query;
}
