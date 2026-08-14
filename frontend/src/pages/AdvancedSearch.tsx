import { RotateCcw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMeta, useProducts } from '../api/hooks';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { Input, Select } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { buildQuery } from '../api/client';

interface SearchForm {
  search: string;
  product: string;
  component: string;
  status: string;
  severity: string;
  priority: string;
  assignedTo: string;
  creator: string;
}

const EMPTY: SearchForm = {
  search: '',
  product: '',
  component: '',
  status: '',
  severity: '',
  priority: '',
  assignedTo: '',
  creator: '',
};

export function AdvancedSearch() {
  const navigate = useNavigate();
  const { data: meta } = useMeta();
  const { data: productsData } = useProducts();
  const [form, setForm] = useState<SearchForm>(EMPTY);

  const components = useMemo(() => {
    const product = productsData?.products.find((p) => p.name === form.product);
    return product?.components.map((c) => c.name) ?? [];
  }, [productsData, form.product]);

  function set<K extends keyof SearchForm>(key: K, value: string) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'product') next.component = '';
      return next;
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const params = buildQuery({ ...form });
    navigate(`/bugs${params}`);
  }

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-8 sm:px-8">
      <PageHeader
        title="Advanced Search"
        description="Combine any number of criteria to build a precise query, then open the results in the bug list."
        crumbs={[{ label: 'Bugs', to: '/bugs' }, { label: 'Advanced Search' }]}
      />

      <Card>
        <form onSubmit={onSubmit}>
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input
                label="Summary contains"
                value={form.search}
                onChange={(e) => set('search', e.target.value)}
                placeholder="e.g. login timeout"
              />
            </div>

            <Select label="Product" placeholder="Any product" value={form.product} onChange={(e) => set('product', e.target.value)}>
              {productsData?.products.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </Select>

            <Select
              label="Component"
              placeholder={form.product ? 'Any component' : 'Select a product first'}
              value={form.component}
              onChange={(e) => set('component', e.target.value)}
              disabled={!form.product}
            >
              {components.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>

            <Select label="Status" placeholder="Any status" value={form.status} onChange={(e) => set('status', e.target.value)}>
              {meta?.statuses.map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ')}
                </option>
              ))}
            </Select>

            <Select label="Severity" placeholder="Any severity" value={form.severity} onChange={(e) => set('severity', e.target.value)}>
              {meta?.severities.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>

            <Select label="Priority" placeholder="Any priority" value={form.priority} onChange={(e) => set('priority', e.target.value)}>
              {meta?.priorities.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>

            <div className="hidden sm:block" />

            <Input
              label="Assignee email"
              type="email"
              value={form.assignedTo}
              onChange={(e) => set('assignedTo', e.target.value)}
              placeholder="name@example.com"
            />

            <Input
              label="Reporter email"
              type="email"
              value={form.creator}
              onChange={(e) => set('creator', e.target.value)}
              placeholder="name@example.com"
            />
          </CardBody>

          <div className="flex items-center justify-end gap-2 border-t border-white/30 px-5 py-4">
            <Button type="button" variant="secondary" onClick={() => setForm(EMPTY)}>
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
            <Button type="submit">
              <Search className="h-4 w-4" /> Search
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
