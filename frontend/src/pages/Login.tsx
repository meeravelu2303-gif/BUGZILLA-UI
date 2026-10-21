import { Activity, AlertCircle, ArrowRight, Database, Eye, EyeOff, Info, Loader2, Lock, Mail, Rocket, ScrollText, ShieldCheck, Sparkles, Target, Users, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLogin } from '../api/hooks';
import { BugzillaMark } from '../components/brand/BugzillaMark';
import { UEducateLogo } from '../components/brand/UEducateLogo';
import { LoginBackdrop } from '../components/auth/LoginBackdrop';
import { getSignInErrorMessage } from '../lib/authErrorMessage';
import { listVariants, pageVariants } from '../lib/motion';
import { cn } from '../lib/utils';

/**
 * The sign-in screen.
 *
 * Pristine light, asymmetric: product showcase on the left, auth panel on the
 * right. Depth comes from two very soft corner pools and one real shadow -
 * there is no grid and no texture, because on a light canvas those read as
 * noise rather than craft.
 *
 * Colours are MEASURED against the #F8FAFC canvas, not eyeballed:
 *
 *   slate-900  17.11:1   headings
 *   slate-600   7.26:1   body copy
 *   slate-500   4.56:1   muted copy - the LIGHTEST text allowed here
 *   slate-400   2.46:1   decorative ONLY: icons, rules, placeholders
 *   blue-600    4.95:1   links and accents
 *
 * The button gradient was checked at BOTH ends, the check a gradient fill
 * otherwise fails at its lightest stop: white on blue-600 is 5.17:1 and on
 * indigo-600 6.29:1, so the label is compliant across the whole ramp.
 *
 * No `dark:` utilities anywhere: tailwind.config.js declares no `darkMode`
 * key, so Tailwind falls back to `media` and a stray dark class would fire off
 * the viewer's OS setting rather than any decision made here.
 */

/**
 * Every colour on this page, in one place.
 *
 * This screen has been re-themed repeatedly - light, dark, light again - and
 * each pass meant hunting the same values through ~400 lines of JSX. The slots
 * below are semantic ("canvas", "muted", "fieldFocus"), so swapping the palette
 * is editing this object rather than rewriting the component.
 *
 * ── THE ONE RULE ──────────────────────────────────────────────────────────
 * Every value must be a COMPLETE, LITERAL Tailwind class string.
 *
 * Tailwind generates CSS by scanning source files for class names as plain
 * text. It cannot evaluate expressions, so a constructed name like
 * `text-${tone}-600` or `bg-slate-${n}` produces NO CSS at all - the class
 * lands in the DOM and silently does nothing. Write the whole string, even
 * when that means repeating a prefix.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Contrast is MEASURED against the #F8FAFC canvas, not eyeballed:
 *
 *   slate-900  17.11:1   headings
 *   slate-600   7.26:1   body copy
 *   slate-500   4.56:1   muted copy - the LIGHTEST text allowed here
 *   slate-400   2.46:1   decorative ONLY: icons, rules, placeholders
 *   blue-600    4.95:1   links and accents
 *
 * The button gradient is checked at BOTH ends - the check a gradient fill
 * otherwise fails at its lightest stop: white on blue-600 is 5.17:1 and on
 * indigo-600 6.29:1, so the label clears AA across the whole ramp.
 */
