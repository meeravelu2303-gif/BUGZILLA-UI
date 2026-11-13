/** Editable bug reports. */
export const REVISION_MARKER = '[report-revision]';
const EXPLANATION =
  'The bug report was edited. This comment holds the full updated report, which replaces the description above.';

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

/** Comments in Bugzilla order (oldest first). */
export function effectiveReport<C extends { text?: string; count?: number }>(
  comments: C[],
): { text: string; latestRevision: C | null; revisions: C[] } {
  const revisions = comments.filter((comment) => isReportRevision(comment.text));
  const latest = revisions[revisions.length - 1] ?? null;
  if (latest) return { text: stripRevision(latest.text ?? ''), latestRevision: latest, revisions };
  const original = comments.find((comment) => comment.count === 0) ?? comments[0];
  return { text: original?.text ?? '', latestRevision: null, revisions };
}

/** Same line endings, so "unchanged" compares fairly. */
export function normaliseReport(text: string): string {
  const unified = text.replace(/\r\n?/g, '\n');
  return (unified.includes('\n') ? unified : unified.replace(/\\r\\n|\\n/g, '\n'))
    .split('\n')
    .map((value) => value.trimEnd())
    .join('\n')
    .trim();
}

const CATEGORY_TAG = /\[cat:[A-Za-z]+\]/;

/** The whiteboard with its [cat:…] tag set to category ('Unclassified' removes it). */
export function withCategoryTag(whiteboard: string, category: string): string {
  if (category === 'Unclassified') return whiteboard.replace(CATEGORY_TAG, '').trim();
  if (CATEGORY_TAG.test(whiteboard)) return whiteboard.replace(CATEGORY_TAG, `[cat:${category}]`);
  return `[cat:${category}]${whiteboard}`;
}
