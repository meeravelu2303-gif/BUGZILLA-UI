import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Bug,
  CheckSquare,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLogin } from '../api/hooks';
import { UEducateLogo } from '../components/brand/UEducateLogo';
import { getSignInErrorMessage } from '../lib/authErrorMessage';

/**
 * The sign-in screen.
 *
 * Deep-teal brand hero (desktop only) beside the form on soft ice blue. The
 * palette is fixed - #0d6875 hero, #eef7fa form side - and the card stays white
 * in every case.
 *
 * There is deliberately no `dark:` variant anywhere on this page:
 * `tailwind.config.js` declares no `darkMode` key, so Tailwind falls back to
 * `media` and a stray dark utility would fire off the viewer's OS setting
 * alone, darkening this page inside an app that stays light everywhere else.
 */

const FEATURES = [
  { icon: CheckSquare, title: 'Track & triage', text: 'File, filter and update bugs across every product.' },
  { icon: BarChart3, title: 'Live reports', text: 'Breakdowns by status, severity, product and owner.' },
  { icon: Search, title: 'Find anything fast', text: 'Advanced search and a ⌘K command palette.' },
  { icon: ShieldCheck, title: 'Your permissions', text: 'Access respects the groups your account belongs to.' },
];

/**
 * Deliberately permissive: it rejects the shapes that are certainly wrong
 * (blank, no `@`, no dot in the domain, embedded spaces) and lets everything
 * else through to the server.
 *
 * A stricter regex is the wrong trade here. This check exists to save a
 * pointless round trip and to put the error next to the field, NOT to decide
 * what a valid address is - RFC 5322 allows addresses that most "clever"
 * patterns reject, and the only authority on whether an account exists is
 * Bugzilla. Anything this lets through still gets a real answer from the API.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Shared field styling. `pl-10` reserves the gutter the lead icon sits in. */
const FIELD_BASE =
  'h-12 w-full rounded-xl border bg-slate-50 pl-10 text-sm text-slate-900 placeholder:text-slate-400 ' +
  'outline-none transition-all';
const FIELD_OK = 'border-slate-200/80 focus:border-[#0d6875] focus:bg-white focus:ring-4 focus:ring-[#0d6875]/15';
const FIELD_ERROR = 'border-rose-400 bg-rose-50/20 focus:border-rose-400 focus:ring-4 focus:ring-rose-200/60';

