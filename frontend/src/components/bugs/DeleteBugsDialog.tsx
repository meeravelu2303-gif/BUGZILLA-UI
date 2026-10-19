import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { useDeleteBugs } from '../../api/hooks';
import { useToast } from '../../context/ToastContext';
import { bugDisplayId } from '../../lib/utils';
import { Button } from '../ui/Button';

/**
 * Confirms a soft delete. A reason is required: it goes into the bug's history,
 * and "why was this deleted?" is the first question anyone asks when a bug they
 * were following disappears.
 *
 * Built on the native <dialog> - showModal() traps focus, makes the page behind
 * inert and closes on Escape without any hand-rolled focus management.
 */
export function DeleteBugsDialog({
  open,
  ids,
  onClose,
  onDeleted,
}: {
  open: boolean;
  ids: number[];
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('');
  const del = useDeleteBugs();
  const { toast } = useToast();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setReason('');
      dialog.showModal();
    } else if (!open && dialog.open) dialog.close();
  }, [open]);

  const tooShort = reason.trim().length < 3;
  const label = ids.length === 1 ? bugDisplayId({ id: ids[0] }) : `${ids.length} bugs`;

  async function confirm() {
    if (tooShort) return;
    try {
      const res = await del.mutateAsync({ ids, reason: reason.trim() });
      toast({
        variant: 'success',
        title: `Deleted ${res.deleted === 1 ? label : `${res.deleted} bugs`}`,
        description: 'Testers and admins can still find and restore it under "Deleted bugs".',
      });
      onDeleted?.();
      onClose();
    } catch (err) {
      toast({ variant: 'error', title: 'Could not delete', description: err instanceof ApiError ? err.message : 'Please try again.' });
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && !del.isPending && onClose()}
      aria-labelledby="delete-title"
      className="w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-hairline bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/40 backdrop:backdrop-blur-[2px]"
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void confirm();
        }}
        className="flex flex-col gap-4 p-6"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
            <Trash2 className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 id="delete-title" className="text-base font-semibold">
              Delete {label}?
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {ids.length === 1 ? 'It' : 'They'} will disappear from every list, report and export. Nothing is erased: testers and admins
              can restore {ids.length === 1 ? 'it' : 'them'} exactly as {ids.length === 1 ? 'it was' : 'they were'}.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="delete-reason" className="text-sm font-medium text-slate-700">
            Reason <span className="font-normal text-slate-500">(saved in the bug history)</span>
          </label>
          <textarea
            id="delete-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            autoFocus
            maxLength={1000}
            placeholder="e.g. Filed twice by the test bench during the 14 Oct rerun."
            className="focus-ring w-full resize-y rounded-xl border border-hairline px-3 py-2 text-sm placeholder:text-slate-400"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={del.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" loading={del.isPending} disabled={tooShort}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      </form>
    </dialog>
  );
}