const THEME = {
  /* ---------------------------------------------------------- canvas --- */
  canvas: 'bg-[#FAFAFB]',

  /* ------------------------------------------------------------ text --- */
  heading: 'text-slate-900',
  body: 'text-slate-600',
  muted: 'text-slate-500',
  /** Decorative only - fails AA for text on this canvas. */
  faint: 'text-slate-400',
  label: 'text-slate-700',
  link: 'text-blue-600 hover:text-blue-700',
  /** The headline's accent run. */
  gradientText: 'bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent',

  /* --------------------------------------------------------- surfaces --- */
  authCard:
    'border border-slate-200/70 bg-white/85 shadow-[0_25px_60px_-15px_rgba(37,99,235,0.14)] backdrop-blur-2xl',
  /*
   * The glass is carried by the BORDER and the SHADOW, not the blur.
   *
   * `backdrop-blur-xl` over a near-white canvas has almost nothing to refract,
   * so on its own it would be invisible. What reads as glass here is the
   * white/80 hairline catching the ambient pools behind it, plus a blue-tinted
   * shadow - the blur only softens whatever glow passes underneath.
   */
  featureCard:
    'border border-white/80 bg-white/75 shadow-[0_10px_30px_rgba(37,99,235,0.06)] backdrop-blur-xl ' +
    'hover:-translate-y-1 hover:border-blue-400/40 hover:shadow-[0_20px_40px_rgba(37,99,235,0.12)]',
  featureIcon:
    'bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600 ring-1 ring-inset ring-blue-100 group-hover:from-blue-100 group-hover:to-indigo-100',
  badge: 'border border-blue-200/70 bg-white shadow-sm shadow-blue-900/5 ring-4 ring-blue-500/[0.06]',
  divider: 'bg-slate-200',

  /* ----------------------------------------------------------- fields --- */
  field: 'bg-slate-50/80 text-slate-900 placeholder:text-slate-400',
  fieldIdle:
    'border-slate-200/80 hover:border-slate-300 focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-500/15',
  fieldError: 'border-rose-300 bg-rose-50/60 focus:border-rose-400 focus:bg-white focus:ring-4 focus:ring-rose-500/10',
  fieldIconIdle: 'text-slate-400',
  fieldIconError: 'text-rose-400',
  errorText: 'text-rose-600',
  errorBanner: 'border border-rose-200 bg-rose-50 text-rose-700',
  reveal: 'text-slate-400 hover:bg-slate-100 hover:text-slate-700',

  /* -------------------------------------------------------------- tabs --- */
  tabBar: 'border border-white/80 bg-white/70 shadow-[0_10px_30px_rgba(37,99,235,0.06)] backdrop-blur-xl',
  tabIdle: 'text-slate-500 hover:bg-white/80 hover:text-slate-900 hover:shadow-sm',
  tabActive: 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20',
  panelCard: 'border border-white/80 bg-white/75 shadow-[0_10px_30px_rgba(37,99,235,0.06)] backdrop-blur-xl',
  accentChip: 'border border-blue-200/70 bg-blue-50 text-blue-700',

  /* ----------------------------------------------------------- button --- */
  button:
    'bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-600 text-white shadow-lg shadow-blue-500/30 ' +
    'hover:scale-[1.01] hover:shadow-xl hover:shadow-blue-500/40',
} as const;

const FEATURES = [
  {
    /*
     * `Activity`, not `Zap`. Zap now belongs exclusively to the bench pipeline
     * card in Specs & Automation - reusing it here would visually re-link the
     * two panels this split exists to separate.
     */
    icon: Activity,
    title: 'Real-time defect lifecycle & triage',
    text: 'End-to-end visibility from initial logging through verification to sign-off, so no defect lands in a ghost state and triage is clear at a glance.',
  },
  {
    icon: Target,
    title: 'Role-driven workflow engine',
    text: 'Tailored execution queues for QA, developers and product leads. Every user sees exact actionable items, without noise or clutter.',
  },
  {
    icon: ShieldCheck,
    title: 'Dynamic ownership & assignment',
    text: 'Defects route automatically to designated module owners based on component architecture, ensuring rapid triage and resolution.',
  },
];

/**
 * Deliberately permissive: it rejects the shapes that are certainly wrong
 * (blank, no `@`, no dot in the domain, embedded spaces) and lets everything
 * else through to the server.
 *
 * A stricter regex is the wrong trade. This exists to save a pointless round
 * trip and put the error beside the field, NOT to decide what a valid address
 * is - RFC 5322 allows addresses most "clever" patterns reject, and the only
 * authority on whether an account exists is Bugzilla.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* `pl-11` reserves the lead icon's gutter. */
/* Geometry stays here; colour comes from THEME. `pl-11` reserves the lead
   icon's gutter. */