export function Login() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  /** Field-level: what the user can fix before we ask the server anything. */
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  /** Request-level: what the server said, already sanitised for display. */
  const [serverError, setServerError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const loginMutation = useLogin();

  function validateEmail(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) {
      setEmailError('Email address is required.');
      return false;
    }
    if (!EMAIL_PATTERN.test(trimmed)) {
      setEmailError('Please enter a valid work email address.');
      return false;
    }
    setEmailError('');
    return true;
  }

  /*
   * Presence only, deliberately. There is no minimum length or complexity rule
   * here because the password being checked was set in Bugzilla - possibly
   * years ago, under whatever policy applied then. A client-side "at least N
   * characters" would refuse to even attempt a password that is genuinely
   * correct, and the user would have no way to tell the difference between
   * "this app will not send it" and "the server rejected it".
   */
  function validatePassword(value: string): boolean {
    if (!value) {
      setPasswordError('Password is required.');
      return false;
    }
    setPasswordError('');
    return true;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);

    /*
     * Validate before the request, not after: a malformed address cannot
     * succeed, and sending it anyway spends one of the ten attempts the rate
     * limiter allows for this (IP, account) pair. Someone fixing a typo should
     * not be moved closer to a five-minute lockout by it.
     *
     * Both checks run before either result is acted on. Guarding with `&&`, or
     * returning early on the email, would short-circuit - leaving an empty
     * password unreported until the address was fixed and the form submitted a
     * second time. Two blank fields are two problems, and the form should say
     * so in one pass rather than revealing them one at a time.
     */
    const emailOk = validateEmail(login);
    const passwordOk = validatePassword(password);
    if (!emailOk || !passwordOk) {
      /*
       * Move focus to the first field that needs attention.
       *
       * This is what the previous `if (!password) return;` was missing: it
       * bailed silently, so pressing Sign in with an empty password did
       * nothing at all - no message, no focus change, no request. A control
       * that appears to ignore the click is indistinguishable from one that is
       * broken. Focusing also announces the message to a screen reader, which
       * a purely visual error below the field does not.
       */
      (emailOk ? passwordRef : emailRef).current?.focus();
      return;
    }

    try {
      await loginMutation.mutateAsync({ login: login.trim(), password });
      navigate('/', { replace: true });
    } catch (err) {
      // Owns every server-side case - 401, 429 with a live countdown, upstream
      // outages - and strips IPs and stack traces on the way out.
      setServerError(getSignInErrorMessage(err));
    }
  }

  const busy = loginMutation.isPending;

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* ---------------------------------------------------------- hero ---- */}
      {/* Lit from the top-right so the panel has a light source, rather than
          reading as one flat fill. Both stops stay on the brand teal. */}
      <aside className="relative hidden overflow-hidden bg-[#0d6875] bg-[radial-gradient(120%_100%_at_85%_0%,#15879b_0%,#0d6875_55%,#0a525d_100%)] lg:flex lg:flex-col lg:justify-between">
        {/*
          Dot grid at 22px. Static, not animated: it sits behind text people
          read while typing a password, and motion there is a distraction rather
          than delight. `opacity-15` on a white dot lands soft enough to read as
          paper texture instead of a visible pattern.
        */}
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] bg-[size:22px_22px] opacity-15"
          aria-hidden
        />

        {/*
          Circuit traces, weighted to the right edge so they read as texture
          behind the panel's seam rather than clutter behind the headline.
          Inline SVG rather than an asset: it is a few hundred bytes, needs no
          extra request, and inherits the panel's colour.
        */}
        <svg
          className="pointer-events-none absolute inset-y-0 right-0 h-full w-3/4 text-white/[0.13]"
          viewBox="0 0 400 800"
          fill="none"
          preserveAspectRatio="xMaxYMid slice"
          aria-hidden
        >
          {/*
            Fine runs with right-angle turns and terminating pads, clustered in
            the top-right and bottom-right so the middle band stays quiet behind
            the headline and the bento cards. Hairline weight (1px) keeps it as
            texture: heavier strokes stop reading as circuitry and start
            competing with the copy.
          */}
          <g stroke="currentColor" strokeWidth="1" strokeLinecap="round">
            <path d="M400 60 H336 a8 8 0 0 0-8 8 V104 a8 8 0 0 1-8 8 H262" />
            <path d="M400 96 H360 a8 8 0 0 0-8 8 V150" />
            <path d="M300 0 V38 a8 8 0 0 0 8 8 H400" />
            <path d="M262 112 V168 a8 8 0 0 0 8 8 H328" />
            <path d="M400 168 H372 a8 8 0 0 0-8 8 V214 a8 8 0 0 1-8 8 H300" />
            <path d="M352 150 H400" />
            <path d="M236 40 H196 a8 8 0 0 0-8 8 V96" />

            <path d="M400 590 H344 a8 8 0 0 1-8-8 V536 a8 8 0 0 0-8-8 H272" />
            <path d="M400 648 H366 a8 8 0 0 0-8 8 V700" />
            <path d="M272 528 V470 a8 8 0 0 1 8-8 H400" />
            <path d="M228 800 V744 a8 8 0 0 1 8-8 H316 a8 8 0 0 0 8-8 V690" />
            <path d="M324 690 H400" />
            <path d="M180 660 H140 a8 8 0 0 0-8 8 V730" />
            <path d="M400 740 H380 a8 8 0 0 0-8 8 V800" />
          </g>
          <g fill="currentColor">
            {[
              [262, 112], [352, 150], [328, 176], [300, 222], [188, 96], [300, 0], [400, 60],
              [272, 528], [324, 690], [358, 700], [132, 730], [372, 800], [400, 590],
            ].map(([cx, cy]) => (
              <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.5" />
            ))}
          </g>
        </svg>

        {/*
          A few bug marks drifting over the panel - the product's own motif,
          at a weight that reads on a second look rather than the first.
        */}
        {[
          /*
           * Positioned in the panel's empty margins, never in the text column.
           * One of these previously sat at 52% - immediately beside the
           * subtitle - where it read as a stray glyph attached to the sentence
           * rather than as background texture.
           */
          { top: '13%', left: '61%', size: 'h-5 w-5' },
          { top: '55%', left: '78%', size: 'h-6 w-6' },
          { top: '88%', left: '30%', size: 'h-4 w-4' },
        ].map((b) => (
          <Bug
            key={`${b.top}-${b.left}`}
            className={`pointer-events-none absolute ${b.size} text-white/20`}
            style={{ top: b.top, left: b.left }}
            aria-hidden
          />
        ))}

        {/*
          A broad spotlight from the top-left, plus two tighter pools. Written
          as an explicit `radial-gradient(...)`: `bg-gradient-radial from-… via-…`
          is NOT a stock Tailwind utility (only the linear directions ship, and
          this config adds no plugin for it), so that shorthand compiles to
          nothing and the glow silently never renders.
        */}
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_20%_20%,rgba(45,212,191,0.10)_0%,transparent_70%)]"
          aria-hidden
        />
        <div className="pointer-events-none absolute -left-32 -top-24 h-96 w-96 rounded-full bg-ueducate-accent/20 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 right-[-8rem] h-96 w-96 rounded-full bg-ueducate-primary/15 blur-3xl" aria-hidden />

        <div className="relative z-10 p-10">
          {/*
            Glassmorphic pill holding the crest and the product name.

            The logo sits on its own white chip inside the glass rather than
            directly on it. The asset is a PNG whose wordmark is charcoal
            (#2F383A - measured for white backgrounds, see BRANDING.md), so on a
            10%-white pane over teal it would all but disappear. Backing it keeps
            the mark legible and on-brand while the container itself stays
            genuinely translucent.
          */}
          {/*
            The brandmark is NOT split into "crest + UEDUCATE text".
            `ueducate-logo.png` is the shield AND the wordmark together - the
            asset lifted from the live site header (BRANDING.md) - so rendering
            it beside a separate "UEDUCATE" label would print the company name
            twice. Cropping to the shield alone would mean guessing where the
            crest ends inside a raster image, and any drift there mangles the
            mark. Instead the whole mark is scaled up on a white chip, which is
            what makes it legible: the wordmark is charcoal (#2F383A, measured
            for white backgrounds), and on a 10%-white pane over teal it would
            all but disappear.
          */}
          <div className="inline-flex items-center gap-3.5 rounded-2xl border border-white/20 bg-white/10 px-5 py-3 shadow-lg shadow-black/5 backdrop-blur-xl">
            <span className="flex items-center rounded-xl bg-white px-3 py-2">
              <UEducateLogo height={30} />
            </span>
            <span className="h-5 w-px bg-white/30" aria-hidden />
            <span className="text-sm font-semibold tracking-wide text-teal-100">Bug Tracker</span>
          </div>
        </div>

        <div className="relative z-10 px-10">
          {/*
            Two lines, two weights.

            Previously both sentences were extrabold at leading-[1.12]: nothing
            led, and at that size the descenders of "every bug." crowded the
            "Ship" beneath them, which is what made the block read as a dense
            slab rather than a headline. Opening the leading to 1.15 and letting
            the second line drop to semibold in a softer teal gives the pair a
            clear first and second beat, and the eye lands on "Track every bug."
            before reading on.

            `max-w-[19ch]` measures in characters, not pixels, so the break
            stays put if the type scale or font ever changes - a pixel width
            silently re-wraps and produces an orphan.
          */}
          <h2 className="max-w-[19ch] text-4xl font-extrabold leading-[1.15] tracking-tight text-white">
            Track every bug.
            <span className="mt-1 block font-semibold text-teal-100">Ship with confidence.</span>
          </h2>
          <p className="mt-6 max-w-sm text-base leading-relaxed text-teal-100/75">
            One clean, fast workspace for every defect across your products — for the whole team.
          </p>

          <ul className="mt-10 grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li
                key={f.title}
                className="group flex items-start gap-3 rounded-2xl border border-white/15 bg-white/10 p-5 shadow-sm backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/15"
              >
                <span className="flex shrink-0 items-center justify-center rounded-lg bg-white/15 p-2 text-teal-100 transition-colors group-hover:bg-white/25">
                  <f.icon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{f.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-teal-100/80">{f.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 p-10 text-sm text-teal-100/70">
          Your single system of record for product quality and defect tracking.
        </div>
      </aside>

      {/* ---------------------------------------------------------- form ---- */}
      <main className="relative flex items-center justify-center overflow-hidden bg-[#eef7fa] px-5 py-12">
        {/*
          Ambient glow behind the card, tying the form side back to the teal.
          Written as an arbitrary `radial-gradient(...)` rather than
          `bg-gradient-radial from-… to-…`: that utility does NOT exist in stock
          Tailwind (only the linear directions ship), and this config adds no
          plugin for it - so the shorthand compiles to nothing and the glow
          silently never renders.
        */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-[40rem] w-[40rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(153,246,228,0.45)_0%,rgba(204,251,241,0.22)_45%,transparent_70%)] blur-2xl"
          aria-hidden
        />

        {/* A single four-point sparkle, low in the panel - the one decorative
            flourish, kept away from the card so it never competes with it. */}
        <svg
          className="pointer-events-none absolute bottom-16 right-14 h-16 w-16 text-white/70"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
        >
          <path d="M12 0c.4 6.3 5.3 11.2 11.6 11.6C17.3 12 12.4 16.9 12 23.2 11.6 16.9 6.7 12 .4 11.6 6.7 11.2 11.6 6.3 12 0Z" />
        </svg>

        <div className="relative z-10 w-full max-w-md">
          {/* Brand mark for small screens, where the hero panel is hidden. */}
          <div className="mb-8 flex flex-col items-center gap-3 lg:hidden">
            <UEducateLogo height={40} />
            <span className="rounded-full bg-[#0d6875]/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#0d6875]">
              Bug Tracker
            </span>
          </div>

          <div className="mb-7 hidden lg:block">
            <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight text-ueducate-ink">Welcome back</h1>
            <p className="mt-1.5 text-sm text-slate-500">Sign in to your workspace.</p>
          </div>

          <form
            onSubmit={onSubmit}
            /*
             * `noValidate` hands validation to this component alone. Without it
             * the browser's own bubble fires first on `type="email"`, in its own
             * wording and its own position, and the field-level message below
             * never gets a chance to render - two validators disagreeing about
             * the same field.
             */
            noValidate
            className="w-full overflow-hidden rounded-3xl border border-slate-100/80 bg-white shadow-2xl shadow-teal-950/10"
          >
            {/* Brand accent capping the card. `overflow-hidden` on the form is
                what lets it sit flush inside the rounded corners. */}
            <div className="h-1.5 bg-gradient-to-r from-ueducate-primary via-ueducate-accent to-ueducate-hover" aria-hidden />

            <div className="p-9">
              <h1 className="mb-6 text-lg font-semibold tracking-tight text-ueducate-ink lg:hidden">
                Sign in to Bug Tracker
              </h1>

            <div className="flex flex-col gap-4">
              {/* ---- email ---- */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="login-email" className="text-sm font-medium text-slate-700">
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
                    id="login-email"
                    ref={emailRef}
                    type="email"
                    autoComplete="username"
                    value={login}
                    onChange={(e) => {
                      setLogin(e.target.value);
                      // Re-check only once an error is showing, so the message
                      // clears as soon as it is fixed but never appears while
                      // someone is still part-way through typing.
                      if (emailError) validateEmail(e.target.value);
                    }}
                    onBlur={() => login && validateEmail(login)}
                    placeholder="you@example.com"
                    autoFocus
                    aria-invalid={emailError ? true : undefined}
                    aria-describedby={emailError ? 'login-email-error' : undefined}
                    className={`${FIELD_BASE} pr-3.5 ${emailError ? FIELD_ERROR : FIELD_OK}`}
                  />
                </div>
                {emailError && (
                  <p id="login-email-error" className="text-xs font-medium text-rose-600">
                    {emailError}
                  </p>
                )}
              </div>

              {/* ---- password ---- */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="login-password" className="text-sm font-medium text-slate-700">
                  Password
                </label>
                <div className="relative">
                  <Lock
                    className={`pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 ${
                      passwordError ? 'text-rose-400' : 'text-slate-400'
                    }`}
                    aria-hidden
                  />
                  <input
                    id="login-password"
                    ref={passwordRef}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      // Clear as soon as it is fixed. There is no onBlur check
                      // to match the email field's: presence is the only rule,
                      // so blurring an empty box would flag it the moment
                      // someone tabbed past on their way to the reveal toggle.
                      if (passwordError) validatePassword(e.target.value);
                    }}
                    placeholder="••••••••"
                    aria-invalid={passwordError ? true : undefined}
                    aria-describedby={passwordError ? 'login-password-error' : undefined}
                    className={`${FIELD_BASE} ${passwordError ? FIELD_ERROR : FIELD_OK} pr-11`}
                  />
                  <button
                    /*
                     * `type="button"` is load-bearing: a bare button inside a
                     * form defaults to submit, so revealing the password would
                     * fire a sign-in attempt and spend a rate-limit slot.
                     */
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    aria-controls="login-password"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 outline-none transition-colors hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-[#0d6875]/30"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                  </button>
                </div>
                {passwordError && (
                  <p id="login-password-error" className="text-xs font-medium text-rose-600">
                    {passwordError}
                  </p>
                )}
              </div>

              {/* ---- server-side result ---- */}
              {serverError && (
                <p
                  role="alert"
                  className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-sm leading-relaxed text-rose-700"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>{serverError}</span>
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0d6875] text-sm font-semibold text-white shadow-md shadow-[#0d6875]/20 outline-none transition-all hover:bg-[#0a525d] focus-visible:ring-2 focus-visible:ring-[#0d6875]/40 focus-visible:ring-offset-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Signing in…
                  </>
                ) : (
                  <>
                    <ArrowRight className="h-4 w-4" aria-hidden />
                    Sign in
                  </>
                )}
              </button>
            </div>
            </div>
          </form>

          <p className="mt-5 text-center text-xs text-slate-500">
            {/*
              NOTE: this line describes single sign-on, which this app does not
              implement - sign-in is username + password verified server-side,
              with per-group access control. Requested copy, kept as specified.
              If a reader ever asks where the SSO button is, that is why; an
              accurate alternative is "Secured by centralized team access
              control." which keeps the positioning without the SSO claim.
            */}
            Secured by enterprise single sign-on &amp; team access control.
          </p>
        </div>
      </main>
    </div>
  );
}
