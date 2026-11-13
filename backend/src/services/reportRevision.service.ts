/**
 * Editable bug reports.
 *
 * A bug's report (Classification, Expected, Actual, curl, How to fix, ...) is its
 * description - Bugzilla's comment #0 - and Bugzilla 5.2 has no way to edit a
 * comment, through the API or otherwise. Writing the database directly would
 * bypass Bugzilla's history and permissions, so an edit is stored the
 * Bugzilla-native way instead: as a new comment holding the FULL updated report
 * behind a marker line.
 *
 * The app treats the newest such comment as the bug's description everywhere -
 * the bug page, the Excel export, classification - while the original and every
 * earlier version stay in the history, with who changed what and when. Opened in
 * Bugzilla itself, the revision reads as an ordinary, self-explanatory comment.
 */
export const REVISION_MARKER = '[report-revision]';
const EXPLANATION = 'The bug report was edited. This comment holds the full updated report, which replaces the description above.';

export function isReportRevision(text: string | undefined): boolean {
  return Boolean(text?.startsWith(REVISION_MARKER));
}

export function revisionComment(report: string): string {
  return `${REVISION_MARKER}\n${EXPLANATION}\n\n${report}`;
}

/** The report inside a revision comment (marker and explanation removed). */
export function stripRevision(text: string): string {
  if (!isReportRevision(text)) return text;
  const lines = text.split('\n');
  let i = 1;
  if (lines[i]?.startsWith('The bug report was edited.')) i++;
  while (i < lines.length && lines[i].trim() === '') i++;
  return lines.slice(i).join('\n');
}

/** Comments in Bugzilla order (oldest first). Returns the current report and how it got there. */
export function effectiveReport<C extends { text?: string; count?: number }>(
  comments: C[]
): { text: string; latestRevision: C | null; revisions: C[] } {
  const revisions = comments.filter((c) => isReportRevision(c.text));
  const latest = revisions[revisions.length - 1] ?? null;
  if (latest) return { text: stripRevision(latest.text ?? ''), latestRevision: latest, revisions };
  const original = comments.find((c) => c.count === 0) ?? comments[0];
  return { text: original?.text ?? '', latestRevision: null, revisions };
}

/**
 * Same line endings, so "unchanged" compares fairly. Escaped `\n`s are unescaped only in a report
 * with no real newlines (the bench's escaped filings) - elsewhere they sit inside JSON evidence.
 */
export function normaliseReport(text: string): string {
  const unified = text.replace(/\r\n?/g, '\n');
  return (unified.includes('\n') ? unified : unified.replace(/\\r\\n|\\n/g, '\n'))
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .trim();
}

const CATEGORY_TAG = /\[cat:[A-Za-z]+\]/;

/**
 * The whiteboard with its `[cat:…]` tag set to `category` ('Unclassified' removes it). Replaced in
 * place, other tags and spacing untouched - the bench writes `[cat:X][browser:y]` with no space.
 */
export function withCategoryTag(whiteboard: string, category: string): string {
  if (category === 'Unclassified') return whiteboard.replace(CATEGORY_TAG, '').trim();
  if (CATEGORY_TAG.test(whiteboard)) return whiteboard.replace(CATEGORY_TAG, `[cat:${category}]`);
  return `[cat:${category}]${whiteboard}`;
}
