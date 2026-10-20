import { Bug as BugIcon, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { useCreateComponent, useUpdateProduct } from '../../api/hooks';
import { useToast } from '../../context/ToastContext';
import type { Product } from '../../types';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../ui/Card';
import { Input } from '../ui/Field';
import { Pill } from '../ui/Pill';
import { DeleteProductDialog } from './DeleteProductDialog';

export function ProductAdminCard({ product, bugzillaWebUrl }: { product: Product; bugzillaWebUrl: string }) {
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

  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 items-center gap-2">
          <CardTitle className="truncate">{product.name}</CardTitle>
          <Pill tone={product.isActive ? 'emerald' : 'slate'}>{product.isActive ? 'Active' : 'Inactive'}</Pill>
        </div>
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
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        {editing ? (
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
            <button
              onClick={() => setShowAddComponent((v) => !v)}
              className="focus-ring flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-brand-700 hover:bg-white/60"
            >
              <Plus className="h-3 w-3" /> Add component
            </button>
          </div>

          {product.components.length === 0 && !showAddComponent ? (
            <p className="px-4 py-3 text-sm text-slate-600">No components yet.</p>
          ) : (
            <ul className="divide-y divide-white/30">
              {product.components.map((c) => (
                <li key={c.name} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{c.name}</span>
                  <span className="truncate text-xs text-slate-600">{c.defaultAssignee}</span>
                  <a
                    href={`${bugzillaWebUrl}/editcomponents.cgi?product=${encodeURIComponent(product.name)}&action=edit&component=${encodeURIComponent(c.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="focus-ring flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs text-slate-600 hover:bg-white/60 hover:text-brand-700"
                    title="Edit in Bugzilla (component editing isn't available via REST)"
                  >
                    Edit <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              ))}
            </ul>
          )}

          {showAddComponent && (
            <form onSubmit={onAddComponent} className="flex flex-col gap-3 border-t border-white/30 px-4 py-3">
              <div className="grid grid-cols-2 gap-3">
                <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Component name" />
                <Input
                  label="Default assignee"
                  type="email"
                  value={defaultAssignee}
                  onChange={(e) => setDefaultAssignee(e.target.value)}
                  placeholder="name@example.com"
                />
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
      <DeleteProductDialog open={deleting} product={product} onClose={() => setDeleting(false)} />
    </Card>
  );
}
