import { Boxes, Bug as BugIcon, Check, ChevronDown, ChevronRight, ExternalLink, Layers, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import {
  useAssignableUsers,
  useCreateComponent,
  useCreateSubcomponent,
  useDeleteComponent,
  useDeleteSubcomponent,
  useUpdateComponent,
  useUpdateProduct,
  useUpdateSubcomponent,
} from '../../api/hooks';
import { useToast } from '../../context/ToastContext';
import type { Product, ProductComponent, Subcomponent } from '../../types';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../ui/Card';
import { Input, Select } from '../ui/Field';
import { Pill } from '../ui/Pill';
import { DeleteProductDialog } from './DeleteProductDialog';

/**
 * One product on the admin page. Collapsed it is a single row - name, status,
 * bug and component counts - so 50 products read as a list; expanded it is the
 * full editor with components and actions. The page decides which one is open.
 */
export function ProductAdminCard({
  product,
  bugzillaWebUrl,
  expanded,
  onToggle,
  canManage = true,
  canAddComponent = true,
}: {
  product: Product;
  bugzillaWebUrl: string;
  expanded: boolean;
  onToggle: () => void;
  /** Edit / (de)activate / delete the product and edit components natively. False for testers. */
  canManage?: boolean;
  /** Add a component to this product. Testers and admins. */
  canAddComponent?: boolean;
}) {
  const updateProduct = useUpdateProduct(product.id);
  const createComponent = useCreateComponent(product.id);
  const { toast } = useToast();

  const [showAddComponent, setShowAddComponent] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [defaultAssignee, setDefaultAssignee] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(product.name);
  const [editDescription, setEditDescription] = useState(product.description ?? '');
  const [editError, setEditError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  function startEdit() {
    setEditName(product.name);
    setEditDescription(product.description ?? '');
    setEditError(null);
    setEditing(true);
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    setEditError(null);
    const name = editName.trim();
    const description = editDescription.trim();
    if (!name) return setEditError('Product name is required.');
    if (!description) return setEditError('Description is required.');
    const input: { name?: string; description?: string } = {};
    if (name !== product.name) input.name = name;
    if (description !== (product.description ?? '')) input.description = description;
    if (!input.name && !input.description) return setEditing(false);
    try {
      const res = await updateProduct.mutateAsync(input);
      toast({ variant: 'success', title: input.name ? `Renamed to ${name}` : 'Product updated' });
      // Rename side effects the server could not finish (group rename, transfer routes) - shown, never swallowed.
      for (const w of res.warnings ?? []) toast({ variant: 'info', title: 'Check this', description: w });
      setEditing(false);
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Could not update the product.');
    }
  }

  async function onToggleActive() {
    try {
      await updateProduct.mutateAsync({ isActive: !product.isActive });
      toast({ variant: 'success', title: product.isActive ? 'Product deactivated' : 'Product activated' });
    } catch (err) {
      toast({ variant: 'error', title: 'Update failed', description: err instanceof ApiError ? err.message : 'Please try again.' });
    }
  }

  async function onAddComponent(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!name.trim() || !description.trim() || !defaultAssignee.trim()) {
      setFormError('All fields are required');
      return;
    }
    try {
      await createComponent.mutateAsync({ name: name.trim(), description: description.trim(), defaultAssignee: defaultAssignee.trim() });
      toast({ variant: 'success', title: 'Component created', description: `${name} added to ${product.name}` });
      setName('');
      setDescription('');
      setDefaultAssignee('');
      setShowAddComponent(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not create the component.');
    }
  }

  const bugs = product.bugCount ?? 0;
  const comps = product.components.length;
  const subTotal = product.components.reduce((n, c) => n + (c.subcomponents?.length ?? 0), 0);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={false}
        className="focus-ring group flex w-full items-center gap-3 rounded-xl border border-hairline bg-white/80 px-4 py-3 text-left shadow-sm transition-all hover:border-brand-300 hover:bg-white hover:shadow-card"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-600/15">
          <Boxes className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-900 group-hover:text-brand-800">{product.name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <BugIcon className="h-3 w-3" aria-hidden />
              {bugs.toLocaleString()} bug{bugs === 1 ? '' : 's'}
            </span>
            <span>
              {comps} component{comps === 1 ? '' : 's'}
            </span>
            {subTotal > 0 && (
              <span>
                {subTotal} sub-component{subTotal === 1 ? '' : 's'}
              </span>
            )}
          </span>
        </span>
        <Pill tone={product.isActive ? 'emerald' : 'slate'}>{product.isActive ? 'Active' : 'Inactive'}</Pill>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" aria-hidden />
      </button>
    );
  }

  return (
    <Card className="ring-2 ring-brand-500/20">
      <CardHeader>
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded
            aria-label={`Collapse ${product.name}`}
            className="focus-ring -ml-1 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <ChevronDown className="h-4 w-4" aria-hidden />
          </button>
          <CardTitle className="truncate">{product.name}</CardTitle>
          <Pill tone={product.isActive ? 'emerald' : 'slate'}>{product.isActive ? 'Active' : 'Inactive'}</Pill>
        </div>
        {canManage && (
        <div className="flex shrink-0 items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={startEdit} disabled={editing}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
          <Button size="sm" variant="secondary" onClick={onToggleActive} loading={updateProduct.isPending && !editing}>
            {product.isActive ? 'Deactivate' : 'Activate'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDeleting(true)}
            className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            title={(product.bugCount ?? 0) > 0 ? 'Has bugs - Bugzilla only deletes an empty product' : 'Delete this product'}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>
        )}
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        {canManage && editing ? (
          <form onSubmit={onSaveEdit} className="flex flex-col gap-3 rounded-xl border border-brand-200 bg-brand-50/40 p-4">
            <Input label="Name" required value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={64} />
            <Input
              label="Description"
              required
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              hint={editName.trim() !== product.name ? "Renaming also renames the product's access group, so team access keeps working." : undefined}
            />
            {editError && <p role="alert" className="text-xs font-medium text-rose-600">{editError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={updateProduct.isPending}>
                Cancel
              </Button>
              <Button type="submit" size="sm" loading={updateProduct.isPending}>
                Save changes
              </Button>
            </div>
          </form>
        ) : (
          product.description && <p className="text-sm leading-relaxed text-slate-600">{product.description}</p>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1">
            <BugIcon className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            {(product.bugCount ?? 0).toLocaleString()} bug{product.bugCount === 1 ? '' : 's'}
          </span>
          <span>Versions: {product.versions.join(', ') || '—'}</span>
        </div>

        <div className="rounded-xl border border-white/40 bg-white/40">
          <div className="flex items-center justify-between border-b border-white/30 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Components</span>
            {canAddComponent && (
              <button
                onClick={() => setShowAddComponent((v) => !v)}
                className="focus-ring flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-brand-700 hover:bg-white/60"
              >
                <Plus className="h-3 w-3" /> Add component
              </button>
            )}
          </div>

          {product.components.length === 0 && !showAddComponent ? (
            <p className="px-4 py-3 text-sm text-slate-600">No components yet.</p>
          ) : (
            <ul className="divide-y divide-white/30">
              {product.components.map((c) => (
                <ComponentRow
                  key={c.name}
                  product={product}
                  component={c}
                  bugzillaWebUrl={bugzillaWebUrl}
                  canManage={canManage}
                  canAdd={canAddComponent}
                  isOnlyComponent={product.components.length === 1}
                />
              ))}
            </ul>
          )}

          {canAddComponent && showAddComponent && (
            <form onSubmit={onAddComponent} className="flex flex-col gap-3 border-t border-white/30 px-4 py-3">
              <div className="grid grid-cols-2 gap-3">
                <Input label="Name" required value={name} maxLength={64} onChange={(e) => setName(e.target.value)} placeholder="Component name" />
                <DeveloperSelect product={product.name} value={defaultAssignee} onChange={setDefaultAssignee} />
              </div>
              <Input label="Description" required value={description} onChange={(e) => setDescription(e.target.value)} />
              {formError && <p className="text-xs text-rose-600">{formError}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => setShowAddComponent(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" loading={createComponent.isPending}>
                  Create component
                </Button>
              </div>
            </form>
          )}
        </div>
      </CardBody>
      {canManage && <DeleteProductDialog open={deleting} product={product} onClose={() => setDeleting(false)} />}
    </Card>
  );
}

/**
 * One component and its sub-components.
 *
 * The row reads as before - name, owner, Bugzilla edit link - with a count of
 * its sub-components; clicking it opens the list beneath. Anyone who may add a
 * component may add a sub-component here, and delete an empty component.
 * Renaming, deactivating and deleting sub-components are admin-only, and delete is offered only while no bug uses it: Bugzilla
 * refuses otherwise, so a sub-component in use is deactivated instead - existing
 * bugs keep it and it is no longer offered on new ones.
 */
function ComponentRow({
  product,
  component,
  bugzillaWebUrl,
  canManage,
  canAdd,
  isOnlyComponent,
}: {
  product: Product;
  component: ProductComponent;
  bugzillaWebUrl: string;
  canManage: boolean;
  canAdd: boolean;
  isOnlyComponent: boolean;
}) {
  const subs = component.subcomponents ?? [];
  const create = useCreateSubcomponent(product.id);
  const update = useUpdateSubcomponent(product.id);
  const remove = useDeleteSubcomponent(product.id);
  const deleteComponent = useDeleteComponent(product.id);
  const updateComponent = useUpdateComponent(product.id);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(component.name);
  const [editDescription, setEditDescription] = useState(component.description ?? '');
  const [editAssignee, setEditAssignee] = useState(component.defaultAssignee);
  const [editActive, setEditActive] = useState(component.isActive ?? true);
  const [editError, setEditError] = useState<string | null>(null);

  function startEdit() {
    setEditName(component.name);
    setEditDescription(component.description ?? '');
    setEditAssignee(component.defaultAssignee);
    setEditActive(component.isActive ?? true);
    setEditError(null);
    setConfirmingDelete(false);
    setEditing(true);
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    setEditError(null);
    const name = editName.trim();
    const description = editDescription.trim();
    if (!name) return setEditError('Component name is required.');
    if (!description) return setEditError('Description is required.');
    if (!editAssignee) return setEditError('Choose a default assignee.');
    if (!component.id) return setEditError('Reload the page and try again.');
    const input: { name?: string; description?: string; defaultAssignee?: string; isActive?: boolean } = {};
    if (name !== component.name) input.name = name;
    if (description !== (component.description ?? '')) input.description = description;
    if (editAssignee.toLowerCase() !== component.defaultAssignee.toLowerCase()) input.defaultAssignee = editAssignee;
    if (editActive !== (component.isActive ?? true)) input.isActive = editActive;
    if (Object.keys(input).length === 0) return setEditing(false);
    try {
      await updateComponent.mutateAsync({ componentId: component.id, ...input });
      toast({
        variant: 'success',
        title: input.name ? `Renamed to ${name}` : `${component.name} updated`,
        description: input.defaultAssignee ? 'New bugs go to the new default assignee; existing bugs keep theirs.' : undefined,
      });
      setEditing(false);
    } catch (err) {
      setEditError(message(err));
    }
  }
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const componentBugs = component.bugCount ?? 0;
  // Why delete is unavailable, if it is - shown as the button's tooltip.
  const deleteBlocked = isOnlyComponent
    ? `${component.name} is the only component of ${product.name}. Add another one first.`
    : componentBugs > 0
      ? `${component.name} has ${componentBugs.toLocaleString()} bug${componentBugs === 1 ? '' : 's'}. Move them to another component first.`
      : null;

  async function onDeleteComponent(e: FormEvent) {
    e.preventDefault();
    setDeleteError(null);
    if (!component.id) return setDeleteError('Reload the page and try again.');
    try {
      await deleteComponent.mutateAsync({ componentId: component.id, confirmName: confirmName.trim() });
      toast({ variant: 'success', title: `${component.name} deleted`, description: `Removed from ${product.name}.` });
    } catch (err) {
      setDeleteError(message(err));
    }
  }
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const message = (err: unknown) => (err instanceof ApiError ? err.message : 'Please try again.');

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setAddError(null);
    const name = newName.trim();
    if (!name) return setAddError('Enter a sub-component name.');
    if (!component.id) return setAddError('Reload the page and try again.');
    try {
      await create.mutateAsync({ componentId: component.id, name });
      toast({ variant: 'success', title: 'Sub-component added', description: `${name} added to ${component.name}` });
      setNewName('');
    } catch (err) {
      setAddError(message(err));
    }
  }

  async function onRename(sub: Subcomponent) {
    const name = renameValue.trim();
    if (!name || name === sub.name) return setRenamingId(null);
    try {
      await update.mutateAsync({ id: sub.id, name });
      toast({ variant: 'success', title: `Renamed to ${name}`, description: sub.bugCount ? `${sub.bugCount} bug${sub.bugCount === 1 ? '' : 's'} updated too.` : undefined });
      setRenamingId(null);
    } catch (err) {
      toast({ variant: 'error', title: 'Rename failed', description: message(err) });
    }
  }

  async function onToggleActive(sub: Subcomponent) {
    try {
      await update.mutateAsync({ id: sub.id, isActive: !sub.isActive });
      toast({ variant: 'success', title: sub.isActive ? `${sub.name} deactivated` : `${sub.name} activated` });
    } catch (err) {
      toast({ variant: 'error', title: 'Update failed', description: message(err) });
    }
  }

  async function onDelete(sub: Subcomponent) {
    if (!window.confirm(`Delete the sub-component "${sub.name}" from ${component.name}?`)) return;
    try {
      await remove.mutateAsync(sub.id);
      toast({ variant: 'success', title: `${sub.name} deleted` });
    } catch (err) {
      toast({ variant: 'error', title: 'Delete failed', description: message(err) });
    }
  }

  return (
    <li className="text-sm">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="focus-ring flex min-w-0 flex-1 items-center gap-2 rounded text-left"
          title={open ? 'Hide sub-components' : 'Show sub-components'}
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
          )}
          <span className={`truncate font-medium ${component.isActive === false ? 'text-slate-400' : 'text-slate-800'}`}>{component.name}</span>
          {component.isActive === false && <Pill tone="slate">Inactive</Pill>}
          {subs.length > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-2xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-600/15">
              <Layers className="h-3 w-3" aria-hidden />
              {subs.length}
            </span>
          )}
        </button>
        <span className="truncate text-xs text-slate-600">{component.defaultAssignee}</span>
        {/* Edit: whoever may add components - admins and testers. */}
        {canAdd && (
          <button
            type="button"
            onClick={() => (editing ? setEditing(false) : startEdit())}
            className="focus-ring flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs text-slate-600 hover:bg-white/60 hover:text-brand-700"
            title={`Edit ${component.name}`}
            aria-expanded={editing}
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
        )}
        {canManage && (
          <a
            href={`${bugzillaWebUrl}/editcomponents.cgi?product=${encodeURIComponent(product.name)}&action=edit&component=${encodeURIComponent(component.name)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring shrink-0 rounded p-1 text-slate-400 hover:bg-white/60 hover:text-brand-700"
            title="Open in Bugzilla - for settings not shown here (default CC list, QA contact)"
            aria-label={`Open ${component.name} in Bugzilla`}
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {/* Delete: whoever may add components - admins and testers. */}
        {canAdd && (
          <button
            type="button"
            onClick={() => {
              setConfirmingDelete((v) => !v);
              setEditing(false);
              setConfirmName('');
              setDeleteError(null);
            }}
            disabled={deleteBlocked !== null}
            className="focus-ring shrink-0 rounded p-1 text-rose-500 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-35"
            title={deleteBlocked ?? `Delete ${component.name}`}
            aria-label={`Delete component ${component.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {canAdd && editing && (
        <form onSubmit={onSaveEdit} className="mx-4 mb-2 flex flex-col gap-3 rounded-lg border border-brand-200 bg-brand-50/40 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Name"
              required
              value={editName}
              maxLength={64}
              onChange={(e) => setEditName(e.target.value)}
              hint={editName.trim() !== component.name ? 'Its bugs and sub-components move with it.' : undefined}
            />
            <DeveloperSelect product={product.name} value={editAssignee} onChange={setEditAssignee} />
          </div>
          <Input label="Description" required value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} className="h-3.5 w-3.5 rounded border-line accent-brand-600" />
            Active - offered when filing new bugs
            {!editActive && <span className="text-slate-500">(existing bugs keep it)</span>}
          </label>
          {editError && <p role="alert" className="text-xs font-medium text-rose-600">{editError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={updateComponent.isPending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={updateComponent.isPending}>
              Save changes
            </Button>
          </div>
        </form>
      )}

      {canAdd && confirmingDelete && deleteBlocked === null && (
        <form onSubmit={onDeleteComponent} className="mx-4 mb-2 flex flex-col gap-2 rounded-lg border border-rose-200 bg-rose-50/60 p-3">
          <p className="text-xs text-rose-800">
            Delete <strong>{component.name}</strong> from {product.name}? It has no bugs.
            {(component.subcomponents?.length ?? 0) > 0 && <> Its {component.subcomponents!.length} sub-component{component.subcomponents!.length === 1 ? '' : 's'} will be deleted too.</>}{' '}
            This cannot be undone.
          </p>
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={`Type "${component.name}" to confirm`}
              aria-label={`Type ${component.name} to confirm`}
              className="h-8 flex-1 rounded-md border border-rose-200 bg-white px-2.5 text-xs outline-none placeholder:text-slate-400 focus:border-rose-400 focus:ring-2 focus:ring-rose-500/15"
            />
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              variant="danger"
              loading={deleteComponent.isPending}
              disabled={confirmName.trim() !== component.name}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </div>
          {deleteError && <p role="alert" className="text-xs text-rose-700">{deleteError}</p>}
        </form>
      )}

      {open && (
        <div className="mb-2 ml-9 mr-4 rounded-lg border border-hairline bg-slate-50/70">
          <div className="border-b border-hairline px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-slate-500">
            Sub-components of {component.name}
          </div>
          {subs.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-500">No sub-components yet.</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {subs.map((sub) => (
                <li key={sub.id} className="flex items-center gap-2 px-3 py-1.5">
                  {renamingId === sub.id ? (
                    <form
                      className="flex flex-1 items-center gap-1.5"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void onRename(sub);
                      }}
                    >
                      <input
                        autoFocus
                        value={renameValue}
                        maxLength={48}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Escape' && setRenamingId(null)}
                        aria-label={`New name for ${sub.name}`}
                        className="h-7 flex-1 rounded-md border border-line bg-white px-2 text-xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
                      />
                      <button type="submit" className="focus-ring rounded p-1 text-emerald-600 hover:bg-emerald-50" aria-label="Save name" disabled={update.isPending}>
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => setRenamingId(null)} className="focus-ring rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Cancel rename">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  ) : (
                    <>
                      <span className={`min-w-0 flex-1 truncate text-xs font-medium ${sub.isActive ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{sub.name}</span>
                      {!sub.isActive && <Pill tone="slate">Inactive</Pill>}
                      <span className="shrink-0 text-2xs text-slate-500">
                        {(sub.bugCount ?? 0).toLocaleString()} bug{sub.bugCount === 1 ? '' : 's'}
                      </span>
                      {canManage && (
                        <span className="flex shrink-0 items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingId(sub.id);
                              setRenameValue(sub.name);
                            }}
                            className="focus-ring rounded p-1 text-slate-500 hover:bg-white hover:text-brand-700"
                            title="Rename"
                            aria-label={`Rename ${sub.name}`}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void onToggleActive(sub)}
                            className="focus-ring rounded px-1.5 py-0.5 text-2xs font-medium text-slate-600 hover:bg-white hover:text-brand-700"
                            disabled={update.isPending}
                          >
                            {sub.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void onDelete(sub)}
                            disabled={(sub.bugCount ?? 0) > 0 || remove.isPending}
                            className="focus-ring rounded p-1 text-rose-500 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-35"
                            title={(sub.bugCount ?? 0) > 0 ? 'In use by bugs - deactivate it instead' : 'Delete'}
                            aria-label={`Delete ${sub.name}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </span>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canAdd && (
            <form onSubmit={onAdd} className="flex flex-col gap-1 border-t border-hairline px-3 py-2">
              <div className="flex items-center gap-2">
                <input
                  value={newName}
                  maxLength={48}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={`New sub-component of ${component.name}`}
                  aria-label={`New sub-component of ${component.name}`}
                  className="h-8 flex-1 rounded-md border border-line bg-white px-2.5 text-xs outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
                />
                <Button type="submit" size="sm" loading={create.isPending}>
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </div>
              {addError && <p role="alert" className="text-xs text-rose-600">{addError}</p>}
            </form>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Default assignee for a new component: a dropdown of the developers who can
 * reach this product.
 *
 * Same source as the bug Assignee picker (the product's access group, strict
 * testers already removed, each tagged with a role), narrowed to `developer` -
 * a component's owner receives every new bug filed against it, and that is
 * work for whoever changes the code. Only mounted while the add-component form
 * is open, so a page of collapsed products does not fetch one list each.
 */
export function DeveloperSelect({ product, value, onChange }: { product?: string; value: string; onChange: (email: string) => void }) {
  const { data, isLoading, isError } = useAssignableUsers(product);
  const developers = useMemo(
    () =>
      (data?.users ?? [])
        .filter((u) => u.role === 'developer' || u.role === undefined)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [data]
  );

  return (
    <Select
      label="Default assignee"
      required
      value={value}
      disabled={isLoading}
      onChange={(e) => onChange(e.target.value)}
      hint={
        isLoading
          ? 'Loading developers…'
          : isError
            ? 'Could not load the developers.'
            : !product
              ? 'Any developer. They are given access to the new product automatically.'
              : developers.length === 0
                ? 'No developer has access to this product yet - give one access first.'
                : `${developers.length} developer${developers.length === 1 ? '' : 's'} with access to ${product}`
      }
    >
      <option value="">Select a developer</option>
      {/* The current owner stays selectable even if they are not (or no longer) a developer here. */}
      {value && !developers.some((d) => d.email.toLowerCase() === value.toLowerCase()) && <option value={value}>{value} (current)</option>}
      {developers.map((d) => (
        <option key={d.email} value={d.email}>
          {d.name} ({d.email})
        </option>
      ))}
    </Select>
  );
}
