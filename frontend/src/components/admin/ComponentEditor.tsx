import { AlertTriangle, Save, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import { useDeleteComponent, useUpdateComponent } from '../../api/hooks';
import { useToast } from '../../context/ToastContext';
import type { AdminComponent } from '../../types';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Field';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "a@x, b@x" or one per line -> a clean, de-duplicated list. */
function parseEmails(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))];
}

/**
 * Inline editor for one component: every field editcomponents.cgi offers, plus delete.
 *
 * Delete is offered only when it can succeed - no bugs, and not the product's last component -
 * and otherwise says why and points at the alternative (deactivate). The extension re-checks both,
 * so this is guidance, not the control.
 */
export function ComponentEditor({ component, onClose }: { component: AdminComponent; onClose: () => void }) {
  const update = useUpdateComponent(component.id);
  const remove = useDeleteComponent(component.id);
  const { toast } = useToast();

  const [name, setName] = useState(component.name);
  const [description, setDescription] = useState(component.description);
  const [assignee, setAssignee] = useState(component.defaultAssignee);
  const [qaContact, setQaContact] = useState(component.defaultQaContact);
  const [cc, setCc] = useState(component.defaultCc.join(', '));
  const [isActive, setIsActive] = useState(component.isActive);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ccList = parseEmails(cc);
  const errors = {
    name: !name.trim() ? 'Component name is required' : name.trim().length > 64 ? 'At most 64 characters' : undefined,
    description: !description.trim() ? 'Description is required' : undefined,
    assignee: !EMAIL.test(assignee.trim()) ? 'Enter a valid email address' : undefined,
    qaContact: qaContact.trim() && !EMAIL.test(qaContact.trim()) ? 'Enter a valid email address' : undefined,
    cc: ccList.find((e) => !EMAIL.test(e)) ? `Not an email address: ${ccList.find((e) => !EMAIL.test(e))}` : undefined,
  };
  const valid = Object.values(errors).every((e) => !e);

  const original = component.defaultCc.slice().sort().join(',');
  const dirty =
    name.trim() !== component.name ||
    description.trim() !== component.description ||
    assignee.trim() !== component.defaultAssignee ||
    (component.qaContactEnabled && qaContact.trim() !== component.defaultQaContact) ||
    ccList.slice().sort().join(',') !== original ||
    isActive !== component.isActive;

  async function onSave() {
    setError(null);
    try {
      await update.mutateAsync({
        ...(name.trim() !== component.name ? { name: name.trim() } : {}),
        ...(description.trim() !== component.description ? { description: description.trim() } : {}),
        ...(assignee.trim() !== component.defaultAssignee ? { defaultAssignee: assignee.trim() } : {}),
        ...(component.qaContactEnabled && qaContact.trim() !== component.defaultQaContact ? { defaultQaContact: qaContact.trim() } : {}),
        ...(ccList.slice().sort().join(',') !== original ? { defaultCc: ccList } : {}),
        ...(isActive !== component.isActive ? { isActive } : {}),
      });
      toast({ variant: 'success', title: `Component "${name.trim()}" saved` });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the component.');
    }
  }

  async function onDelete() {
    setError(null);
    try {
      await remove.mutateAsync();
      toast({ variant: 'success', title: `Component "${component.name}" deleted` });
      onClose();
    } catch (err) {
      setConfirmDelete(false);
      setError(err instanceof ApiError ? err.message : 'Could not delete the component.');
    }
  }

  const deleteBlocker =
    component.bugCount > 0
      ? `${component.bugCount} bug${component.bugCount === 1 ? ' uses' : 's use'} this component. Move them to another component, or deactivate it instead.`
      : component.isLast
        ? 'This is the product’s only component, and a product must keep at least one.'
        : null;

  return (
    <div className="flex flex-col gap-4 border-t border-white/30 bg-white/50 px-4 py-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900">Edit component</p>
        <button type="button" onClick={onClose} aria-label="Close editor" className="focus-ring rounded p-1 text-slate-500 hover:text-slate-800">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={64} autoComplete="off" />
        <Input label="Default assignee" type="email" value={assignee} onChange={(e) => setAssignee(e.target.value)} error={errors.assignee} autoComplete="off" />
      </div>
      <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} error={errors.description} rows={2} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label="Default QA contact"
          type="email"
          value={component.qaContactEnabled ? qaContact : ''}
          onChange={(e) => setQaContact(e.target.value)}
          error={component.qaContactEnabled ? errors.qaContact : undefined}
          disabled={!component.qaContactEnabled}
          placeholder={component.qaContactEnabled ? 'Optional' : 'Turned off on this Bugzilla'}
          hint={component.qaContactEnabled ? undefined : 'QA contacts are disabled (the useqacontact parameter), so Bugzilla would ignore this.'}
          autoComplete="off"
        />
        <Input
          label="Default CC"
          value={cc}
          onChange={(e) => setCc(e.target.value)}
          error={errors.cc}
          placeholder="Emails, comma-separated"
          hint="Added to the CC list of every new bug in this component."
          autoComplete="off"
        />
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="focus-ring mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600"
        />
        <span>
          <span className="font-medium text-slate-900">Active</span>
          <span className="block text-xs text-slate-600">
            Inactive components keep their bugs and history but can't be chosen for new bugs — the normal way to retire one.
          </span>
        </span>
      </label>

      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/40 pt-3">
        {/* Delete */}
        {confirmDelete ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-inset ring-rose-200">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            <span>
              Delete <span className="font-semibold">{component.name}</span>? It has <span className="font-semibold">0 bugs</span>. This can't be undone.
            </span>
            <Button size="sm" variant="danger" onClick={onDelete} loading={remove.isPending}>
              Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep
            </Button>
          </div>
        ) : deleteBlocker ? (
          <p className="flex max-w-md items-start gap-1.5 text-xs text-slate-600">
            <Trash2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            <span>Can't delete: {deleteBlocker}</span>
          </p>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} className="text-rose-700 hover:bg-rose-50">
            <Trash2 className="h-3.5 w-3.5" /> Delete component
          </Button>
        )}

        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={onSave} disabled={!dirty || !valid} loading={update.isPending}>
            <Save className="h-3.5 w-3.5" /> Save
          </Button>
        </div>
      </div>
    </div>
  );
}
