import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../ui/Button';

/**
 * Page controls for a bug list.
 *
 * `total` is the count for the **filtered** result set, and it is what decides whether Next is
 * offered. `hasMore` alone could not: it is derived from a single page of results, so any
 * disagreement between that page and the filtered total — a stale response still in flight, a
 * count that narrowed after the page was fetched — left Next enabled with nothing behind it.
 * Readers landed on empty pages and, with no total on screen, could not tell how far the list
 * actually went.
 *
 * Both signals are required now: `hasMore` says this page was full, `total` says the set is
 * genuinely longer. Rendering "of N" alongside them also makes any disagreement visible rather
 * than silent, which is how the empty pages went unnoticed in the first place.
 */
export function Pagination({
  offset,
  hasMore,
  count,
  total,
  onPrev,
  onNext,
}: {
  offset: number;
  hasMore: boolean;
  count: number;
  /** Total matching the current filters. Undefined while the count is still loading. */
  total?: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const start = count === 0 ? 0 : offset + 1;
  const end = offset + count;

  // Offer Next only when the page was full AND the filtered total confirms more exist. While the
  // count is loading, `hasMore` alone governs, so the control is never wrongly disabled.
  const canGoNext = hasMore && (total === undefined || end < total);

  return (
    <div className="flex items-center justify-between border-t border-white/30 px-5 py-3">
      <p className="text-sm text-slate-600">
        Showing <span className="font-medium text-slate-700">{start}</span>–
        <span className="font-medium text-slate-700">{end}</span>
        {total !== undefined && (
          <>
            {' '}
            of <span className="font-medium text-slate-700">{total.toLocaleString()}</span>
          </>
        )}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={onPrev} disabled={offset === 0}>
          <ChevronLeft className="h-4 w-4" /> Previous
        </Button>
        <Button variant="secondary" size="sm" onClick={onNext} disabled={!canGoNext}>
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
