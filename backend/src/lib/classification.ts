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

/** `Classification: <value>` on the first line of the description - every legacy bug has one. */
const CLASSIFICATION_LINE = /^\s*Classification:\s*(.+?)\s*$/m;

/** Business tier of the affected module, `[tier1]`..`[tier3]`. Independent of category. */
const TIER_TAG = /\[tier(\d+)\]/i;

export function tierOf(whiteboard: string | undefined): number | null {
  const m = TIER_TAG.exec(whiteboard ?? '');
  return m ? Number(m[1]) : null;
}

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
  tier: number | null;
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
    tier: tierOf(raw.whiteboard),
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
  product?: string[];
  component?: string[];
  status?: string[];
  search?: string;
  assignedTo?: string;
  creator?: string;
  cc?: string;
  tier?: number[];
}

/**
 * A Bugzilla search query. Repeated values on one key are OR'd by Bugzilla;
 * separate keys are AND'd. Category cannot be expressed that way - it lives in
 * two different fields - so it uses a boolean chart, which Bugzilla ANDs
 * against the rest of the query.
 */
export type BugzillaQuery = Record<string, string | number | string[]>;

/**
 * Category -> a boolean chart matching EITHER encoding.
 *
 * Chart row `n` is `fN`/`oN`/`vN`; `j_top=OR` makes the rows alternatives of
 * each other while still ANDing with the plain params alongside. Verified live:
 * whiteboard `[cat:Security]` OR longdesc `Classification: Security/` returns
 * exactly 338, the true Security count, and ANDs with severity correctly.
 */
function categoryChart(categories: Category[], query: BugzillaQuery): void {
  const wanted = categories.filter((c) => c !== 'Unclassified');
  if (wanted.length === 0) return;

  let row = 0;
  const push = (field: string, value: string) => {
    row += 1;
    query[`f${row}`] = field;
    query[`o${row}`] = 'substring';
    query[`v${row}`] = value;
  };

  for (const category of wanted) {
    // New encoding: the explicit tag.
    push('status_whiteboard', `[cat:${category}]`);
    // Legacy encoding: every classification that maps to this category.
    for (const [classification, mapped] of Object.entries(CATEGORY_BY_CLASSIFICATION)) {
      if (mapped === category) push('longdesc', `Classification: ${classification}`);
    }
  }
  query.j_top = 'OR';
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
  if (filters.search) query.summary = filters.search;
  if (filters.assignedTo) query.assigned_to = filters.assignedTo;
  if (filters.creator) query.creator = filters.creator;
  if (filters.cc) query.cc = filters.cc;
  if (filters.tier?.length) {
    // One tier is a plain substring; several need the chart, so keep the simple
    // case simple and let categoryChart own the multi-value case if both apply.
    if (filters.tier.length === 1) query.whiteboard = `[tier${filters.tier[0]}]`;
  }

  if (filters.category?.length) categoryChart(filters.category, query);

  return query;
}
