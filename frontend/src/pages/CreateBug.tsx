import { Plus } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useCreateBug, useMeta, useProducts } from '../api/hooks';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { Input, Select, Textarea } from '../components/ui/Field';
import { useToast } from '../context/ToastContext';

export function CreateBug() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: productsData, isLoading: productsLoading } = useProducts();
  const { data: meta } = useMeta();
  const createBug = useCreateBug();

  const [product, setProduct] = useState('');
  const [component, setComponent] = useState('');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState('');
  const [opSys, setOpSys] = useState('All');
  const [platform, setPlatform] = useState('All');
  const [severity, setSeverity] = useState('normal');
  const [priority, setPriority] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const products = productsData?.products ?? [];
  const selectedProduct = useMemo(() => products.find((p) => p.name === product), [products, product]);

  function onSelectProduct(name: string) {
    setProduct(name);
    const p = products.find((x) => x.name === name);
    setComponent(p?.components[0]?.name ?? '');
    setVersion(p?.versions.includes('unspecified') ? 'unspecified' : p?.versions[0] ?? '');
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!product) next.product = 'Please select a product';
    if (!component) next.component = 'Please select a component';
    if (!summary.trim()) next.summary = 'Summary is required';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) return;

    try {
      const result = await createBug.mutateAsync({
        product,
        component,
        summary: summary.trim(),
        description: description.trim() || undefined,
        version: version || undefined,
        opSys: opSys || undefined,
        platform: platform || undefined,
        severity: severity || undefined,
        priority: priority || undefined,
      });
      toast({ variant: 'success', title: 'Bug created', description: `#${result.bug.id} — ${result.bug.summary}` });
      navigate(`/bugs/${result.bug.id}`);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not create the bug. Please try again.');
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">New bug</h1>
        <p className="mt-1 text-sm text-slate-600">File a new bug directly into Bugzilla.</p>
      </div>

      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Product"
                placeholder={productsLoading ? 'Loading…' : 'Select a product'}
                value={product}
                onChange={(e) => onSelectProduct(e.target.value)}
                error={errors.product}
                required
              >
                {products.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </Select>

              <Select
                label="Component"
                placeholder={product ? 'Select a component' : 'Select a product first'}
                value={component}
                onChange={(e) => setComponent(e.target.value)}
                error={errors.component}
                disabled={!selectedProduct}
                required
              >
                {selectedProduct?.components.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>

            <Input
              label="Summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              error={errors.summary}
              placeholder="Short, descriptive summary of the problem"
              maxLength={255}
              required
            />

            <Textarea
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={'Steps to reproduce:\n1. \n2. \n\nExpected result:\n\nActual result:'}
              rows={7}
            />

            <div className="grid grid-cols-2 gap-4">
              <Select label="Severity" value={severity} onChange={(e) => setSeverity(e.target.value)}>
                {(meta?.severities ?? ['blocker', 'critical', 'major', 'normal', 'minor', 'trivial', 'enhancement']).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>

              <Select label="Priority" placeholder="Default" value={priority} onChange={(e) => setPriority(e.target.value)}>
                {(meta?.priorities ?? []).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <Select
                label="Version"
                placeholder={selectedProduct ? 'Select version' : '—'}
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                disabled={!selectedProduct}
              >
                {selectedProduct?.versions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </Select>

              <Select label="OS" value={opSys} onChange={(e) => setOpSys(e.target.value)} hint="Defaults to All">
                {(meta?.opSystems ?? ['All', 'Windows', 'Mac OS', 'Linux', 'Other']).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>

              <Select label="Platform" value={platform} onChange={(e) => setPlatform(e.target.value)} hint="Defaults to All">
                {(meta?.platforms ?? ['All']).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </div>

            {submitError && (
              <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
                {submitError}
              </p>
            )}

            <div className="flex items-center justify-end gap-3 border-t border-white/30 pt-5">
              <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
                Cancel
              </Button>
              <Button type="submit" loading={createBug.isPending}>
                <Plus className="h-4 w-4" />
                Create bug
              </Button>
            </div>
          </CardBody>
        </Card>
      </form>
    </div>
  );
}
