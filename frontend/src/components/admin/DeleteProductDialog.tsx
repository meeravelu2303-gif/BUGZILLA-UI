import { Archive, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { useDeleteProduct, useUpdateProduct } from '../../api/hooks';
import { useToast } from '../../context/ToastContext';
import type { Product } from '../../types';
import { Button } from '../ui/Button';

/**
 * Delete a product - or, when it still has bugs, the honest alternative.
 *
 * Bugzilla only deletes a product with no bugs (`allowbugdeletion` is off), so
 * for any product in use this dialog does not pretend: it says how many bugs
 * block it and offers Deactivate, which closes the product for new bugs while
 * keeping every existing one.
 *
 * An empty product needs its name typed out - the one admin action here that
 * cannot be undone.
 */
export function DeleteProductDialog({ open, product, onClose }: { open: boolean; product: Product; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const del = useDeleteProduct(product.id);
  const update = useUpdateProduct(product.id);
  const { toast } = useToast();

  const bugs = product.bugCount ?? 0;
  const deletable = bugs === 0;
  const matches = typed.trim() === product.name;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setTyped('');
      setError(null);
      dialog.showModal();
    } else if (!open && dialog.open) dialog.close();
  }, [open]);

  async function onDelete() {
    if (!matches) return;
    setError(null);
    try {
      await del.mutateAsync(typed.trim());
      toast({ variant: 'success', title: `${product.name} deleted`, description: 'Its components, versions and group controls were removed with it.' });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete the product.');
    }
  }

  async function onDeactivate() {
    try {
      await update.mutateAsync({ isActive: false });
      toast({ variant: 'success', title: `${product.name} deactivated`, description: 'Closed for new bugs. Existing bugs are unchanged.' });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not deactivate the product.');
    }
  }

  const busy = del.isPending || update.isPending;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && !busy && onClose()}
      aria-labelledby={`delete-product-${product.id}`}
      className="w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/40 backdrop:backdrop-blur-[2px]"
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void onDelete();
        }}
        className="flex flex-col gap-4 p-6"
      >
        <div className="flex items-start gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${deletable ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-700'}`}
          >
            {deletable ? <Trash2 className="h-5 w-5" aria-hidden /> : <Archive className="h-5 w-5" aria-hidden />}
          </span>
          <div>
            <h2 id={`delete-product-${product.id}`} className="text-base font-semibold">
              {deletable ? `Delete ${product.name}?` : `${product.name} cannot be deleted`}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              {deletable ? (
                <>
                  This permanently removes the product with its {product.components.length} component
                  {product.components.length === 1 ? '' : 's'}, versions and group controls. It has no bugs, so nothing else is lost. This
                  cannot be undone.
                </>
              ) : (
                <>
                  It has <span className="font-semibold text-slate-900">{bugs.toLocaleString()} bug{bugs === 1 ? '' : 's'}</span>, and Bugzilla
                  only deletes a product with none. <span className="font-medium text-slate-800">Deactivate</span> it instead: it closes for new
                  bugs, and every existing bug stays exactly as it is.
                </>
              )}
            </p>
          </div>
        </div>

        {deletable && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`delete-product-name-${product.id}`} className="text-sm font-medium text-slate-700">
              Type <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.8667rem]">{product.name}</span> to confirm
            </label>
            <input
              id={`delete-product-name-${product.id}`}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              autoComplete="off"
              className="focus-ring h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
            />
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {deletable ? (
            <Button type="submit" variant="danger" loading={del.isPending} disabled={!matches}>
              <Trash2 className="h-4 w-4" /> Delete product
            </Button>
          ) : (
            product.isActive && (
              <Button type="button" onClick={() => void onDeactivate()} loading={update.isPending}>
                <Archive className="h-4 w-4" /> Deactivate instead
              </Button>
            )
          )}
        </div>
      </form>
    </dialog>
  );
}
