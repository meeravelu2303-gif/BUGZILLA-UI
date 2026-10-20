import { Boxes, Bug as BugIcon, ChevronDown, ChevronRight, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { useAssignableUsers, useCreateComponent, useUpdateProduct } from '../../api/hooks';
import { useToast } from '../../context/ToastContext';
import type { Product } from '../../types';
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
                <li key={c.name} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{c.name}</span>
                  <span className="truncate text-xs text-slate-600">{c.defaultAssignee}</span>
                  {canManage && (
                  <a
                    href={`${bugzillaWebUrl}/editcomponents.cgi?product=${encodeURIComponent(product.name)}&action=edit&component=${encodeURIComponent(c.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="focus-ring flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs text-slate-600 hover:bg-white/60 hover:text-brand-700"
                    title="Edit in Bugzilla (component editing isn't available via REST)"
                  >
                    Edit <ExternalLink className="h-3 w-3" />
                  </a>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canAddComponent && showAddComponent && (
            <form onSubmit={onAddComponent} className="flex flex-col gap-3 border-t border-white/30 px-4 py-3">
              <div className="grid grid-cols-2 gap-3">
                <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Component name" />
                <DeveloperSelect product={product.name} value={defaultAssignee} onChange={setDefaultAssignee} />
              </div>
              <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
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
 * Default assignee for a new component: a dropdown of the developers who can
 * reach this product.
 *
 * Same source as the bug Assignee picker (the product's access group, strict
 * testers already removed, each tagged with a role), narrowed to `developer` -
 * a component's owner receives every new bug filed against it, and that is
 * work for whoever changes the code. Only mounted while the add-component form
 * is open, so a page of collapsed products does not fetch one list each.
 */
function DeveloperSelect({ product, value, onChange }: { product: string; value: string; onChange: (email: string) => void }) {
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
            ? 'Could not load the developers for this product.'
            : developers.length === 0
              ? 'No developer has access to this product yet - give one access first.'
              : `${developers.length} developer${developers.length === 1 ? '' : 's'} with access to ${product}`
      }
    >
      <option value="">Select a developer</option>
      {developers.map((d) => (
        <option key={d.email} value={d.email}>
          {d.name} ({d.email})
        </option>
      ))}
    </Select>
  );
}
