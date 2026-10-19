import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { UEducateLogo } from '../brand/UEducateLogo';

/**
 * The frame for the account pages that are not sign-in itself (forgot /
 * reset password): the sign-in form's own side of the screen - ice blue, a
 * teal glow, the white card with the brand cap - without the hero panel,
 * which exists to introduce the product and has nothing to say to someone
 * who is here only to recover an account.
 *
 * Light-only, like Login.tsx, and for the same reason: there is no `darkMode`
 * key in tailwind.config.js, so a `dark:` utility here would follow the OS
 * setting on its own and darken one page of a light app.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  /** Below the card. Defaults to a "Back to sign in" link. */
  footer?: ReactNode;
}) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#eef7fa] px-5 py-12">
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[40rem] w-[40rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(153,246,228,0.45)_0%,rgba(204,251,241,0.22)_45%,transparent_70%)] blur-2xl"
        aria-hidden
      />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3">
          <UEducateLogo height={40} />
          <span className="rounded-full bg-[#0d6875]/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#0d6875]">
            Bug Tracker
          </span>
        </div>

        <div className="w-full overflow-hidden rounded-3xl border border-hairline bg-white shadow-2xl shadow-teal-950/10">
          <div className="h-1.5 bg-gradient-to-r from-ueducate-primary via-ueducate-accent to-ueducate-hover" aria-hidden />
          <div className="p-9">
            <h1 className="text-[1.5rem] font-bold leading-tight tracking-tight text-ueducate-ink">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>
        </div>

        <p className="mt-5 text-center text-sm text-slate-500">
          {footer ?? (
            <Link to="/login" className="font-medium text-[#0d6875] hover:underline">
              Back to sign in
            </Link>
          )}
        </p>
      </div>
    </main>
  );
}

/** The sign-in page's field look, shared so these pages read as the same form. */
export const AUTH_FIELD_BASE =
  'h-12 w-full rounded-xl border bg-slate-50 pl-10 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all';
export const AUTH_FIELD_OK = 'border-hairline focus:border-[#0d6875] focus:bg-white focus:ring-4 focus:ring-[#0d6875]/15';
export const AUTH_FIELD_ERROR = 'border-rose-400 bg-rose-50/20 focus:border-rose-400 focus:ring-4 focus:ring-rose-200/60';
export const AUTH_SUBMIT =
  'mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0d6875] text-sm font-semibold text-white shadow-md shadow-[#0d6875]/20 outline-none transition-all hover:bg-[#0a525d] focus-visible:ring-2 focus-visible:ring-[#0d6875]/40 focus-visible:ring-offset-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60';
