import { AlertCircle, ArrowRight, Loader2, Mail, MailCheck } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useForgotPassword } from '../api/hooks';
import { AUTH_FIELD_BASE, AUTH_FIELD_ERROR, AUTH_FIELD_OK, AUTH_SUBMIT, AuthShell } from '../components/auth/AuthShell';
import { getPasswordResetErrorMessage } from '../lib/authErrorMessage';

/** Same permissive shape as the sign-in form: catch the certainly-wrong, let Bugzilla judge the rest. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Forgot password: ask for the address, hand off to email.
 *
 * The confirmation deliberately reads the same whether or not the address has
 * an account - the server answers 202 either way - so this page cannot be used
 * to find out who has one. What it CAN tell people is what to do next: where
 * the email comes from, how long the link lasts, and that asking again inside
 * ten minutes sends nothing (Bugzilla issues one token per account per
 * interval).
 */
export function ForgotPassword() {
  const [login, setLogin] = useState('');
  const [emailError, setEmailError] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cooldownMinutes, setCooldownMinutes] = useState(10);
  const [linkValidDays, setLinkValidDays] = useState(3);
  const [dailyLimit, setDailyLimit] = useState(3);
  const emailRef = useRef<HTMLInputElement>(null);
  const mutation = useForgotPassword();

  function validateEmail(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) {
      setEmailError('Email address is required.');
      return false;
    }
    if (!EMAIL_PATTERN.test(trimmed)) {
      setEmailError('Please enter a valid email address.');
      return false;
    }
    setEmailError('');
    return true;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    if (!validateEmail(login)) {
      emailRef.current?.focus();
      return;
    }
    try {
      const result = await mutation.mutateAsync({ login: login.trim() });
      setCooldownMinutes(result.cooldownMinutes);
      setLinkValidDays(result.linkValidDays);
      setDailyLimit(result.dailyLimit);
      setSentTo(login.trim());
    } catch (err) {
      setServerError(getPasswordResetErrorMessage(err));
    }
  }

  if (sentTo) {
    return (
      <AuthShell
        title="Check your email"
        subtitle={
          <>
            If <span className="font-medium text-slate-700">{sentTo}</span> has an account, a password reset link is on its way.
          </>
        }
      >
        <div className="flex items-start gap-3 rounded-2xl border border-teal-100 bg-teal-50/70 p-4">
          <span className="flex shrink-0 items-center justify-center rounded-xl bg-white p-2 text-[#0d6875] shadow-sm">
            <MailCheck className="h-5 w-5" aria-hidden />
          </span>
          <ul className="space-y-1.5 text-sm leading-relaxed text-slate-600">
            <li>Open the link in the email to choose a new password.</li>
            <li>
              The link works once and expires after {linkValidDays} day{linkValidDays === 1 ? '' : 's'}.
            </li>
            <li>Nothing in your inbox after a few minutes? Check your spam folder.</li>
            <li>
              A new link can be requested every {cooldownMinutes} minutes, up to {dailyLimit} times in 24 hours.
            </li>
          </ul>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <Link to="/login" className={AUTH_SUBMIT}>
            <ArrowRight className="h-4 w-4" aria-hidden />
            Back to sign in
          </Link>
          <button
            type="button"
            onClick={() => {
              setSentTo(null);
              setServerError(null);
            }}
            className="text-center text-sm font-medium text-[#0d6875] hover:underline"
          >
            Use a different email address
          </button>
        </div>
      </AuthShell>
    );
  }

  const busy = mutation.isPending;

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter the email address you sign in with and we will send you a link to choose a new one."
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="forgot-email" className="text-sm font-medium text-slate-700">
            Email
          </label>
          <div className="relative">
            <Mail
              className={`pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 ${
                emailError ? 'text-rose-400' : 'text-slate-400'
              }`}
              aria-hidden
            />
            <input
              id="forgot-email"
              ref={emailRef}
              type="email"
              autoComplete="username"
              value={login}
              onChange={(e) => {
                setLogin(e.target.value);
                if (emailError) validateEmail(e.target.value);
              }}
              onBlur={() => login && validateEmail(login)}
              placeholder="you@example.com"
              autoFocus
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? 'forgot-email-error' : undefined}
              className={`${AUTH_FIELD_BASE} ${emailError ? AUTH_FIELD_ERROR : AUTH_FIELD_OK}`}
            />
          </div>
          {emailError && (
            <p id="forgot-email-error" className="text-xs font-medium text-rose-600">
              {emailError}
            </p>
          )}
        </div>

        {serverError && (
          <p role="alert" className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-sm leading-relaxed text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{serverError}</span>
          </p>
        )}

        <button type="submit" disabled={busy} className={AUTH_SUBMIT}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Sending…
            </>
          ) : (
            <>
              <ArrowRight className="h-4 w-4" aria-hidden />
              Send reset link
            </>
          )}
        </button>
      </form>
    </AuthShell>
  );
}
