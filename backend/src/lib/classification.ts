/**
 * The single source of truth for the two-axis defect classification.
 *
 * Severity/Priority are one paired axis; Category is independent. Bugzilla has
 * native fields for the first two and nothing for the third, so Category is
 * encoded by the test bench as a `[cat:Xxx]` tag in the Status Whiteboard.
 *
 * Nothing else in the codebase may hard-code a severity, priority or category
 * string: parsing (raw -> ours) and filtering (ours -> a Bugzilla query) both
 * read from here, so the two can never drift apart.
 *
 * ---------------------------------------------------------------------------
 * Two encodings coexist, and both must keep working.
 *
 * The bench was changed to emit `[cat:Xxx]` and the severity vocabulary below,
 * but every bug filed before that change carries neither. Probed against the
 * live instance (1,283 bugs, all pre-change):
 *
 *   whiteboard  `[tier1]` only - no `[cat:]` on any bug, `keywords` empty
 *   severity    critical 130 | major 706 | normal 187 | minor 260
 *   priority    Highest 130 | High 706 | Normal 187 | Low 260  (pairs 1:1)
 *
 * Legacy bugs are still classifiable because all 1,283 carry a
 * `Classification: <value>` line as the first line of their description, and
 * that value maps to a category through the same table the bench uses.
 */

import { normaliseDescription } from './grouping';

/** Ordered most severe first; the index doubles as the sort rank. */
export const SEVERITIES = ['Critical', 'Major', 'Minor', 'Trivial', 'Unclassified'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'Unclassified'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const CATEGORIES = ['Functional', 'Performance', 'Security', 'Compatibility', 'Unclassified'] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * The Playwright projects the UI bench runs, and therefore the only values that
 * can appear in a `[browser:…]` tag.
 *
 * Listed here for the same reason severities are: the filter dropdown and the
 * query builder must offer and accept exactly the same vocabulary. A project
 * added to the bench and not added here still *renders* (Pill falls back to the
 * raw name) but cannot be filtered on — so keep this in step with
 * `playwright.config.ts` in KPOST-UI-AUTOMATION.
 */
export const BROWSERS = ['chromium', 'firefox', 'webkit', 'mobile-chrome'] as const;
export type Browser = (typeof BROWSERS)[number];

/** Lower sorts first. Used wherever severity must rank rather than sort alphabetically. */
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

/**
 * Bugzilla's native `priority` values, which did NOT change between the two
 * encodings - this is the one axis that reads the same in both eras.
 */
const PRIORITY_FROM_BUGZILLA: Record<string, Priority> = {
  Highest: 'P0',
  High: 'P1',
  Normal: 'P2',
  Low: 'P3',
  Lowest: 'P3',
};

/**
 * Bugzilla `bug_severity` -> our band, for the values that mean the same thing
 * in both encodings. `minor` is deliberately absent: it is the one overloaded
 * value and is resolved by `severityOf` using the paired priority.
 */
const SEVERITY_FROM_BUGZILLA: Record<string, Severity> = {
  blocker: 'Critical',
  critical: 'Critical',
  major: 'Major',
  // Legacy-only value: the old bench used `normal` for the P2 band that the new
  // bench calls `minor`.
  normal: 'Minor',
  trivial: 'Trivial',
};

/**
 * `minor` means different things in the two encodings, so the pair resolves it:
 *   old bench  minor + Low     -> Trivial (P3)
 *   new bench  minor + Normal  -> Minor   (P2)
 * Severity and priority pair 1:1 in the real data, which is what makes this exact.
 */
function severityOf(rawSeverity: string, rawPriority: string): Severity {
  const direct = SEVERITY_FROM_BUGZILLA[rawSeverity];
  if (direct) return direct;
  if (rawSeverity === 'minor') return rawPriority === 'Low' || rawPriority === 'Lowest' ? 'Trivial' : 'Minor';
  return 'Unclassified';
}

/**
 * The bench's flaw taxonomy, ported from KPOST-AUTOMATION-v1
 * `src/utils/bugTracker.ts` (CATEGORY_BY_CLASSIFICATION). Every one of these
 * currently resolves to Security or Functional; Performance and Compatibility
 * are real categories with no classification feeding them yet, so those facets
 * are legitimately empty until the taxonomy grows.
 */
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

/** `[cat:Security]` in the Status Whiteboard - what the current bench writes. */
const CATEGORY_TAG = /\[cat:([A-Za-z]+)\]/;

/**
 * `[browser:webkit]` in the Status Whiteboard.
 *
 * The UI bench files one ticket per (defect, browser) — "broken on Safari" and
 * "broken everywhere" are different problems to triage and to close — and tags
 * each ticket with the browser it belongs to. Reading it here makes the browser
 * a real field the list can show and filter on, rather than something a reader
 * has to pick out of the summary text by eye.
 *
 * Hyphens are allowed: `mobile-chrome` is a project name.
 */
const BROWSER_TAG = /\[browser:([A-Za-z0-9,-]+)\]/;

/**
 * The browsers a bug was observed on, in order, or an empty list when it
 * carries no tag — every API-bench bug, and any UI bug filed before browser
 * tagging existed.
 *
 * A list rather than a single value: one defect commonly fails on several
 * browsers, and the UI bench files it as ONE ticket naming all of them rather
 * than duplicating the ticket per browser. Empty must render as "not
 * specified"; never guess a browser onto a bug.
 */
export function browsersOf(whiteboard: string | undefined): string[] {
  const tagged = BROWSER_TAG.exec(whiteboard ?? '');
  if (!tagged) return [];
  return tagged[1]
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean);
}

