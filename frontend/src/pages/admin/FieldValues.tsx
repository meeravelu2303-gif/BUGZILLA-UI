import { AlertCircle, AlertTriangle, ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import {
  useCreateFieldValue,
  useDeleteFieldValue,
  useFieldValues,
  useReorderFieldValues,
  useUpdateFieldValue,
  useWorkflowAdmin,
} from '../../api/hooks';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { Pill, PRIORITY_TONE_MAP, SEVERITY_TONE, STATUS_TONE, type Tone } from '../../components/ui/Pill';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../context/ToastContext';
import { cn } from '../../lib/utils';
import type { EditableField, FieldValue } from '../../types';

const FIELDS: Array<{ key: EditableField; title: string; tone?: (v: string) => Tone }> = [
  { key: 'bug_severity', title: 'Severity', tone: (v) => SEVERITY_TONE[v] ?? 'slate' },
  { key: 'priority', title: 'Priority', tone: (v) => PRIORITY_TONE_MAP[v] ?? 'slate' },
  { key: 'bug_status', title: 'Status', tone: (v) => STATUS_TONE[v] ?? 'slate' },
  { key: 'resolution', title: 'Resolution' },
  { key: 'op_sys', title: 'Operating system' },
  { key: 'rep_platform', title: 'Platform' },
];

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

function ValueRow({
  field,
  value,
  tone,
  index,
  count,
  onMove,
}: {
  field: EditableField;
  value: FieldValue;
  tone?: Tone;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
}) {
  const update = useUpdateFieldValue(field);
  const remove = useDeleteFieldValue(field);
  const { toast } = useToast();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(value.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => setName(value.name), [value.name]);

  // Default and built-in values cannot be disabled either - Bugzilla refuses both.
  const lockActive = value.isDefault || value.isStatic;
  const nameError = !name.trim() ? 'A value is required' : name.includes(',') ? 'No commas' : name.trim().length > 64 ? 'At most 64 characters' : undefined;

  async function run(p: Promise<unknown>, ok: string) {
    try {
      await p;
      toast({ variant: 'success', title: ok });
      return true;
    } catch (err) {
      toast({ variant: 'error', title: 'Not changed', description: err instanceof ApiError ? err.message : 'Please try again.' });
      return false;
    }
  }

  async function onRename(e: FormEvent) {
    e.preventDefault();
    if (nameError || name.trim() === value.name) return setRenaming(false);
    if (await run(update.mutateAsync({ id: value.id, value: name.trim() }), `Renamed to "${name.trim()}"`)) setRenaming(false);
  }

  return (
    <li className={cn('flex flex-col gap-2 px-4 py-2.5', !value.isActive && 'bg-slate-50/60')}>
      <div className="flex items-center gap-3">
        <div className="flex flex-col">
          <button type="button" aria-label={`Move ${value.name} up`} disabled={index === 0} onClick={() => onMove(index, index - 1)} className="focus-ring rounded text-slate-400 hover:text-slate-700 disabled:opacity-30">
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button type="button" aria-label={`Move ${value.name} down`} disabled={index === count - 1} onClick={() => onMove(index, index + 1)} className="focus-ring rounded text-slate-400 hover:text-slate-700 disabled:opacity-30">
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>

        {renaming ? (
          <form onSubmit={onRename} className="flex min-w-0 flex-1 items-start gap-2">
            <div className="min-w-0 flex-1">
              <Input aria-label="New name" value={name} onChange={(e) => setName(e.target.value)} error={nameError} autoFocus autoComplete="off" />
              {value.bugCount > 0 && <p className="mt-1 text-xs text-amber-700">Renaming also changes it on {plural(value.bugCount, 'bug')}.</p>}
            </div>
            <Button size="sm" type="submit" disabled={Boolean(nameError)} loading={update.isPending} aria-label="Save name">
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => { setName(value.name); setRenaming(false); }} aria-label="Cancel rename">
              <X className="h-3.5 w-3.5" />
            </Button>
          </form>
        ) : (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {value.name ? (
              <Pill tone={tone ?? 'slate'}>{value.name}</Pill>
            ) : (
              <span className="text-sm italic text-slate-500">(none — open bugs)</span>
            )}
            {value.isOpen !== undefined && <span className={cn('text-xs font-medium', value.isOpen ? 'text-amber-700' : 'text-emerald-700')}>{value.isOpen ? 'Open' : 'Closed'}</span>}
            {value.isDefault && <Pill tone="teal">Default</Pill>}
            {value.isStatic && <Pill tone="violet">Built-in</Pill>}
            {!value.isActive && <Pill tone="amber">Inactive</Pill>}
          </div>
        )}

        {!renaming && (
          <>
            <span className="shrink-0 text-xs tabular-nums text-slate-500" title="Bugs with this value">
              {plural(value.bugCount, 'bug')}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={() => setRenaming(true)} disabled={value.isStatic && value.name === ''} className="focus-ring rounded p-1 text-slate-500 hover:bg-white/70 hover:text-brand-700 disabled:opacity-30" aria-label={`Rename ${value.name}`} title="Rename">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => run(update.mutateAsync({ id: value.id, isActive: !value.isActive }), value.isActive ? `"${value.name}" deactivated` : `"${value.name}" activated`)}
                disabled={lockActive || update.isPending}
                title={lockActive ? `Can't deactivate: ${value.isDefault ? 'it is the default value' : 'it is built into Bugzilla'}` : value.isActive ? 'Deactivate - hidden from new bugs, kept on existing ones' : 'Activate'}
                className="focus-ring rounded px-1.5 py-0.5 text-xs font-medium text-slate-600 hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {value.isActive ? 'Deactivate' : 'Activate'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={Boolean(value.deleteBlock)}
                title={value.deleteBlock ? `Can't delete: ${value.deleteBlock}${value.bugCount ? ` (${plural(value.bugCount, 'bug')})` : ''}` : 'Delete'}
                className="focus-ring rounded p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label={`Delete ${value.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </>
        )}
      </div>

      {confirmDelete && (
        <div className="ml-7 flex flex-wrap items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900 ring-1 ring-inset ring-rose-200">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            Delete <span className="font-semibold">{value.name}</span>? No bug uses it. This can't be undone.
          </span>
          <Button size="sm" variant="danger" loading={remove.isPending} onClick={() => run(remove.mutateAsync(value.id), `"${value.name}" deleted`).then(() => setConfirmDelete(false))}>
            Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
            Keep
          </Button>
        </div>
      )}
    </li>
  );
}

