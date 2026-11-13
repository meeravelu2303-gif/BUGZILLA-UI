import {
  Boxes,
  Bug as BugIcon,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Layers,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
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

/** One product on the admin page. */
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
  canManage?: boolean;
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

  async function onSaveEdit(event: FormEvent) {
    event.preventDefault();
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
      for (const warning of res.warnings ?? []) toast({ variant: 'info', title: 'Check this', description: warning });
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
      toast({
        variant: 'error',
        title: 'Update failed',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  }

  async function onAddComponent(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!name.trim() || !description.trim() || !defaultAssignee.trim()) {
      setFormError('All fields are required');
      return;
    }
    try {
      await createComponent.mutateAsync({
        name: name.trim(),
        description: description.trim(),
        defaultAssignee: defaultAssignee.trim(),
      });
      toast({ variant: 'success', title: 'Component created', description: `${name} added to ${product.name}` });
      setName('');
      setDescription('');
      setDefaultAssignee('');
      setShowAddComponent(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not create the component.');
    }
  }

  const bugCount = product.bugCount ?? 0;
  const componentCount = product.components.length;
  const subcomponentCount = product.components.reduce(
    (total, component) => total + (component.subcomponents?.length ?? 0),
    0,
  );

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
          <span className="block truncate text-sm font-semibold text-slate-900 group-hover:text-brand-800">
            {product.name}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <BugIcon className="h-3 w-3" aria-hidden />
              {bugCount.toLocaleString()} bug{bugCount === 1 ? '' : 's'}
            </span>
            <span>
              {componentCount} component{componentCount === 1 ? '' : 's'}
            </span>
            {subcomponentCount > 0 && (
              <span>
                {subcomponentCount} sub-component{subcomponentCount === 1 ? '' : 's'}
              </span>
            )}
          </span>
        </span>
        <Pill tone={product.isActive ? 'emerald' : 'slate'}>{product.isActive ? 'Active' : 'Inactive'}</Pill>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600"
          aria-hidden
        />
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
            <Button
              size="sm"
              variant="secondary"
              onClick={onToggleActive}
              loading={updateProduct.isPending && !editing}
            >
              {product.isActive ? 'Deactivate' : 'Activate'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDeleting(true)}
              className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              title={
                (product.bugCount ?? 0) > 0
                  ? 'Has bugs - Bugzilla only deletes an empty product'
                  : 'Delete this product'
              }
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        )}
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        {canManage && editing ? (
          <form
            onSubmit={onSaveEdit}
            className="flex flex-col gap-3 rounded-xl border border-brand-200 bg-brand-50/40 p-4"
          >
            <Input
              label="Name"
              required
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              maxLength={64}
            />
            <Input
              label="Description"
              required
              value={editDescription}
              onChange={(event) => setEditDescription(event.target.value)}
              hint={
                editName.trim() !== product.name
                  ? "Renaming also renames the product's access group, so team access keeps working."
                  : undefined
              }
            />
            {editError && (
              <p role="alert" className="text-xs font-medium text-rose-600">
                {editError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
                disabled={updateProduct.isPending}
              >
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
                onClick={() => setShowAddComponent((currentShowAddComponent) => !currentShowAddComponent)}
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
              {product.components.map((component) => (
                <ComponentRow
                  key={component.name}
                  product={product}
                  component={component}
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
                <Input
                  label="Name"
                  required
                  value={name}
                  maxLength={64}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Component name"
                />
                <DeveloperSelect product={product.name} value={defaultAssignee} onChange={setDefaultAssignee} />
              </div>
              <Input
                label="Description"
                required
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
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
  const subcomponents = component.subcomponents ?? [];
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

  async function onSaveEdit(event: FormEvent) {
    event.preventDefault();
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
        description: input.defaultAssignee
          ? 'New bugs go to the new default assignee; existing bugs keep theirs.'
          : undefined,
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
  const deleteBlocked = isOnlyComponent
    ? `${component.name} is the only component of ${product.name}. Add another one first.`
    : componentBugs > 0
      ? `${component.name} has ${componentBugs.toLocaleString()} bug${componentBugs === 1 ? '' : 's'}. Move them to another component first.`
      : null;

  async function onDeleteComponent(event: FormEvent) {
    event.preventDefault();
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

  async function onAdd(event: FormEvent) {
    event.preventDefault();
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

  async function onRename(subcomponent: Subcomponent) {
    const name = renameValue.trim();
    if (!name || name === subcomponent.name) return setRenamingId(null);
    try {
      await update.mutateAsync({ id: subcomponent.id, name });
      toast({
        variant: 'success',
        title: `Renamed to ${name}`,
        description: subcomponent.bugCount
          ? `${subcomponent.bugCount} bug${subcomponent.bugCount === 1 ? '' : 's'} updated too.`
          : undefined,
      });
      setRenamingId(null);
    } catch (err) {
      toast({ variant: 'error', title: 'Rename failed', description: message(err) });
    }
  }

  async function onToggleActive(subcomponent: Subcomponent) {
    try {
      await update.mutateAsync({ id: subcomponent.id, isActive: !subcomponent.isActive });
      toast({
        variant: 'success',
        title: subcomponent.isActive ? `${subcomponent.name} deactivated` : `${subcomponent.name} activated`,
      });
    } catch (err) {
      toast({ variant: 'error', title: 'Update failed', description: message(err) });
    }
  }

  async function onDelete(subcomponent: Subcomponent) {
    if (!window.confirm(`Delete the sub-component "${subcomponent.name}" from ${component.name}?`)) return;
    try {
      await remove.mutateAsync(subcomponent.id);
      toast({ variant: 'success', title: `${subcomponent.name} deleted` });
    } catch (err) {
      toast({ variant: 'error', title: 'Delete failed', description: message(err) });
    }
  }

  return (
    <li className="text-sm">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((currentOpen) => !currentOpen)}
          aria-expanded={open}
          className="focus-ring flex min-w-0 flex-1 items-center gap-2 rounded text-left"
          title={open ? 'Hide sub-components' : 'Show sub-components'}
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
          )}
          <span
            className={`truncate font-medium ${component.isActive === false ? 'text-slate-400' : 'text-slate-800'}`}
          >
            {component.name}
          </span>
          {component.isActive === false && <Pill tone="slate">Inactive</Pill>}
          {subcomponents.length > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-2xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-600/15">
              <Layers className="h-3 w-3" aria-hidden />
              {subcomponents.length}
            </span>
          )}
        </button>
        <span className="truncate text-xs text-slate-600">{component.defaultAssignee}</span>
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
        {canAdd && (
          <button
            type="button"
            onClick={() => {
              setConfirmingDelete((currentConfirmingDelete) => !currentConfirmingDelete);
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
        <form
          onSubmit={onSaveEdit}
          className="mx-4 mb-2 flex flex-col gap-3 rounded-lg border border-brand-200 bg-brand-50/40 p-3"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Name"
              required
              value={editName}
              maxLength={64}
              onChange={(event) => setEditName(event.target.value)}
              hint={editName.trim() !== component.name ? 'Its bugs and sub-components move with it.' : undefined}
            />
            <DeveloperSelect product={product.name} value={editAssignee} onChange={setEditAssignee} />
          </div>
          <Input
            label="Description"
            required
            value={editDescription}
            onChange={(event) => setEditDescription(event.target.value)}
          />
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={editActive}
              onChange={(event) => setEditActive(event.target.checked)}
              className="h-3.5 w-3.5 rounded border-line accent-brand-600"
            />
            Active - offered when filing new bugs
            {!editActive && <span className="text-slate-500">(existing bugs keep it)</span>}
          </label>
          {editError && (
            <p role="alert" className="text-xs font-medium text-rose-600">
              {editError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditing(false)}
              disabled={updateComponent.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={updateComponent.isPending}>
              Save changes
            </Button>
          </div>
        </form>
      )}

      {canAdd && confirmingDelete && deleteBlocked === null && (
        <form
          onSubmit={onDeleteComponent}
          className="mx-4 mb-2 flex flex-col gap-2 rounded-lg border border-rose-200 bg-rose-50/60 p-3"
        >
          <p className="text-xs text-rose-800">
            Delete <strong>{component.name}</strong> from {product.name}? It has no bugs.
            {(component.subcomponents?.length ?? 0) > 0 && (
              <>
                {' '}
                Its {component.subcomponents!.length} sub-component{component.subcomponents!.length === 1 ? '' : 's'}{' '}
                will be deleted too.
              </>
            )}{' '}
            This cannot be undone.
          </p>
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={confirmName}
              onChange={(event) => setConfirmName(event.target.value)}
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
          {deleteError && (
            <p role="alert" className="text-xs text-rose-700">
              {deleteError}
            </p>
          )}
        </form>
      )}

      {open && (
        <div className="mb-2 ml-9 mr-4 rounded-lg border border-hairline bg-slate-50/70">
          <div className="border-b border-hairline px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-slate-500">
            Sub-components of {component.name}
          </div>
          {subcomponents.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-500">No sub-components yet.</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {subcomponents.map((subcomponent) => (
                <li key={subcomponent.id} className="flex items-center gap-2 px-3 py-1.5">
                  {renamingId === subcomponent.id ? (
                    <form
                      className="flex flex-1 items-center gap-1.5"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void onRename(subcomponent);
                      }}
                    >
                      <input
                        autoFocus
                        value={renameValue}
                        maxLength={48}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onKeyDown={(event) => event.key === 'Escape' && setRenamingId(null)}
                        aria-label={`New name for ${subcomponent.name}`}
                        className="h-7 flex-1 rounded-md border border-line bg-white px-2 text-xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
                      />
                      <button
                        type="submit"
                        className="focus-ring rounded p-1 text-emerald-600 hover:bg-emerald-50"
                        aria-label="Save name"
                        disabled={update.isPending}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenamingId(null)}
                        className="focus-ring rounded p-1 text-slate-500 hover:bg-slate-100"
                        aria-label="Cancel rename"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  ) : (
                    <>
                      <span
                        className={`min-w-0 flex-1 truncate text-xs font-medium ${subcomponent.isActive ? 'text-slate-800' : 'text-slate-400 line-through'}`}
                      >
                        {subcomponent.name}
                      </span>
                      {!subcomponent.isActive && <Pill tone="slate">Inactive</Pill>}
                      <span className="shrink-0 text-2xs text-slate-500">
                        {(subcomponent.bugCount ?? 0).toLocaleString()} bug{subcomponent.bugCount === 1 ? '' : 's'}
                      </span>
                      {canManage && (
                        <span className="flex shrink-0 items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingId(subcomponent.id);
                              setRenameValue(subcomponent.name);
                            }}
                            className="focus-ring rounded p-1 text-slate-500 hover:bg-white hover:text-brand-700"
                            title="Rename"
                            aria-label={`Rename ${subcomponent.name}`}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void onToggleActive(subcomponent)}
                            className="focus-ring rounded px-1.5 py-0.5 text-2xs font-medium text-slate-600 hover:bg-white hover:text-brand-700"
                            disabled={update.isPending}
                          >
                            {subcomponent.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void onDelete(subcomponent)}
                            disabled={(subcomponent.bugCount ?? 0) > 0 || remove.isPending}
                            className="focus-ring rounded p-1 text-rose-500 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-35"
                            title={
                              (subcomponent.bugCount ?? 0) > 0 ? 'In use by bugs - deactivate it instead' : 'Delete'
                            }
                            aria-label={`Delete ${subcomponent.name}`}
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
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder={`New sub-component of ${component.name}`}
                  aria-label={`New sub-component of ${component.name}`}
                  className="h-8 flex-1 rounded-md border border-line bg-white px-2.5 text-xs outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
                />
                <Button type="submit" size="sm" loading={create.isPending}>
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </div>
              {addError && (
                <p role="alert" className="text-xs text-rose-600">
                  {addError}
                </p>
              )}
            </form>
          )}
        </div>
      )}
    </li>
  );
}

/** Default assignee for a new component: a dropdown of the developers who can reach this product. */
export function DeveloperSelect({
  product,
  value,
  onChange,
}: {
  product?: string;
  value: string;
  onChange: (email: string) => void;
}) {
  const { data, isLoading, isError } = useAssignableUsers(product);
  const developers = useMemo(
    () =>
      (data?.users ?? [])
        .filter((user) => user.role === 'developer' || user.role === undefined)
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name)),
    [data],
  );

  return (
    <Select
      label="Default assignee"
      required
      value={value}
      disabled={isLoading}
      onChange={(event) => onChange(event.target.value)}
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
      {value && !developers.some((developer) => developer.email.toLowerCase() === value.toLowerCase()) && (
        <option value={value}>{value} (current)</option>
      )}
      {developers.map((developer) => (
        <option key={developer.email} value={developer.email}>
          {developer.name} ({developer.email})
        </option>
      ))}
    </Select>
  );
}
