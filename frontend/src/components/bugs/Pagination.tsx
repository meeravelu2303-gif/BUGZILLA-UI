import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../ui/Button';

export function Pagination({
  offset,
  hasMore,
  count,
  onPrev,
  onNext,
}: {
  offset: number;
  hasMore: boolean;
  count: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const start = count === 0 ? 0 : offset + 1;
  const end = offset + count;

  return (
    <div className="flex items-center justify-between border-t border-white/30 px-5 py-3">
      <p className="text-sm text-slate-600">
        Showing <span className="font-medium text-slate-700">{start}</span>–<span className="font-medium text-slate-700">{end}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={onPrev} disabled={offset === 0}>
          <ChevronLeft className="h-4 w-4" /> Previous
        </Button>
        <Button variant="secondary" size="sm" onClick={onNext} disabled={!hasMore}>
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
