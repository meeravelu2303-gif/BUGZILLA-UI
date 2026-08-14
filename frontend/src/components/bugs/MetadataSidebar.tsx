import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ApiError } from '../../api/client';
import { useUpdateBug } from '../../api/hooks';
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

  useEffect(() => {
    setForm(toFormState(bug));
  }, [bug]);

  const original = toFormState(bug);
  const dirty = (Object.keys(form) as (keyof FormState)[]).filter((k) => form[k] !== original[k]);
  const isDirty = dirty.length > 0;
  const needsResolution = !OPEN_STATUSES.has(form.status);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
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

        <Input
          label="Assignee"
          type="email"
          value={form.assignedTo}
          onChange={(e) => set('assignedTo', e.target.value)}
          placeholder="name@example.com"
        />

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