const FIELD_BASE = cn(
  'h-12 w-full rounded-xl border pl-11 text-sm font-medium placeholder:font-normal',
  'outline-none transition-[background-color,border-color,box-shadow] duration-premium ease-premium',
  THEME.field
);

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
   * Presence only, deliberately. There is no length or complexity rule here
   * because the password being checked was set in Bugzilla - possibly years
   * ago, under whatever policy applied then. A client-side "at least N
   * characters" would refuse to even attempt a password that is genuinely
   * correct, and the user could not tell "this app will not send it" from
   * "the server rejected it".
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
     * Validate before the request. A malformed address cannot succeed, and
     * sending it anyway spends one of the attempts the rate limiter allows for
     * this (IP, account) pair - someone fixing a typo should not be moved
     * closer to a lockout by it.
     *
     * Both checks run before either result is acted on: guarding with `&&`
     * would short-circuit and leave an empty password unreported until the
     * address was fixed and the form submitted a second time.
     */
    const emailOk = validateEmail(login);
    const passwordOk = validatePassword(password);
    if (!emailOk || !passwordOk) {
      // Focus the first field needing attention. This also announces the
      // message to a screen reader, which a visual-only error does not.
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
    <div className={cn('relative min-h-screen overflow-hidden', THEME.canvas)}>
      <LoginBackdrop />

      <motion.main
        variants={listVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 mx-auto grid min-h-screen max-w-[1220px] grid-cols-1 items-center gap-14 px-6 py-14 sm:px-10 lg:grid-cols-[1.1fr_minmax(0,27rem)] lg:gap-20 lg:py-0"
      >
        <Showcase />

        <motion.section variants={pageVariants} className="w-full justify-self-center lg:justify-self-end">
          <form
            onSubmit={onSubmit}
            /*
             * `noValidate` hands validation to this component alone. Without it
             * the browser's own bubble fires first on `type="email"`, in its own
             * wording and position, and the message below never renders - two
             * validators disagreeing about the same field.
             */
            noValidate
            className={cn('rounded-3xl p-8 sm:p-10', THEME.authCard)}
          >
            <div className="mb-7">
              <h1 className={cn('font-display text-2xl font-bold tracking-tight', THEME.heading)}>Welcome back</h1>
              <p className={cn('mt-1.5 text-sm', THEME.muted)}>Sign in to your Bug Tracker workspace.</p>
            </div>

            <div className="flex flex-col gap-4">
              {/* ---- email ---- */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="login-email" className={cn('text-xs font-semibold', THEME.label)}>
                  Email
                </label>
                <div className="relative">
                  <Mail
                    className={cn(
                      'pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors',
                      emailError ? THEME.fieldIconError : THEME.fieldIconIdle
                    )}
                    aria-hidden
                  />
                  <input
                    id="login-email"
                    ref={emailRef}
                    /* `name` is not used by the current Playwright suite, which
                       selects by label and by the error ids below - but a login
                       field should carry one regardless: password managers key
                       their autofill off it. */
                    name="email"
                    type="email"
                    autoComplete="username"
                    value={login}
                    onChange={(e) => {
                      setLogin(e.target.value);
                      // Re-check only once an error is showing, so it clears as
                      // soon as it is fixed but never appears mid-typing.
                      if (emailError) validateEmail(e.target.value);
                    }}
                    onBlur={() => login && validateEmail(login)}
                    placeholder="you@example.com"
                    autoFocus
                    aria-invalid={emailError ? true : undefined}
                    aria-describedby={emailError ? 'login-email-error' : undefined}
                    className={cn(FIELD_BASE, 'pr-4', emailError ? THEME.fieldError : THEME.fieldIdle)}
                  />
                </div>
                {emailError && (
                  <p id="login-email-error" className={cn('text-xs font-medium', THEME.errorText)}>
                    {emailError}
                  </p>
                )}
              </div>

              {/* ---- password ---- */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between">
                  <label htmlFor="login-password" className={cn('text-xs font-semibold', THEME.label)}>
                    Password
                  </label>
                  {/* Beside the label, not under the button: it is read while
                      the password is being recalled, not after a failure. */}
                  <Link
                    to="/forgot-password"
                    className={cn('focus-ring rounded text-xs font-medium transition-colors', THEME.link)}
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Lock
                    className={cn(
                      'pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors',
                      passwordError ? THEME.fieldIconError : THEME.fieldIconIdle
                    )}
                    aria-hidden
                  />
                  <input
                    id="login-password"
                    ref={passwordRef}
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      // No onBlur counterpart: presence is the only rule, so
                      // blurring an empty box would flag it the moment someone
                      // tabbed past on the way to the reveal toggle.
                      if (passwordError) validatePassword(e.target.value);
                    }}
                    placeholder="••••••••"
                    aria-invalid={passwordError ? true : undefined}
                    aria-describedby={passwordError ? 'login-password-error' : undefined}
                    className={cn(FIELD_BASE, 'pr-12', passwordError ? THEME.fieldError : THEME.fieldIdle)}
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
                    className={cn('focus-ring absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 transition-colors', THEME.reveal)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                  </button>
                </div>
                {passwordError && (
                  <p id="login-password-error" className={cn('text-xs font-medium', THEME.errorText)}>
                    {passwordError}
                  </p>
                )}
              </div>

              {/* ---- server-side result ---- */}
              {serverError && (
                <p
                  role="alert"
                  className={cn('flex items-start gap-2.5 rounded-xl p-3.5 text-sm leading-relaxed', THEME.errorBanner)}
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>{serverError}</span>
                </p>
              )}

              {/* The arrow slides via `transform` on a child, so it composites
                  on the GPU and never reflows the label beside it. */}
              <button
                type="submit"
                disabled={busy}
                className={cn(
                  'focus-ring group mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl',
                  'text-sm font-semibold transition-all duration-200 ease-premium active:scale-[0.98]',
                  THEME.button,
                  'disabled:cursor-not-allowed disabled:opacity-60'
                )}
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight
                      className="h-4 w-4 transition-transform duration-premium ease-premium group-hover:translate-x-1"
                      aria-hidden
                    />
                  </>
                )}
              </button>
            </div>
          </form>

          {/*
            Accurate as written: the BFF keeps sessions server-side (an opaque
            signed cookie, never the Bugzilla token - see lib/sessionStore.ts),
            and every route is gated by the caller's Bugzilla groups.
          */}
          <p className={cn('mt-5 text-center text-xs', THEME.muted)}>
            Protected by enterprise session &amp; RBAC middleware
          </p>
        </motion.section>
      </motion.main>
    </div>
  );
}

