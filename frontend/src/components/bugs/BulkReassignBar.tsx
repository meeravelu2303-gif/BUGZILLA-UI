import { ArchiveRestore, Trash2, UserCheck, X } from 'lucide-react';
import { assigneeLabel } from '../../lib/roles';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import { useAssignableUsers, useBulkReassign, useRestoreBugs } from '../../api/hooks';
import { DeleteBugsDialog } from './DeleteBugsDialog';
import { useToast } from '../../context/ToastContext';
import { Button } from '../ui/Button';
import { Select } from '../ui/Field';

/**
 * Sticky action bar shown when one or more bugs are selected: pick an assignee and reassign
 * them all in a single call. Reassigning is a normal developer action, so this is available
 * wherever the bug list is — the backend enforces the actual Bugzilla permission.
 */
export function BulkReassignBar({
  selectedIds,
  onDone,
  product,
  canTriage = false,
  deletedView = false,
  closedSelected = 0,
}: {
  selectedIds: Set<number>;
  onDone: () => void;
  /**
   * Scopes the assignee list to one product's team.
   *
   * Passed only when the list is filtered to a single product — a selection spanning several has
   * no one team to offer, and narrowing to an arbitrary one would hide the people the other bugs
   * belong to. Undefined then, which falls back to the full list.
   */
  product?: string | string[];
  /** Testers and admins: may delete (or, in the deleted view, restore) the selection. */
  canTriage?: boolean;
  /** The list is the "Deleted bugs" view - offer Restore instead of Reassign/Delete. */
  deletedView?: boolean;
  /** How many selected bugs are closed; those cannot be reassigned. */
  closedSelected?: number;
}) {
  const { data: assignable } = useAssignableUsers(product);
  const bulk = useBulkReassign();
  const restore = useRestoreBugs();
  const { toast } = useToast();
  const [assignee, setAssignee] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (selectedIds.size === 0) return null;

  const ids = [...selectedIds];

  async function onRestore() {
    try {
      const res = await restore.mutateAsync({ ids });
      toast({ variant: 'success', title: `Restored ${res.restored} bug${res.restored === 1 ? '' : 's'}` });
      onDone();
    } catch (err) {
      toast({ variant: 'error', title: 'Restore failed', description: err instanceof ApiError ? err.message : 'Please try again.' });
    }
  }

  if (deletedView) {
    return (
      <div className="sticky bottom-4 z-20 mx-3 mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-white/95 px-4 py-3 shadow-lg ring-1 ring-black/5 backdrop-blur">
        <span className="text-sm font-semibold text-slate-800">{selectedIds.size} selected</span>
        <Button size="sm" onClick={onRestore} loading={restore.isPending} disabled={!canTriage}>
          <ArchiveRestore className="h-3.5 w-3.5" /> Restore
        </Button>
        <button
          type="button"
          onClick={onDone}
          className="focus-ring ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-3.5 w-3.5" /> Clear
        </button>
      </div>
    );
  }

  const reassignBlocked = closedSelected > 0;

  async function apply() {
    if (!assignee) return;
    try {
      const res = await bulk.mutateAsync({ ids: [...selectedIds], assignedTo: assignee });
      toast({ variant: 'success', title: `Reassigned ${res.updated} bug${res.updated === 1 ? '' : 's'}` });
      onDone();
    } catch (err) {
      toast({
        variant: 'error',
        title: 'Bulk reassign failed',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  }

  return (
    <div className="sticky bottom-4 z-20 mx-3 mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-white/95 px-4 py-3 shadow-lg ring-1 ring-black/5 backdrop-blur">
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800">
        <UserCheck className="h-4 w-4 text-brand-600" />
        {selectedIds.size} selected
      </span>

      <span className="text-sm text-slate-500">Reassign to</span>
      <Select
        className="min-w-52"
        value={assignee}
        onChange={(e) => setAssignee(e.target.value)}
        aria-label="Reassign selected bugs to"
      >
        <option value="" disabled>
          Choose assignee…
        </option>
        {(assignable?.users ?? []).map((u) => (
          <option key={u.email} value={u.email} title={u.email}>
            {assigneeLabel(u)}
          </option>
        ))}
      </Select>

      <Button
        size="sm"
        onClick={apply}
        loading={bulk.isPending}
        disabled={!assignee || reassignBlocked}
        title={reassignBlocked ? `${closedSelected} selected bug${closedSelected === 1 ? ' is' : 's are'} closed and can't be reassigned.` : undefined}
      >
        Apply
      </Button>
      {reassignBlocked && (
        <span className="text-xs text-amber-700">
          {closedSelected} closed - deselect {closedSelected === 1 ? 'it' : 'them'} to reassign
        </span>
      )}
      {canTriage && (
        <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(true)} className="text-rose-700">
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </Button>
      )}
      <DeleteBugsDialog open={confirmDelete} ids={ids} onClose={() => setConfirmDelete(false)} onDeleted={onDone} />
      <button
        type="button"
        onClick={onDone}
        className="focus-ring ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      >
        <X className="h-3.5 w-3.5" /> Clear
      </button>
    </div>
  );
}
