import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../ui/Button';

/** Page controls for a bug list. */
export function Pagination({
  offset,
  hasMore,
  count,
  total,
  onPrevious,
  onNext,
}: {
  offset: number;
  hasMore: boolean;
  count: number;
  total?: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const start = count === 0 ? 0 : offset + 1;
  const end = offset + count;

  const canGoNext = hasMore && (total === undefined || end < total);

  return (
    <div className="flex items-center justify-between border-t border-hairline bg-slate-50/60 px-5 py-3">
      <p className="text-[0.8667rem] text-slate-600">
        Showing <span className="font-semibold tabular-nums text-slate-800">{start}</span>–
        <span className="font-semibold tabular-nums text-slate-800">{end}</span>
        {total !== undefined && (
          <>
            {' '}
            of <span className="font-semibold tabular-nums text-slate-800">{total.toLocaleString()}</span>
          </>
        )}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={onPrevious} disabled={offset === 0}>
          <ChevronLeft className="h-4 w-4" /> Previous
        </Button>
        <Button variant="secondary" size="sm" onClick={onNext} disabled={!canGoNext}>
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
