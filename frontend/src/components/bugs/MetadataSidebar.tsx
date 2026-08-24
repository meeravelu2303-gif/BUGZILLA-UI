import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ApiError } from '../../api/client';
import { useAssignableUsers, useUpdateBug } from '../../api/hooks';
import { useToast } from '../../context/ToastContext';
import type { Bug, BugMeta, Product } from '../../types';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../ui/Card';
import { Input, Select } from '../ui/Field';
import { formatDateTime } from '../../lib/utils';

interface FormState {
  status: string;
  resolution: string;
  priority: string;
  severity: string;
  assignedTo: string;
  component: string;
  version: string;
  targetMilestone: string;
  whiteboard: string;
}

function toFormState(bug: Bug): FormState {
  return {
    status: bug.status,
    resolution: bug.resolution,
    priority: bug.priority,
    severity: bug.severity,
    assignedTo: bug.assignedTo?.email ?? '',
    component: bug.component,
    version: bug.version,
    targetMilestone: bug.targetMilestone,
    whiteboard: bug.whiteboard,
  };
}

const OPEN_STATUSES = new Set(['UNCONFIRMED', 'CONFIRMED', 'IN_PROGRESS']);

export function MetadataSidebar({ bug, meta, product }: { bug: Bug; meta?: BugMeta; product?: Product }) {
  const [form, setForm] = useState<FormState>(() => toFormState(bug));
  const { toast } = useToast();
  const updateBug = useUpdateBug(bug.id);
  const { data: assignable } = useAssignableUsers();

  useEffect(() => {
    setForm(toFormState(bug));
  }, [bug]);

  const original = toFormState(bug);
  const dirty = (Object.keys(form) as (keyof FormState)[]).filter((k) => form[k] !== original[k]);
  const isDirty = dirty.length > 0;
  const needsResolution = !OPEN_STATUSES.has(form.status);
  /** Closed as stored, per Bugzilla's own `isOpen` flag rather than a status name. */
  const isClosed = !bug.isOpen;
  /**
   * The assignee is locked once a bug is closed *or* while this edit is closing
   * it. Both reach the same end state - a closed bug whose assignee changed at
   * closing time - and the assignee is the record of who actually fixed it, so
   * allowing the one-save route would just be a loophole around the other.
   * Reassign first, save, then close.
   */
  const lockAssignee = isClosed || needsResolution;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Choosing a closing status drops any pending assignee edit, so the form
      // can always be saved. Leaving it staged would produce a disabled field
      // holding a value the backend is about to reject.
      if (key === 'status' && !OPEN_STATUSES.has(String(value))) next.assignedTo = original.assignedTo;
      return next;
    });
  }

  async function onSave() {
    const payload: Record<string, string> = {};
    for (const key of dirty) payload[key] = form[key];

    try {
      await updateBug.mutateAsync(payload);
      toast({ variant: 'success', title: 'Bug updated' });
    } catch (err) {
      toast({
        variant: 'error',
        title: 'Update failed',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  }

  return (
    <Card className="sticky top-6">
      <CardHeader>
        <CardTitle>Details</CardTitle>
        {isDirty && (
          <Button size="sm" onClick={onSave} loading={updateBug.isPending}>
            <Save className="h-3.5 w-3.5" /> Save
          </Button>
        )}
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <Select label="Status" value={form.status} onChange={(e) => set('status', e.target.value)}>
          {(meta?.statuses ?? [form.status]).map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </Select>

        {needsResolution && (
          <Select label="Resolution" placeholder="—" value={form.resolution} onChange={(e) => set('resolution', e.target.value)}>
            {(meta?.resolutions ?? [form.resolution]).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        )}

        <Select label="Priority" value={form.priority} onChange={(e) => set('priority', e.target.value)}>
          {(meta?.priorities ?? [form.priority]).map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>

        <Select label="Severity" value={form.severity} onChange={(e) => set('severity', e.target.value)}>
          {(meta?.severities ?? [form.severity]).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>

        <Select label="Component" value={form.component} onChange={(e) => set('component', e.target.value)}>
          {(product?.components.map((c) => c.name) ?? [form.component]).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>

        <Select label="Version" value={form.version} onChange={(e) => set('version', e.target.value)}>
          {(product?.versions ?? [form.version]).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </Select>

        {/*
          A closed bug cannot be reassigned - the work is done, and changing the
          assignee would rewrite the record of who fixed it. Disabled rather than
          hidden so the current assignee is still readable, with the reason and
          the way out ("reopen it first") stated in the hint. The backend enforces
          the same rule, so this is a courtesy, not the control.
        */}
        <Select
          label="Assignee"
          value={form.assignedTo}
          onChange={(e) => set('assignedTo', e.target.value)}
          disabled={lockAssignee}
          hint={
            isClosed
              ? "Closed bugs can't be reassigned — reopen it to change the assignee."
              : needsResolution
                ? 'Save the reassignment before closing — the assignee records who fixed it.'
                : undefined
          }
        >
          {/* Members with access to this product. The current assignee is always listed even
              if the lookup hasn't loaded, so the field never shows blank for a set value. */}
          {(() => {
            const users = assignable?.users ?? [];
            const known = new Set(users.map((u) => u.email));
            const options = [...users];
            if (form.assignedTo && !known.has(form.assignedTo)) {
              options.unshift({ email: form.assignedTo, name: form.assignedTo });
            }
            {/* Show the person's name only; the email is the stored value, not the label. */}
            return options.map((u) => (
              <option key={u.email} value={u.email} title={u.email}>
                {u.name}
              </option>
            ));
          })()}
        </Select>

        <Input label="Whiteboard" value={form.whiteboard} onChange={(e) => set('whiteboard', e.target.value)} />

        <div className="border-t border-white/30 pt-4">
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-slate-600">Reporter</dt>
              <dd className="flex items-center gap-2 font-medium text-slate-900">
                <Avatar name={bug.creator?.name ?? '?'} />
                {bug.creator?.name ?? 'Unknown'}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-600">Product</dt>
              <dd className="font-medium text-slate-900">{bug.product}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-600">Created</dt>
              <dd className="font-medium text-slate-900">{formatDateTime(bug.creationTime)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-600">Updated</dt>
              <dd className="font-medium text-slate-900">{formatDateTime(bug.lastChangeTime)}</dd>
            </div>
          </dl>
        </div>
      </CardBody>
    </Card>
  );
}
