import { ExternalLink, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { useCreateComponent, useUpdateProduct } from '../../api/hooks';
import { useToast } from '../../context/ToastContext';
import type { Product } from '../../types';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../ui/Card';
import { Input } from '../ui/Field';
import { Pill } from '../ui/Pill';

export function ProductAdminCard({ product, bugzillaWebUrl }: { product: Product; bugzillaWebUrl: string }) {
  const updateProduct = useUpdateProduct(product.id);
  const createComponent = useCreateComponent(product.id);
  const { toast } = useToast();

  const [showAddComponent, setShowAddComponent] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [defaultAssignee, setDefaultAssignee] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

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
        <div className="flex items-center gap-2">
          <CardTitle>{product.name}</CardTitle>
          <Pill tone={product.isActive ? 'emerald' : 'slate'}>{product.isActive ? 'Active' : 'Inactive'}</Pill>
        </div>
        <Button size="sm" variant="secondary" onClick={onToggleActive} loading={updateProduct.isPending}>
          {product.isActive ? 'Deactivate' : 'Activate'}
        </Button>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
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
    </Card>
  );
}
