import { Loader2 } from 'lucide-react';
import { assigneeLabel } from '../../lib/roles';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAssignableUsers, useCreateBug } from '../../api/hooks';
import { useToast } from '../../context/ToastContext';
import { Button } from '../ui/Button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/primitives/dialog';
import type { Product } from '../../types';

/**
 * File a bug in four fields.
 *
 * Deliberately NOT a replacement for the full CreateBug page - it is the
 * fast path for "I just saw this, capture it before I lose it". Anything the
 * page offers and this does not (version, platform, attachments, the
 * classification picker) is still reachable through "Full filing form", and
 * through the bug once it exists.
 *
 * It posts to the SAME `useCreateBug` mutation the page uses, so the BFF
 * contract and the cache invalidation are shared rather than reimplemented.
 */
export function QuickFileDialog({
  open,
  onClose,
  products,
  productNames,
  severities,
}: {
  open: boolean;
  onClose: () => void;
  products: Product[];
  productNames: string[];
  severities: string[];
}) {
  const create = useCreateBug();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [product, setProduct] = useState('');
  const [component, setComponent] = useState('');
  const [summary, setSummary] = useState('');
  const [severity, setSeverity] = useState('');
  const [assignee, setAssignee] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Reset between openings, so a cancelled draft does not reappear half-filled.
  useEffect(() => {
    if (!open) return;
    setProduct(productNames[0] ?? '');
    setComponent('');
    setSummary('');
    setSeverity('');
    setAssignee('');
    setDescription('');
    setError(null);
  }, [open, productNames]);

  /*
   * Components belong to a product, so the list is derived from the selection
   * rather than being a flat list of every component on the instance - which
   * would let you file against a component the product does not have, and have
   * Bugzilla reject it after the fact.
   */
  const components = useMemo(
    () => products.find((p) => p.name === product)?.components ?? [],
    [products, product]
  );

  // Clear a component that the newly chosen product does not offer.
  useEffect(() => {
    if (component && !components.some((c) => c.name === component)) setComponent('');
  }, [components, component]);

  /*
   * Who this product's bugs may be handed to. Read from the BFF, which derives
   * it from the product's own Bugzilla group rather than from an email pattern,
   * so it stays correct for anyone on another domain.
   */
  const { data: assignable } = useAssignableUsers(product || undefined);

  /*
   * Split into the product's owners and everyone else. The BFF decides who
   * counts as an owner (component `initialowner`), so the two views cannot
   * disagree about it.
   */
  const ownerSet = useMemo(
    () => new Set((assignable?.owners ?? []).map((e) => e.toLowerCase())),
    [assignable]
  );
  const ownerUsers = (assignable?.users ?? []).filter((u) => ownerSet.has(u.email.toLowerCase()));
  const otherUsers = (assignable?.users ?? []).filter((u) => !ownerSet.has(u.email.toLowerCase()));

  const canSubmit = product !== '' && component !== '' && summary.trim() !== '' && !create.isPending;

  const submit = () => {
    setError(null);
    if (!canSubmit) {
      setError('Pick a product and component, and write a summary.');
      return;
    }
    create.mutate(
      {
        product,
        component,
        summary: summary.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(severity ? { severity } : {}),
        /*
         * Omitted when left on "Component default", which is the normal path:
         * Bugzilla then applies the component's own default owner - the same
         * routing the automated test bench relies on.
         */
        ...(assignee ? { assignedTo: assignee } : {}),
      },
      {
        onSuccess: (res) => {
          toast({ title: `Filed as #${res.bug.id}.`, variant: 'success' });
          onClose();
          // Straight to the new bug: the next thing you do is almost always
          // attach evidence or add detail to what you just captured.
          navigate(`/bugs/${res.bug.id}`);
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'Bugzilla refused that bug.'),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Quick file a bug</DialogTitle>
          <DialogDescription>Capture it now - the rest can be filled in on the bug itself.</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-700">Product</span>
              <select
                className="app-select focus-ring w-full appearance-none rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-slate-900"
                value={product}
                onChange={(e) => setProduct(e.target.value)}
              >
                {productNames.length === 0 && <option value="">No products available</option>}
                {productNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-700">Component</span>
              <select
                className="app-select focus-ring w-full appearance-none rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
                value={component}
                onChange={(e) => setComponent(e.target.value)}
                disabled={components.length === 0}
              >
                <option value="">{components.length === 0 ? 'Pick a product first' : 'Choose…'}</option>
                {components.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Summary</span>
            <input
              autoFocus
              className="focus-ring w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
              placeholder="What went wrong, in one line"
              value={summary}
              maxLength={255}
              onChange={(e) => setSummary(e.target.value)}
              onKeyDown={(e) => {
                // Enter submits from the summary field, which is where the
                // hands already are after typing it.
                if (e.key === 'Enter' && canSubmit) submit();
              }}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            {severities.length > 0 && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-700">Severity</span>
                <select
                  className="app-select focus-ring w-full appearance-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-slate-900"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                >
                  <option value="">Use the product default</option>
                  {severities.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {/*
              Assigning at filing time is the whole point of this control: it is
              what turns a bug from "in a component queue" into "someone's
              work", and it is the number the dashboard's "Picked up" tile
              tracks. Left on the default, Bugzilla routes it to the component
              owner exactly as it does for the automated bench.
            */}
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-700">Assign to</span>
              <select
                className="app-select focus-ring w-full appearance-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                disabled={!product}
              >
                <option value="">Component default owner</option>
                {/*
                  Owners of the selected product first, in their own group.
                  Everyone in engineering stays selectable below - a defect does
                  sometimes need to go to someone outside the usual owner, and a
                  picker that refused would just send people to Bugzilla.
                */}
                {ownerUsers.length > 0 && (
                  <optgroup label={`Owns ${product}`}>
                    {ownerUsers.map((u) => (
                      <option key={u.email} value={u.email}>
                        {assigneeLabel(u)}
                      </option>
                    ))}
                  </optgroup>
                )}
                {otherUsers.length > 0 && (
                  <optgroup label="Other engineers">
                    {otherUsers.map((u) => (
                      <option key={u.email} value={u.email}>
                        {assigneeLabel(u)}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">
              Description <span className="font-normal text-slate-400">(optional)</span>
            </span>
            <textarea
              rows={4}
              className="focus-ring w-full resize-y rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
              placeholder="Steps, expected, actual…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          {error && (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            File bug
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