/**
 * The left column: lockup, headline, and three feature cards.
 *
 * Hidden below `lg`. On a phone the form is the only thing that matters, and a
 * product showcase above it just pushes the password field off the fold.
 */
type TabId = 'overview' | 'why-bugzilla' | 'specs';

const TABS: Array<{ id: TabId; label: string; icon: typeof Rocket }> = [
  { id: 'overview', label: 'Platform overview', icon: Rocket },
  { id: 'why-bugzilla', label: 'About', icon: Info },
  { id: 'specs', label: 'Specs & automation', icon: Zap },
];

/**
 * The left column: a three-tab product showcase.
 *
 * Hidden below `lg`. On a phone the form is the only thing that matters, and a
 * showcase above it would push the password field off the fold - so the tabs
 * are never rendered there rather than being stacked and scrolled past.
 */
function Showcase() {
  const [tab, setTab] = useState<TabId>('overview');

  return (
    <motion.section variants={pageVariants} className="hidden lg:block">
      {/*
        The real brand asset on white. `ueducate-logo.png` carries a charcoal
        wordmark measured for white backgrounds (docs/BRANDING.md), so this canvas
        suits it exactly - no chip or re-tinting needed, unlike on a dark one.
      */}
      <div className={cn('inline-flex items-center gap-3 rounded-full px-4 py-2', THEME.badge)}>
        <UEducateLogo height={22} />
        <span className={cn('h-4 w-px', THEME.divider)} aria-hidden />
        {/* Text only here. At 20px the mark was squeezed between a rule and a
            tracked-out caption, reading as clutter rather than as a brand -
            it gets a proper showcase in the "Why Bugzilla?" tab instead. */}
        <span className={cn('text-2xs font-semibold uppercase tracking-[0.12em]', THEME.muted)}>
          Bugzilla reimagined · Enterprise defect tracker
        </span>
      </div>

      {/*
        A real tablist: `role="tablist"` plus `aria-selected` and `aria-controls`
        on each trigger, so the group is announced as tabs rather than as three
        unrelated buttons. Native buttons keep Space and Enter working for free.
      */}
      <div
        role="tablist"
        aria-label="Product showcase"
        className={cn('mt-8 inline-flex items-center gap-1 rounded-full p-1', THEME.tabBar)}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            id={`showcase-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`showcase-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn(
              'focus-ring inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-all duration-premium ease-premium',
              tab === t.id ? THEME.tabActive : THEME.tabIdle
            )}
          >
            <t.icon className="h-3.5 w-3.5" aria-hidden />
            {t.label}
          </button>
        ))}
      </div>

      {/*
        `key={tab}` restarts the entrance on every switch, so the panel animates
        in rather than its text swapping underneath a static box.
        `min-h` holds the column height steady across tabs of different lengths -
        without it the auth card beside this jumps as you switch.
      */}
      <motion.div
        key={tab}
        role="tabpanel"
        id={`showcase-panel-${tab}`}
        aria-labelledby={`showcase-tab-${tab}`}
        variants={pageVariants}
        initial="hidden"
        animate="visible"
        className="mt-8 min-h-[27rem]"
      >
        {tab === 'overview' && <OverviewPanel />}
        {tab === 'why-bugzilla' && <WhyBugzillaPanel />}
        {tab === 'specs' && <SpecsPanel />}
      </motion.div>
    </motion.section>
  );
}