/** `Classification: <value>` on the first line of the description - every legacy bug has one. */
const CLASSIFICATION_LINE = /^\s*Classification:\s*(.+?)\s*$/m;

/** The raw `Classification:` value, kept for display - finer grained than Category. */
export function classificationOf(description: string | undefined): string | null {
  if (!description) return null;
  const m = CLASSIFICATION_LINE.exec(normaliseDescription(description));
  return m ? m[1] : null;
}

/**
 * Category, preferring the explicit tag and falling back to the description.
 *
 * The tag is authoritative because a human may set it deliberately; the
 * description fallback is what makes the 1,283 pre-change bugs classifiable at
 * all. An unrecognised value degrades to Unclassified rather than being dropped.
 */
export function categoryOf(whiteboard: string | undefined, description: string | undefined): Category {
  const tagged = CATEGORY_TAG.exec(whiteboard ?? '');
  if (tagged) {
    const match = CATEGORIES.find((c) => c.toLowerCase() === tagged[1].toLowerCase());
    if (match) return match;
  }
  const classification = classificationOf(description);
  if (classification) return CATEGORY_BY_CLASSIFICATION[classification] ?? 'Unclassified';
  return 'Unclassified';
}

export interface Classification {
  severity: Severity;
  priority: Priority;
  category: Category;
  /** The bench's finer-grained flaw label, e.g. "Security/Access Control". */
  classification: string | null;
  /** Which browsers the bug was seen on. Empty when the bug carries no tag. */
  browsers: string[];
}

/**
 * Raw Bugzilla fields -> our classification. Total: any unrecognised value
 * lands in an explicit Unclassified bucket. This must never throw - a single
 * odd bug cannot be allowed to fail a whole list request.
 */
export function classify(raw: {
  severity?: string;
  priority?: string;
  whiteboard?: string;
  description?: string;
}): Classification {
  const severity = severityOf(raw.severity ?? '', raw.priority ?? '');
  return {
    severity,
    // Read the priority Bugzilla actually holds; fall back to the band's paired
    // priority so a bug with a blank priority still reads consistently.
    priority: PRIORITY_FROM_BUGZILLA[raw.priority ?? ''] ?? PRIORITY_FOR_SEVERITY[severity],
    category: categoryOf(raw.whiteboard, raw.description),
    classification: classificationOf(raw.description),
    browsers: browsersOf(raw.whiteboard),
  };
}

// ---------------------------------------------------------------- filtering

/**
 * Bugzilla `bug_severity` values to search for, per band. `Minor` and `Trivial`
 * both include `minor` because the value is overloaded across the two
 * encodings; a band is additionally pinned by its priority (below) so the two
 * do not bleed into each other.
 */
const BUGZILLA_SEVERITIES: Record<Exclude<Severity, 'Unclassified'>, string[]> = {
  Critical: ['blocker', 'critical'],
  Major: ['major'],
  Minor: ['normal', 'minor'],
  Trivial: ['trivial', 'minor'],
};

const BUGZILLA_PRIORITIES: Record<Exclude<Priority, 'Unclassified'>, string[]> = {
  P0: ['Highest'],
  P1: ['High'],
  P2: ['Normal'],
  P3: ['Low', 'Lowest'],
};

export interface BugFilters {
  severity?: Severity[];
  priority?: Priority[];
  category?: Category[];
  /** Playwright project names from the `[browser:…]` whiteboard tag. */
  browser?: string[];
  product?: string[];
  component?: string[];
  status?: string[];
  /** Bugzilla resolutions (FIXED, INVALID, DUPLICATE …). `Unresolved` maps to Bugzilla's `---`. */
  resolution?: string[];
  search?: string;
  assignedTo?: string;
  creator?: string;
  cc?: string;
}

/**
 * A Bugzilla search query. Repeated values on one key are OR'd by Bugzilla;
 * separate keys are AND'd. Category cannot be expressed that way - it lives in
 * two different fields - so it uses a boolean chart, which Bugzilla ANDs
 * against the rest of the query.
 */
export type BugzillaQuery = Record<string, string | number | string[]>;

