import { AlertCircle, Boxes, Plus, Search } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { useAdminProducts, useCreateProduct, useMe, useMeta } from '../../api/hooks';
import { ProductAdminCard } from '../../components/admin/ProductAdminCard';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input, Select } from '../../components/ui/Field';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../context/ToastContext';

export function Products() {
  const { data, isLoading, isError, error } = useAdminProducts();
  const { data: meta } = useMeta();
  /*
   * Testers reach this page read-only: they may add components, but creating,
   * editing, (de)activating and deleting products is the admin's (canManageProducts).
   * The BFF enforces the same split; this only hides what would be refused.
   */
  const { data: me } = useMe();
  const canManage = Boolean(me?.user.permissions.canManageProducts);
  const canAddComponent = Boolean(me?.user.permissions.canCreateComponents);
  const createProduct = useCreateProduct();
  const { toast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // One product open at a time keeps a 50-product page a list, not a wall.
  const [openId, setOpenId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');

  const all = data?.products ?? [];
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter((p) => (status === 'all' ? true : status === 'active' ? p.isActive : !p.isActive))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.components.some((c) => c.name.toLowerCase().includes(q)))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [all, query, status]);

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
    <div className="mx-auto max-w-[60rem] animate-page-in px-4 py-6 sm:px-6 lg:px-8 2xl:px-10">
      <PageHeader
        icon={Boxes}
        eyebrow="Administration"
        title="Products"
        description={
          canManage
            ? "Create, edit, activate, deactivate and delete products, and add their components."
            : "Browse products and their components, and add a component when a product needs one."
        }
        actions={
          canManage && (
            <Button onClick={() => setShowForm((v) => !v)}>
              <Plus className="h-4 w-4" aria-hidden />
              New product
            </Button>
          )
        }
      />

      {canManage && showForm && (
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
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="relative min-w-[14rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products or components…"
                aria-label="Search products"
                className="focus-ring h-10 w-full rounded-xl border border-slate-900/10 bg-white/85 pl-9 pr-3 text-sm"
              />
            </div>
            <div className="w-40">
              <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                <option value="all">All products</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
            <span className="mb-2.5 text-xs text-slate-500">
              {visible.length} of {all.length} products
            </span>
          </div>

          {visible.length === 0 ? (
            <EmptyState icon={Boxes} title="No products match" description="Try another name, or clear the filter." />
          ) : (
            <div className="flex flex-col gap-2">
              {visible.map((p) => (
                <ProductAdminCard
                  key={p.id}
                  product={p}
                  bugzillaWebUrl={meta?.bugzillaWebUrl ?? ''}
                  canManage={canManage}
                  canAddComponent={canAddComponent}
                  expanded={openId === p.id}
                  onToggle={() => setOpenId((cur) => (cur === p.id ? null : p.id))}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
