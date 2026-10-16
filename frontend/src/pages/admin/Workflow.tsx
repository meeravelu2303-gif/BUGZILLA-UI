import { AlertCircle, ArrowRight, Check, Lock, MessageSquare, RotateCcw, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../api/client';
import { useUpdateWorkflow, useWorkflowAdmin } from '../../api/hooks';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { Pill, STATUS_TONE } from '../../components/ui/Pill';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../context/ToastContext';
import { cn } from '../../lib/utils';
import type { WorkflowData, WorkflowDiff } from '../../types';

/** none -> allowed -> allowed with a required comment -> none. */
type Cell = 'none' | 'allowed' | 'comment';
type Matrix = Record<string, Cell>;

const key = (from: number, to: number) => `${from}:${to}`;

function toMatrix(w: WorkflowData): Matrix {
  const m: Matrix = {};
  for (const t of w.transitions) m[key(t.from, t.to)] = t.requireComment ? 'comment' : 'allowed';
  return m;
}

/** The explicit diff the extension applies - and the summary shown before saving. */
function diffOf(before: Matrix, after: Matrix): WorkflowDiff {
  const d: WorkflowDiff = { add: [], remove: [], comment: [] };
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const [from, to] = k.split(':').map(Number);
    const a = before[k] ?? 'none';
    const b = after[k] ?? 'none';
    if (a === b) continue;
    if (a === 'none') d.add.push({ from, to, requireComment: b === 'comment' });
    else if (b === 'none') d.remove.push({ from, to });
    else d.comment.push({ from, to, requireComment: b === 'comment' });
  }
  return d;
}

