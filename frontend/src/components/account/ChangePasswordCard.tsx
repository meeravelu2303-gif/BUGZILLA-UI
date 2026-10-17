import { Check, KeyRound, ShieldCheck } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { useChangePassword } from '../../api/hooks';
import { useToast } from '../../context/ToastContext';
import { getPasswordResetErrorMessage } from '../../lib/authErrorMessage';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../ui/Card';
import { PasswordInput } from '../ui/Field';

/** Bugzilla's USER_PASSWORD_MIN_LENGTH; its complexity rule is applied server-side. */
const MIN_LENGTH = 6;

function Rule({ met, children }: { met: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex items-center gap-2 text-xs ${met ? 'text-emerald-700' : 'text-slate-500'}`}>
      <span
        className={`flex h-4 w-4 items-center justify-center rounded-full ${met ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}
        aria-hidden
      >
        <Check className="h-3 w-3" />
      </span>
      {children}
    </li>
  );
}

/**
 * Change password while signed in.
 *
 * Asks for the current password even though the user is already signed in:
 * a session left open on a shared machine must not be enough to take over the
 * account. Bugzilla checks it (see backend lib/changePassword.ts).
 *
 * This device stays signed in afterwards; every other one is signed out,
 * which the success message says, so a colleague's "why was I logged out?"
 * has an answer.
 */
export function ChangePasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string; form?: string }>({});
  const [doneNote, setDoneNote] = useState<string | null>(null);
  const currentRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLInputElement>(null);
  const mutation = useChangePassword();
  const { toast } = useToast();

  const longEnough = next.length >= MIN_LENGTH;
  const matches = confirm.length > 0 && confirm === next;
  const differs = next.length > 0 && next !== current;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setDoneNote(null);

    const found: typeof errors = {};
    if (!current) found.current = 'Enter your current password.';
    if (!longEnough) found.next = `Use at least ${MIN_LENGTH} characters.`;
    else if (!differs) found.next = 'Choose a password different from your current one.';
    if (!found.next && !matches) found.confirm = 'The two passwords do not match.';
    setErrors(found);
    if (found.current) return currentRef.current?.focus();
    if (found.next || found.confirm) return nextRef.current?.focus();

    try {
      const result = await mutation.mutateAsync({ currentPassword: current, newPassword: next, confirmPassword: confirm });
      setCurrent('');
      setNext('');
      setConfirm('');
      setErrors({});
      const others = result.otherSessionsSignedOut;
      const note =
        others > 0
          ? `You stay signed in here; ${others} other device${others === 1 ? '' : 's'} will need to sign in again.`
          : 'You stay signed in here; any other devices will need to sign in again.';
      setDoneNote(note);
      toast({ variant: 'success', title: 'Password changed', description: note });
    } catch (err) {
      if (err instanceof ApiError && err.details?.reason === 'current_password_incorrect') {
        setErrors({ current: err.message });
        setCurrent('');
        currentRef.current?.focus();
        return;
      }
      if (err instanceof ApiError && err.status === 401) {
        // Session expired mid-form: the sign-in page is the only way forward.
        window.location.href = '/login';
        return;
      }
      setErrors({ form: getPasswordResetErrorMessage(err) });
    }
  }

  return (
    <Card id="password" className="mb-6 scroll-mt-24">
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-600/15">
            <KeyRound className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <CardTitle>Change password</CardTitle>
            <p className="text-xs text-slate-500">Your current password is needed to set a new one.</p>
          </div>
        </div>
      </CardHeader>
      <CardBody>
        <form onSubmit={onSubmit} noValidate className="grid gap-5 lg:grid-cols-[1fr_16rem]">
          <div className="flex flex-col gap-4">
            <PasswordInput
              ref={currentRef}
              label="Current password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => {
                setCurrent(e.target.value);
                if (errors.current) setErrors((s) => ({ ...s, current: undefined }));
              }}
              error={errors.current}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <PasswordInput
                ref={nextRef}
                label="New password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => {
                  setNext(e.target.value);
                  if (errors.next) setErrors((s) => ({ ...s, next: undefined }));
                }}
                error={errors.next}
                aria-describedby="change-password-rules"
              />
              <PasswordInput
                label="Confirm new password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  if (errors.confirm) setErrors((s) => ({ ...s, confirm: undefined }));
                }}
                error={errors.confirm}
              />
            </div>

            {errors.form && (
              <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {errors.form}
              </p>
            )}
            {doneNote && (
              <p role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>Password changed. {doneNote}</span>
              </p>
            )}

            <div>
              <Button type="submit" loading={mutation.isPending}>
                {mutation.isPending ? 'Updating…' : 'Update password'}
              </Button>
            </div>
          </div>

          <aside className="rounded-xl bg-slate-50/80 p-4 ring-1 ring-inset ring-slate-900/5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Requirements</p>
            <ul id="change-password-rules" className="space-y-1.5" aria-live="polite">
              <Rule met={longEnough}>At least {MIN_LENGTH} characters</Rule>
              <Rule met={differs}>Different from your current password</Rule>
              <Rule met={matches}>Both new passwords match</Rule>
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Changing it signs you out on every other device. Forgot your current password? Sign out and use
              “Forgot password?”.
            </p>
          </aside>
        </form>
      </CardBody>
    </Card>
  );
}
