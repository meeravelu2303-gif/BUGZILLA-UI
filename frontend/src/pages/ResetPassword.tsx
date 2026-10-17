import { AlertCircle, ArrowRight, Check, CheckCircle2, Eye, EyeOff, Loader2, Lock, LinkIcon } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useResetPassword, useValidateResetToken } from '../api/hooks';
import { AUTH_FIELD_BASE, AUTH_FIELD_ERROR, AUTH_FIELD_OK, AUTH_SUBMIT, AuthShell } from '../components/auth/AuthShell';
import { getPasswordResetErrorMessage } from '../lib/authErrorMessage';

/** Bugzilla's USER_PASSWORD_MIN_LENGTH. Its complexity rule (a parameter) is applied server-side. */
const MIN_LENGTH = 6;

/**
 * The token arrives in the URL because that is the only thing an email link
 * can carry. Reading it is pure; the URL is rewritten without it in an effect
 * below, so it does not sit in the address bar, the browser history, or the
 * next page's Referer header. (Pure on purpose: React runs state initialisers
 * twice in development, and an initialiser that also stripped the URL would
 * hand the second run nothing.)
 */
function readTokenFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('t') ?? params.get('token');
}

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
 * Reset password: the page the emailed link opens.
 *
 * Three states besides the form. No token (someone typed the URL), a dead
 * token (used, expired, cancelled - checked with the server before the form is
 * shown, so nobody types a password into a link that was never going to work),
 * and done.
 */
export function ResetPassword() {
  const [token] = useState<string | null>(readTokenFromUrl);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [done, setDone] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const check = useValidateResetToken(token);
  const mutation = useResetPassword();

  useEffect(() => {
    if (token && window.location.search) window.history.replaceState(null, '', window.location.pathname);
  }, [token]);

  useEffect(() => {
    if (check.data && !check.data.valid) setExpired(true);
  }, [check.data]);

  const longEnough = password.length >= MIN_LENGTH;
  const matches = confirm.length > 0 && confirm === password;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    if (!longEnough) {
      setFieldError(`Use at least ${MIN_LENGTH} characters.`);
      passwordRef.current?.focus();
      return;
    }
    if (!matches) {
      setFieldError('The two passwords do not match.');
      return;
    }
    setFieldError('');
    try {
      await mutation.mutateAsync({ token: token!, password, confirmPassword: confirm });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.details?.reason === 'invalid_token') {
        setExpired(true);
        return;
      }
      setServerError(getPasswordResetErrorMessage(err));
    }
  }

  if (!token || expired) {
    return (
      <AuthShell
        title={token ? 'This link has expired' : 'This link is incomplete'}
        subtitle={
          token
            ? 'Reset links work once and expire after a few days. Request a new one and use the latest email.'
            : 'The address is missing its reset code. Open the link from the email again, or request a new one.'
        }
      >
        <div className="flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50/70 p-4 text-sm text-slate-600">
          <span className="flex shrink-0 items-center justify-center rounded-xl bg-white p-2 text-amber-600 shadow-sm">
            <LinkIcon className="h-5 w-5" aria-hidden />
          </span>
          <p className="leading-relaxed">
            For your security, a link stops working as soon as it has been used, cancelled, or replaced by a newer request.
          </p>
        </div>
        <Link to="/forgot-password" className={`${AUTH_SUBMIT} mt-6`}>
          <ArrowRight className="h-4 w-4" aria-hidden />
          Request a new link
        </Link>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="Password updated" subtitle="You can sign in with your new password now. Any other devices that were signed in will need to sign in again.">
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />
          Your new password is in effect.
        </div>
        <button type="button" onClick={() => navigate('/login', { replace: true })} className={`${AUTH_SUBMIT} mt-6`}>
          <ArrowRight className="h-4 w-4" aria-hidden />
          Sign in
        </button>
      </AuthShell>
    );
  }

  if (check.isLoading) {
    return (
      <AuthShell title="Checking your link…">
        <div className="flex items-center justify-center py-6 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        </div>
      </AuthShell>
    );
  }

  if (check.isError) {
    return (
      <AuthShell title="Choose a new password" subtitle="We could not check your link just now.">
        <p role="alert" className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-sm leading-relaxed text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{getPasswordResetErrorMessage(check.error)}</span>
        </p>
        <button type="button" onClick={() => void check.refetch()} className={`${AUTH_SUBMIT} mt-6`}>
          Try again
        </button>
      </AuthShell>
    );
  }

  const busy = mutation.isPending;

  return (
    <AuthShell title="Choose a new password" subtitle="Pick something you do not use anywhere else.">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="reset-password" className="text-sm font-medium text-slate-700">
            New password
          </label>
          <div className="relative">
            <Lock className={`pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 ${fieldError ? 'text-rose-400' : 'text-slate-400'}`} aria-hidden />
            <input
              id="reset-password"
              ref={passwordRef}
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldError) setFieldError('');
              }}
              placeholder="••••••••"
              autoFocus
              aria-invalid={fieldError ? true : undefined}
              aria-describedby="reset-password-rules"
              className={`${AUTH_FIELD_BASE} pr-11 ${fieldError ? AUTH_FIELD_ERROR : AUTH_FIELD_OK}`}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? 'Hide password' : 'Show password'}
              aria-pressed={show}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 outline-none transition-colors hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-[#0d6875]/30"
            >
              {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="reset-confirm" className="text-sm font-medium text-slate-700">
            Confirm new password
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              id="reset-confirm"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                if (fieldError) setFieldError('');
              }}
              placeholder="••••••••"
              className={`${AUTH_FIELD_BASE} ${fieldError ? AUTH_FIELD_ERROR : AUTH_FIELD_OK}`}
            />
          </div>
        </div>

        <ul id="reset-password-rules" className="space-y-1 rounded-xl bg-slate-50 px-4 py-3" aria-live="polite">
          <Rule met={longEnough}>At least {MIN_LENGTH} characters</Rule>
          <Rule met={matches}>Both passwords match</Rule>
        </ul>

        {(fieldError || serverError) && (
          <p role="alert" className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-sm leading-relaxed text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{fieldError || serverError}</span>
          </p>
        )}

        <button type="submit" disabled={busy} className={AUTH_SUBMIT}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Saving…
            </>
          ) : (
            <>
              <ArrowRight className="h-4 w-4" aria-hidden />
              Set new password
            </>
          )}
        </button>
      </form>
    </AuthShell>
  );
}
