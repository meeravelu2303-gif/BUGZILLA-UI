import { AlertCircle, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { useAdminProducts, useCreateProduct, useMeta } from '../../api/hooks';
import { ProductAdminCard } from '../../components/admin/ProductAdminCard';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Field';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../context/ToastContext';

export function Products() {
  const { data, isLoading, isError, error } = useAdminProducts();
  const { data: meta } = useMeta();
  const createProduct = useCreateProduct();
  const { toast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!name.trim() || !description.trim() || !version.trim()) {
      setFormError('All fields are required');
      return;
    }
    try {
      const result = await createProduct.mutateAsync({ name: name.trim(), description: description.trim(), version: version.trim() });
      toast({ variant: 'success', title: 'Product created', description: result.product.name });
      setName('');
      setDescription('');
      setVersion('');
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not create the product.');
    }
  }

  return (
    <div className="mx-auto max-w-[900px] px-8 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Products</h1>
          <p className="mt-1 text-sm text-slate-600">Create products and components, and activate or deactivate products.</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-4 w-4" />
          New product
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>New product</CardTitle>
          </CardHeader>
          <form onSubmit={onCreate}>
            <CardBody className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Product name" />
                <Input label="Initial version" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="e.g. 1.0" />
              </div>
              <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
              {formError && <p className="text-xs text-rose-600">{formError}</p>}
              <div className="flex justify-end gap-2 border-t border-white/30 pt-4">
                <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={createProduct.isPending}>
                  Create product
                </Button>
              </div>
            </CardBody>
          </form>
        </Card>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      ) : isError ? (
        <EmptyState
          icon={AlertCircle}
          title="Couldn't load products"
          description={error instanceof ApiError ? error.message : 'Something went wrong. Please try again.'}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {data?.products.map((p) => (
            <ProductAdminCard key={p.id} product={p} bugzillaWebUrl={meta?.bugzillaWebUrl ?? ''} />
          ))}
        </div>
      )}
    </div>
  );
}
