import { UserCheck, X } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import { useAssignableUsers, useBulkReassign } from '../../api/hooks';
import { useToast } from '../../context/ToastContext';
import { Button } from '../ui/Button';
import { Select } from '../ui/Field';

/**
 * Sticky action bar shown when one or more bugs are selected: pick an assignee and reassign
 * them all in a single call. Reassigning is a normal developer action, so this is available
 * wherever the bug list is — the backend enforces the actual Bugzilla permission.
 */
export function BulkReassignBar({ selectedIds, onDone }: { selectedIds: Set<number>; onDone: () => void }) {
  const { data: assignable } = useAssignableUsers();
  const bulk = useBulkReassign();
  const { toast } = useToast();
  const [assignee, setAssignee] = useState('');

  if (selectedIds.size === 0) return null;

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
            {u.name}
          </option>
        ))}
      </Select>

      <Button size="sm" onClick={apply} loading={bulk.isPending} disabled={!assignee}>
        Apply
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