export function Workflow() {
  const { data, isLoading, error } = useWorkflowAdmin();
  const update = useUpdateWorkflow();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Matrix>({});
  const [reviewing, setReviewing] = useState(false);

  const original = useMemo(() => (data ? toMatrix(data) : {}), [data]);
  useEffect(() => setDraft(original), [original]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-8">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-6 h-72" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-8">
        <EmptyState icon={AlertCircle} title="Couldn't load the workflow" description={error instanceof ApiError ? error.message : 'Please try again.'} />
      </div>
    );
  }

  const statuses = data.statuses;
  const name = (id: number) => (id === 0 ? 'New bug' : (statuses.find((s) => s.id === id)?.name ?? `#${id}`));
  const dupe = statuses.find((s) => s.name === data.duplicateStatus);
  const diff = diffOf(original, draft);
  const changes = diff.add.length + diff.remove.length + diff.comment.length;

  // Transitions into duplicate_or_move_bug_status from an existing status are required by
  // Bugzilla (any bug can be marked a duplicate): they can gain or lose "comment required" but
  // never be removed. One that is missing today may be added.
  const lockedOn = (from: number, to: number) => from !== 0 && dupe?.id === to && original[key(from, to)] !== undefined;

  function cycle(from: number, to: number) {
    const k = key(from, to);
    const cur = draft[k] ?? 'none';
    const next: Cell = cur === 'none' ? 'allowed' : cur === 'allowed' ? 'comment' : lockedOn(from, to) ? 'allowed' : 'none';
    setDraft((d) => {
      const n = { ...d };
      if (next === 'none') delete n[k];
      else n[k] = next;
      return n;
    });
    setReviewing(false);
  }

  async function onSave() {
    try {
      const r = await update.mutateAsync(diff);
      toast({ variant: 'success', title: 'Workflow saved', description: r.applied?.join('; ') });
      setReviewing(false);
    } catch (err) {
      toast({ variant: 'error', title: 'Workflow not saved', description: err instanceof ApiError ? err.message : 'Please try again.' });
    }
  }

  const rows = [{ id: 0, name: 'New bug', isOpen: true, isActive: true }, ...statuses];

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-8">
      <PageHeader
        title="Status Workflow"
        description="Which status a bug may move to from each status. Click a cell to cycle: not allowed → allowed → allowed with a required comment. Nothing is saved until you review the changes."
        crumbs={[{ label: 'Administration' }, { label: 'Status Workflow' }]}
      />

      <Card className="mb-6 overflow-hidden">
        <CardHeader>
          <CardTitle>Transition matrix</CardTitle>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <span className="flex items-center gap-1"><span className="inline-flex h-5 w-5 items-center justify-center rounded bg-emerald-100 text-emerald-700"><Check className="h-3 w-3" /></span> allowed</span>
            <span className="flex items-center gap-1"><span className="inline-flex h-5 w-5 items-center justify-center rounded bg-sky-100 text-sky-700"><MessageSquare className="h-3 w-3" /></span> comment required</span>
            <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> required by Bugzilla</span>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white/80 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">From ↓ &nbsp; To →</th>
                {statuses.map((s) => (
                  <th key={s.id} className="px-2 py-3 text-center">
                    <Pill tone={STATUS_TONE[s.name] ?? 'slate'}>{s.name.replace('_', ' ')}</Pill>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((from) => (
                <tr key={from.id} className="border-t border-white/40">
                  <th className="sticky left-0 z-10 whitespace-nowrap bg-white/80 px-4 py-2 text-left">
                    {from.id === 0 ? (
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">New bug</span>
                    ) : (
                      <Pill tone={STATUS_TONE[from.name] ?? 'slate'}>{from.name.replace('_', ' ')}</Pill>
                    )}
                  </th>
                  {statuses.map((to) => {
                    if (from.id === to.id) {
                      return <td key={to.id} className="px-2 py-2 text-center text-slate-300">·</td>;
                    }
                    const k = key(from.id, to.id);
                    const cell = draft[k] ?? 'none';
                    const changed = (original[k] ?? 'none') !== cell;
                    const locked = lockedOn(from.id, to.id);
                    return (
                      <td key={to.id} className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => cycle(from.id, to.id)}
                          aria-label={`${name(from.id)} to ${to.name}: ${cell === 'none' ? 'not allowed' : cell === 'comment' ? 'allowed, comment required' : 'allowed'}${locked ? ' (required by Bugzilla)' : ''}`}
                          title={locked ? `Required by Bugzilla: ${to.name} is the duplicate status, reachable from every status. Only "comment required" can change.` : undefined}
                          className={cn(
                            'focus-ring relative inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                            cell === 'allowed' && 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200',
                            cell === 'comment' && 'bg-sky-100 text-sky-700 hover:bg-sky-200',
                            cell === 'none' && 'text-slate-300 hover:bg-slate-100 hover:text-slate-500',
                            changed && 'ring-2 ring-amber-400 ring-offset-1'
                          )}
                        >
                          {cell === 'allowed' ? <Check className="h-3.5 w-3.5" /> : cell === 'comment' ? <MessageSquare className="h-3.5 w-3.5" /> : '—'}
                          {locked && <Lock className="absolute -right-1 -top-1 h-2.5 w-2.5 text-slate-500" aria-hidden />}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Pending changes */}
      <Card className={cn(changes === 0 && 'opacity-70')}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Pending changes
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">{changes}</span>
          </CardTitle>
          {changes > 0 && (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setDraft(original); setReviewing(false); }}>
                <RotateCcw className="h-3.5 w-3.5" /> Discard
              </Button>
              {!reviewing ? (
                <Button size="sm" onClick={() => setReviewing(true)}>Review changes</Button>
              ) : (
                <Button size="sm" onClick={onSave} loading={update.isPending}>
                  <Save className="h-3.5 w-3.5" /> Confirm and save
                </Button>
              )}
            </div>
          )}
        </CardHeader>
        <CardBody>
          {changes === 0 ? (
            <p className="text-sm text-slate-500">No changes. Click cells in the matrix to change the workflow.</p>
          ) : (
            <div className={cn('flex flex-col gap-3 text-sm', reviewing && 'rounded-lg bg-amber-50/70 p-3 ring-1 ring-inset ring-amber-600/20')}>
              {reviewing && <p className="font-medium text-amber-900">Saving will make exactly these changes — nothing else in the workflow is touched:</p>}
              {[
                { title: 'Allow', tone: 'text-emerald-800', items: diff.add.map((t) => `${name(t.from)} → ${name(t.to)}${t.requireComment ? ' (comment required)' : ''}`) },
                { title: 'Stop allowing', tone: 'text-rose-800', items: diff.remove.map((t) => `${name(t.from)} → ${name(t.to)}`) },
                { title: 'Comment rule', tone: 'text-sky-800', items: diff.comment.map((t) => `${name(t.from)} → ${name(t.to)}: comment ${t.requireComment ? 'now required' : 'now optional'}`) },
              ]
                .filter((g) => g.items.length > 0)
                .map((g) => (
                  <div key={g.title}>
                    <p className={cn('text-xs font-semibold uppercase tracking-wide', g.tone)}>{g.title}</p>
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {g.items.map((i) => (
                        <li key={i} className="flex items-center gap-1.5 text-slate-800">
                          <ArrowRight className="h-3 w-3 text-slate-400" aria-hidden /> {i}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