/**
 * Chart rows are `fN`/`oN`/`vN`, numbered across the whole query. `fN=OP` opens
 * a parenthesised group and `fN=CP` closes it; `jN=OR` makes the rows *inside*
 * that group alternatives of each other. The top level is left at its default
 * AND, so each group ANDs with the others and with the plain params alongside.
 *
 * Two facets live in the chart because neither is a native Bugzilla field:
 * category (whiteboard tag OR legacy description line) and browser (whiteboard
 * tag). They must AND with each other — "Security bugs on webkit" is one
 * question, not two — which is precisely what a flat `j_top=OR` cannot express.
 *
 * Verified live against this instance: `(cat:Functional) AND (chromium)` returns
 * the tagged bug, `(cat:Security) AND (chromium)` returns none. A flat OR chart
 * would have returned a match for both.
 */
function chartWriter(query: BugzillaQuery) {
  let row = 0;
  return {
    /** Opens a group whose rows are OR'd together. */
    open(): void {
      row += 1;
      query[`f${row}`] = 'OP';
      query[`j${row}`] = 'OR';
    },
    push(field: string, value: string): void {
      row += 1;
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

/**
 * The two whiteboard-backed facets, each as its own OR'd group.
 *
 * Browser matches on the bare project name rather than the whole `[browser:x]`
 * tag, because the bench writes every affected browser into ONE comma-joined
 * tag (`[browser:chromium,firefox]`) and a substring match cannot anchor to a
 * list element. The names are distinctive enough for that to be exact —
 * `chromium` is not a substring of `mobile-chrome`, and no category value
 * contains a browser name — but a project named as a prefix of another would
 * break it, which is the standing reason to keep BROWSERS in step with the
 * bench's Playwright projects.
 */
function whiteboardCharts(filters: BugFilters, query: BugzillaQuery): void {
  const categories = (filters.category ?? []).filter((c) => c !== 'Unclassified');
  const browsers = filters.browser ?? [];
  if (categories.length === 0 && browsers.length === 0) return;

  const chart = chartWriter(query);

  if (categories.length > 0) {
    chart.open();
    for (const category of categories) {
      // New encoding: the explicit tag.
      chart.push('status_whiteboard', `[cat:${category}]`);
      // Legacy encoding: every classification that maps to this category.
      for (const [classification, mapped] of Object.entries(CATEGORY_BY_CLASSIFICATION)) {
        if (mapped === category) chart.push('longdesc', `Classification: ${classification}`);
      }
    }
    chart.close();
  }

  if (browsers.length > 0) {
    chart.open();
    for (const browser of browsers) chart.push('status_whiteboard', browser);
    chart.close();
  }
}

/**
 * Our filters -> Bugzilla search params. Everything is validated upstream by the
 * Zod schema, so by the time a value reaches here it is already one of ours.
 */
export function toBugzillaQuery(filters: BugFilters): BugzillaQuery {
  const query: BugzillaQuery = {};

  const severities = (filters.severity ?? []).filter((s) => s !== 'Unclassified') as Exclude<Severity, 'Unclassified'>[];
  if (severities.length > 0) {
    query.bug_severity = [...new Set(severities.flatMap((s) => BUGZILLA_SEVERITIES[s]))];
    // Pin the band with its paired priority so the overloaded `minor` value
    // cannot pull legacy Trivial bugs into a Minor filter (or vice versa).
    query.priority = [...new Set(severities.flatMap((s) => BUGZILLA_PRIORITIES[PRIORITY_FOR_SEVERITY[s] as 'P0']))];
  }

  const priorities = (filters.priority ?? []).filter((p) => p !== 'Unclassified') as Exclude<Priority, 'Unclassified'>[];
  if (priorities.length > 0) {
    const wanted = [...new Set(priorities.flatMap((p) => BUGZILLA_PRIORITIES[p]))];
    // If severity already pinned a priority set, intersect rather than widen -
    // the two facets are AND'd, not OR'd.
    const existing = query.priority as string[] | undefined;
    query.priority = existing ? existing.filter((p) => wanted.includes(p)) : wanted;
  }

  if (filters.product?.length) query.product = filters.product;
  if (filters.component?.length) query.component = filters.component;
  if (filters.status?.length) query.bug_status = filters.status;
  /*
   * Bugzilla spells "no resolution yet" as the literal `---`, not as an empty string, and a
   * bare empty value in the query matches nothing. Translating here keeps that quirk out of the
   * URL contract, so the UI can offer a plain "Unresolved" option.
   */
  if (filters.resolution?.length) {
    query.resolution = filters.resolution.map((r) => (r === '' || r === 'Unresolved' ? '---' : r));
  }
  if (filters.search) query.summary = filters.search;
  if (filters.assignedTo) query.assigned_to = filters.assignedTo;
  if (filters.creator) query.creator = filters.creator;
  if (filters.cc) query.cc = filters.cc;

  whiteboardCharts(filters, query);

  return query;
}