function AddValueForm({ field, missingIntoDuplicate, duplicateStatus }: { field: EditableField; missingIntoDuplicate: string[]; duplicateStatus: string }) {
  const create = useCreateFieldValue(field);
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [isOpen, setIsOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isStatus = field === 'bug_status';
  const nameError = name && name.includes(',') ? 'No commas' : name.trim().length > 64 ? 'At most 64 characters' : undefined;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || nameError) return;
    try {
      await create.mutateAsync({ value: name.trim(), ...(isStatus ? { isOpen } : {}) });
      toast({ variant: 'success', title: `"${name.trim()}" added` });
      setName('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add the value.');
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 border-t border-white/40 px-4 py-4" autoComplete="off">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <Input label="Add a value" value={name} onChange={(e) => setName(e.target.value)} error={nameError} placeholder="New value — added at the end" maxLength={64} />
        </div>
        {isStatus && (
          <fieldset className="flex gap-3 pb-2 text-sm">
            <legend className="sr-only">Open or closed</legend>
            {[true, false].map((open) => (
              <label key={String(open)} className="flex items-center gap-1.5">
                <input type="radio" name="status-open" checked={isOpen === open} onChange={() => setIsOpen(open)} className="h-4 w-4 text-brand-600" />
                {open ? 'Open' : 'Closed'}
              </label>
            ))}
          </fieldset>
        )}
        <Button type="submit" disabled={!name.trim() || Boolean(nameError)} loading={create.isPending}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
      {isStatus && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 ring-1 ring-inset ring-amber-600/20">
          Open or closed is permanent — Bugzilla can't change it later. Adding a status also makes Bugzilla allow every status to move to{' '}
          <span className="font-semibold">{duplicateStatus}</span> (so any bug can be marked a duplicate)
          {missingIntoDuplicate.length > 0 ? (
            <>
              ; that will add <span className="font-semibold">{missingIntoDuplicate.map((s) => `${s} → ${duplicateStatus}`).join(', ')}</span>, which the workflow does not allow today.
            </>
          ) : (
            '.'
          )}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    </form>
  );
}

export function FieldValues() {
  const [field, setField] = useState<EditableField>('bug_severity');
  const def = FIELDS.find((f) => f.key === field)!;
  const { data, isLoading, error } = useFieldValues(field);
  const reorder = useReorderFieldValues(field);
  const { data: workflow } = useWorkflowAdmin();
  const { toast } = useToast();
  const [order, setOrder] = useState<FieldValue[] | null>(null);

  useEffect(() => setOrder(null), [field, data]);
  const values = order ?? data?.values ?? [];
  const reordered = order !== null;

  // Statuses that cannot reach duplicate_or_move_bug_status today - Status->create would add them.
  const missingIntoDuplicate = useMemo(() => {
    if (!workflow) return [];
    const dupe = workflow.statuses.find((s) => s.name === workflow.duplicateStatus);
    if (!dupe) return [];
    return workflow.statuses
      .filter((s) => s.id !== dupe.id && !workflow.transitions.some((t) => t.from === s.id && t.to === dupe.id))
      .map((s) => s.name);
  }, [workflow]);

  function move(from: number, to: number) {
    const next = [...values];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setOrder(next);
  }

  async function saveOrder() {
    try {
      await reorder.mutateAsync(values.map((v) => v.id));
      toast({ variant: 'success', title: 'Order saved' });
    } catch (err) {
      toast({ variant: 'error', title: 'Order not saved', description: err instanceof ApiError ? err.message : 'Please try again.' });
    }
  }

  return (
    <div className="mx-auto max-w-[960px] px-4 py-8 sm:px-8">
      <PageHeader
        title="Field Values"
        description="The values offered for severity, priority, status and the other standard fields. Deactivate a value to retire it; deleting is only possible when no bug uses it."
        crumbs={[{ label: 'Administration' }, { label: 'Field Values' }]}
      />

      <div role="tablist" aria-label="Field" className="mb-5 flex flex-wrap gap-1 rounded-xl bg-slate-900/[0.06] p-1">
        {FIELDS.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={field === f.key}
            onClick={() => setField(f.key)}
            className={cn('focus-ring flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-all', field === f.key ? 'bg-white font-semibold text-brand-800 shadow-sm' : 'font-medium text-slate-600 hover:bg-white/50')}
          >
            {f.title}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Card>
          <CardBody className="flex flex-col gap-3">
            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-9" />)}
          </CardBody>
        </Card>
      ) : error ? (
        <EmptyState icon={AlertCircle} title="Couldn't load values" description={error instanceof ApiError ? error.message : 'Please try again.'} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {def.title}
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">{values.length}</span>
            </CardTitle>
            {reordered ? (
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setOrder(null)}>Discard order</Button>
                <Button size="sm" onClick={saveOrder} loading={reorder.isPending}>Save order</Button>
              </div>
            ) : (
              <span className="text-xs text-slate-500">Use the arrows to reorder</span>
            )}
          </CardHeader>
          <ul className="divide-y divide-white/40">
            {values.map((v, i) => (
              <ValueRow key={v.id} field={field} value={v} tone={def.tone?.(v.name)} index={i} count={values.length} onMove={move} />
            ))}
          </ul>
          <AddValueForm field={field} missingIntoDuplicate={missingIntoDuplicate} duplicateStatus={workflow?.duplicateStatus ?? 'RESOLVED'} />
        </Card>
      )}
    </div>
  );
}