function OverviewPanel() {
  return (
    <>
      <h2 className={cn('max-w-[16ch] font-display text-[2.6rem] font-extrabold leading-[1.07] tracking-[-0.03em]', THEME.heading)}>
        {/*
          `pb-[0.08em]` is functional, not spacing: `bg-clip-text` crops to the
          glyph box and would otherwise shave the descender on "g".
        */}
        <span className={cn('pb-[0.08em]', THEME.gradientText)}>Modern defect intelligence</span> for
        high-velocity teams.
      </h2>
      <p className={cn('mt-5 max-w-md text-md leading-relaxed', THEME.body)}>
        The speed and visual elegance of Linear, backed by the industrial reliability of Bugzilla.
      </p>

      <ul className="mt-8 flex max-w-lg flex-col gap-3">
        {FEATURES.map((f) => (
          <li
            key={f.title}
            className={cn('group flex items-start gap-4 rounded-2xl p-5 transition-all duration-300 ease-out', THEME.featureCard)}
          >
            <span className={cn('mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors', THEME.featureIcon)}>
              <f.icon className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className={cn('block text-sm font-semibold', THEME.heading)}>{f.title}</span>
              {/* slate-500, not slate-400: on this canvas slate-400 measures
                  2.46:1 and is decorative only. */}
              <span className={cn('mt-1 block text-xs leading-relaxed', THEME.muted)}>{f.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * The four pillars.
 *
 * Each is a claim about software this team actually runs, so each is one they
 * could be asked to defend:
 *
 *   State integrity  - Bugzilla validates transitions against `status_workflow`
 *                      and refuses one that is not defined. We hit this
 *                      ourselves: REOPENED is not configured here, so the
 *                      engine rejects the move rather than half-applying it.
 *   RBAC             - group membership gates products and bugs; the BFF reads
 *                      the same groups rather than keeping a second model.
 *   Audit log        - every field change lands in `bugs_activity` with who and
 *                      when. It is what we queried to prove no open bug had
 *                      ever been reassigned.
 *   Architecture     - the BFF speaks Bugzilla's API; no schema is forked and
 *                      no data lives outside it.
 */
const BUGZILLA_PILLARS = [
  {
    icon: Lock,
    title: 'Uncompromising state integrity',
    text: 'Strict workflow validation refuses a transition the instance does not define, so a defect cannot land in a ghost state. Once a bench failure is logged, its lifecycle is complete and ordered.',
  },
  {
    icon: Users,
    title: 'Granular enterprise RBAC',
    text: 'Group-level access decides which products and defects each person can reach. Developers, testers and admins see exactly their own scope — enforced by the engine, not by hidden buttons.',
  },
  {
    icon: ScrollText,
    title: 'Complete field-level audit log',
    text: 'A time-stamped record of every edit, attachment, priority change and status move, attributed to the account that made it, for the whole life of the defect.',
  },
  {
    icon: Zap,
    title: 'Open architecture, modern BFF',
    text: 'Legacy Perl rendering is replaced by a Node.js BFF and React UI, with per-user caching that collapses repeated round trips. Bugzilla stays the system of record — no forked schema, no vendor lock-in.',
  },
];

function WhyBugzillaPanel() {
  return (
    <>
      {/*
        Hero banner: emblem left, headline right.

        `sm:grid-cols-[auto_minmax(0,1fr)]` rather than two equal columns - the
        emblem card is a fixed size, so giving it half the width would strand it
        in whitespace while the copy beside it wrapped early. `auto` takes
        exactly what it needs and hands the rest to the text.
      */}
      <div className={cn('grid grid-cols-1 items-center gap-6 rounded-3xl p-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:p-7', THEME.panelCard)}>
        {/*
          The official mark, inlined unmodified from bugzilla.org's own header
          asset - see the trademark note in BugzillaMark.tsx.

          On a WHITE plate deliberately: the artwork carries its own colours,
          and tinting the surface behind it would change how the mark reads.
          The blue glow sits on the card, never on the logo.
        */}
        <div className="grid h-[8.5rem] w-[8.5rem] shrink-0 place-items-center rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-blue-500/10">
          <BugzillaMark height={88} />
        </div>

        <div className="min-w-0">
          <span className={cn('inline-block rounded-full px-3 py-1 text-2xs font-semibold uppercase tracking-[0.12em]', THEME.accentChip)}>
            Powered by the Bugzilla engine
          </span>
          <h3 className={cn('mt-3 font-display text-2xl font-extrabold leading-tight tracking-[-0.02em]', THEME.heading)}>
            The industrial core behind our{' '}
            {/* `pb-[0.08em]`: `bg-clip-text` crops to the glyph box and would
                otherwise shave the descender on "p". */}
            <span className={cn('pb-[0.08em]', THEME.gradientText)}>defect platform</span>
          </h3>
          <p className={cn('mt-2.5 text-xs leading-relaxed', THEME.muted)}>
            Why engineering teams trust Bugzilla as the single source of truth for software quality.
          </p>
        </div>
      </div>

      {/* 2x2 on anything wide enough; a single column below, where two
          cards side by side would leave the text two or three words wide. */}
      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {BUGZILLA_PILLARS.map((pillar) => (
          <li
            key={pillar.title}
            className={cn('group rounded-2xl p-5 transition-all duration-300 ease-out', THEME.featureCard)}
          >
            <span className={cn('mb-3 flex h-9 w-9 items-center justify-center rounded-xl transition-colors', THEME.featureIcon)}>
              <pillar.icon className="h-[17px] w-[17px]" aria-hidden />
            </span>
            <p className={cn('text-sm font-semibold', THEME.heading)}>{pillar.title}</p>
            <p className={cn('mt-1.5 text-xs leading-relaxed', THEME.muted)}>{pillar.text}</p>
          </li>
        ))}
      </ul>

      <div className={cn('mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold', THEME.accentChip)}>
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        100% Bugzilla reliability, reimagined for high-velocity engineering teams
      </div>
    </>
  );
}

/**
 * Specifications.
 *
 * Every figure here was read out of this codebase rather than written to sound
 * impressive: 3 concurrent devices is MAX_SESSIONS_PER_USER, and the 5-minute
 * cooldown after 10 failures is LOGIN_LOCKOUT_MS / LOGIN_MAX_FAILURES. Nothing
 * on this panel is a claim the team could not defend if asked.
 */
const SPECS = [
  {
    icon: Zap,
    title: 'Test bench pipeline',
    text: 'Automated API and UI test suites log failures directly into the defect tracker, fully classified with stack traces and logs.',
  },
  {
    icon: Database,
    title: 'Zero-triage classification',
    text: 'Stack traces, request payloads and environment context are mapped into the Bugzilla schema on arrival and attached to the defect as evidence.',
  },
  {
    icon: ShieldCheck,
    title: 'RBAC & session security',
    text: 'Server-side sessions holding an opaque cookie - never a Bugzilla token - capped at 3 concurrent devices, with a 5-minute cooldown after 10 failed sign-ins per device and account.',
  },
];

function SpecsPanel() {
  return (
    <>
      <h2 className={cn('max-w-[18ch] font-display text-[2.4rem] font-extrabold leading-[1.08] tracking-[-0.03em]', THEME.heading)}>
        From bench failure to{' '}
        <span className={cn('pb-[0.08em]', THEME.gradientText)}>triaged defect</span>, automatically.
      </h2>

      <ul className="mt-7 flex max-w-lg flex-col gap-3">
        {SPECS.map((spec) => (
          <li
            key={spec.title}
            className={cn('group flex items-start gap-4 rounded-2xl p-5 transition-all duration-300 ease-out', THEME.featureCard)}
          >
            <span className={cn('mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors', THEME.featureIcon)}>
              <spec.icon className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className={cn('block text-sm font-semibold', THEME.heading)}>{spec.title}</span>
              <span className={cn('mt-1 block text-xs leading-relaxed', THEME.muted)}>{spec.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
