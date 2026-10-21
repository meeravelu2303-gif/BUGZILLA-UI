import { Loader2, ShieldOff, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { useDeleteUser, useUpdateUser, useUserDeleteCheck } from '../../api/hooks';
import { useToast } from '../../context/ToastContext';
import type { AdminUser } from '../../types';
import { Button } from '../ui/Button';

/**
 * Safe delete for a user account.
 *
 * Asks the server first (which asks Bugzilla's own delete page) whether
 * anything points at the account. If it has history - bugs, comments,
 * attachments, assignments, component ownership - deleting would orphan that
 * work, so the dialog lists exactly what and offers Disable instead, which
 * removes access and keeps every record intact. Only a clean account can be
 * deleted, and only after typing its email.
 */
export function DeleteUserDialog({
  open,
  user,
  onClose,
  afterDelete,
}: {
  open: boolean;
  user: AdminUser;
  onClose: () => void;
  /** Where to go once the account is gone (e.g. back to the list). */
  afterDelete?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const check = useUserDeleteCheck(user.id, open);
  const del = useDeleteUser(user.id);
  const update = useUpdateUser(user.id);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setTyped('');
      setReason('');
      setError(null);
      dialog.showModal();
    } else if (!open && dialog.open) dialog.close();
  }, [open]);

  const deletable = check.data?.deletable === true;
  const matches = typed.trim().toLowerCase() === user.email.toLowerCase();
  const busy = del.isPending || update.isPending;
  const label = user.fullName || user.email;

  async function onDelete() {
    if (!matches) return;
    setError(null);
    try {
      await del.mutateAsync(typed.trim());
      toast({ variant: 'success', title: `${label} deleted`, description: 'The account had no history, so nothing else changed.' });
      onClose();
      if (afterDelete) navigate(afterDelete, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete the account.');
    }
  }

  async function onDisable() {
    if (!reason.trim()) return setError('Give a reason - the person sees it if they try to sign in.');
    setError(null);
    try {
      await update.mutateAsync({ disabled: true, disabledReason: reason.trim() });
      toast({ variant: 'success', title: `${label} disabled`, description: 'They can no longer sign in. Their bugs and comments are unchanged.' });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not disable the account.');
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && !busy && onClose()}
      aria-labelledby={`delete-user-${user.id}`}
      className="w-[min(34rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/40 backdrop:backdrop-blur-[2px]"
    >
      <form
        method="dialog"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void (deletable ? onDelete() : onDisable());
        }}
        className="flex flex-col gap-4 p-6"
      >
        {check.isLoading && (
          <p className="flex items-center gap-2 py-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking what references this account…
          </p>
        )}

        {check.isError && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {check.error instanceof ApiError ? check.error.message : 'Could not check this account.'}
          </p>
        )}

        {check.data && (
          <div className="flex items-start gap-3">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${deletable ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-700'}`}
            >
              {deletable ? <Trash2 className="h-5 w-5" aria-hidden /> : <ShieldOff className="h-5 w-5" aria-hidden />}
            </span>
            <div className="min-w-0">
              <h2 id={`delete-user-${user.id}`} className="text-base font-semibold">
                {deletable ? `Delete ${label}?` : `${label} cannot be deleted`}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                {deletable
                  ? 'Nothing in Bugzilla references this account, so it can be removed completely. This cannot be undone.'
                  : 'Deleting it would leave this work pointing at an account that no longer exists:'}
              </p>
              {!deletable && check.data.blockers.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {check.data.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
              {!deletable && (
                <p className="mt-2 text-sm text-slate-600">
                  <span className="font-medium text-slate-800">Disable</span> it instead: they lose access, and every record keeps their name.
                </p>
              )}
            </div>
          </div>
        )}

        {check.data && deletable && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`delete-user-email-${user.id}`} className="text-sm font-medium text-slate-700">
              Type <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.8667rem]">{user.email}</span> to confirm
            </label>
            <input
              id={`delete-user-email-${user.id}`}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              autoComplete="off"
              className="focus-ring h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
            />
          </div>
        )}

        {check.data && !deletable && user.isEnabled && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`disable-user-reason-${user.id}`} className="text-sm font-medium text-slate-700">
              Reason shown if they try to sign in
            </label>
            <input
              id={`disable-user-reason-${user.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Left the company in October 2026."
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
            {check.data && !deletable && !user.isEnabled ? 'Close' : 'Cancel'}
          </Button>
          {check.data && deletable && (
            <Button type="submit" variant="danger" loading={del.isPending} disabled={!matches}>
              <Trash2 className="h-4 w-4" /> Delete account
            </Button>
          )}
          {check.data && !deletable && user.isEnabled && (
            <Button type="submit" loading={update.isPending} disabled={!reason.trim()}>
              <ShieldOff className="h-4 w-4" /> Disable instead
            </Button>
          )}
        </div>
      </form>
    </dialog>
  );
}
