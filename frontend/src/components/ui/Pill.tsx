import {
  AlertOctagon,
  AlertTriangle,
  Bug,
  CheckCircle2,
  CircleDashed,
  CircleHelp,
  Compass,
  Gauge,
  Globe,
  Info,
  Lock,
  Monitor,
  MonitorSmartphone,
  Smartphone,
  Timer,
  Workflow,
} from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { cn } from '../../lib/utils';
import {
  CATEGORY_MEANING,
  PRIORITY_FOR_SEVERITY,
  SEVERITY_MEANING,
  type Category,
  type Priority,
  type Severity,
} from '../../types';

export type Tone = 'slate' | 'teal' | 'amber' | 'emerald' | 'purple' | 'violet' | 'indigo' | 'rose' | 'orange' | 'sky';

/*
 * Every tone is AA against its own background at this text size, per the
 * contrast work recorded in BRANDING.md. Severity colours stay semantic - the
 * brand palette themes the chrome, never the signals.
 *
 * Tones are assigned by AXIS, not per value, so a row reads as several distinct
 * kinds of information rather than a stripe of interchangeable blue chips:
 *
 *   Test type  teal / indigo  - which bench filed it
 *   Category   purple         - the flaw's kind
 *   Browser    neutral slate  - a mono-set label, read not scanned
 *   Status     amber -> sky -> emerald, tracking a bug's progress to done
 *   Severity   rose / orange  - the only axis allowed to shout
 *
 * LIGHT THEME ONLY. There is deliberately no `dark:` variant anywhere in this
 * file: tailwind.config.js declares no `darkMode` key, so Tailwind falls back
 * to `media` and any `dark:` class here would fire off the viewer's OS setting
 * alone - turning these pills dark inside a card, sidebar and page background
 * that have no dark styling of their own and stay light. One component
 * following the OS while the app around it does not is worse than no dark mode
 * at all. If the app ever gains a real theme toggle, add `darkMode: 'class'`
 * to the config and theme the whole shell in one pass, not this file alone.
 */
const TONE_STYLES: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
  // The app's own UEducate teal, not Tailwind's stock `teal-*`: the brand scale
  // in tailwind.config.js is the one with measured AA contrast (BRANDING.md).
  teal: 'bg-brand-50 text-brand-800 border-brand-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200/70',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200/70',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
  sky: 'bg-sky-50 text-sky-700 border-sky-200/70',
};

export function Pill({
  children,
  tone = 'slate',
  className,
  icon: Icon,
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  icon?: ComponentType<{ className?: string }>;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium leading-5',
        TONE_STYLES[tone],
        className
      )}
    >
      {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden />}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ severity */

/**
 * Colour is never the only signal.
 *
 * Each band carries a distinct glyph and its word, so the pill still reads
 * correctly in greyscale and for the ~8% of men with a colour-vision
 * deficiency - red/green alone sits exactly at the separation floor those
 * palettes fail on.
 */
const SEVERITY_STYLE: Record<Severity, { tone: Tone; icon: ComponentType<{ className?: string }> }> = {
  Critical: { tone: 'rose', icon: AlertOctagon },
  Major: { tone: 'orange', icon: AlertTriangle },
  Minor: { tone: 'sky', icon: Info },
  Trivial: { tone: 'slate', icon: Bug },
  Unclassified: { tone: 'slate', icon: CircleHelp },
};

export function SeverityPill({ severity, className }: { severity: Severity; className?: string }) {
  const { tone, icon } = SEVERITY_STYLE[severity] ?? SEVERITY_STYLE.Unclassified;
  return (
    <Pill tone={tone} icon={icon} className={className} title={SEVERITY_MEANING[severity]}>
      {severity}
    </Pill>
  );
}

/* ------------------------------------------------------------------ priority */

const PRIORITY_STYLE: Record<Priority, Tone> = {
  P0: 'rose',
  P1: 'orange',
  P2: 'sky',
  P3: 'slate',
  Unclassified: 'slate',
};

/** P0 is also written "Showstopper" in the model; the tooltip carries that. */
const PRIORITY_TITLE: Record<Priority, string> = {
  P0: 'P0 / Showstopper - fix before anything else',
  P1: 'P1 - significant loss of core functionality',
  P2: 'P2 - small functional failure or limitation',
  P3: 'P3 - cosmetic',
  Unclassified: 'Priority outside the classification model',
};

export function PriorityPill({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <Pill tone={PRIORITY_STYLE[priority] ?? 'slate'} className={cn('font-mono', className)} title={PRIORITY_TITLE[priority]}>
      {priority}
    </Pill>
  );
}

/* ------------------------------------------------------------------ category */

/*
 * Category sits on ONE hue - purple - so the axis reads as a single kind of
 * fact rather than four unrelated colours competing with Status and Severity,
 * the two axes a triager actually scans. The glyph carries the value, so the
 * four are still told apart at a glance and in greyscale.
 *
 * Unclassified is the exception: it is the absence of a category, not one of
 * them, and slate says so without claiming a place in the set.
 */
const CATEGORY_STYLE: Record<Category, { tone: Tone; icon: ComponentType<{ className?: string }> }> = {
  Functional: { tone: 'purple', icon: Workflow },
  Performance: { tone: 'purple', icon: Gauge },
  Security: { tone: 'purple', icon: Lock },
  Compatibility: { tone: 'purple', icon: MonitorSmartphone },
  Unclassified: { tone: 'slate', icon: CircleHelp },
};

export function CategoryPill({ category, className }: { category: Category; className?: string }) {
  const { tone, icon } = CATEGORY_STYLE[category] ?? CATEGORY_STYLE.Unclassified;
  return (
    <Pill tone={tone} icon={icon} className={className} title={CATEGORY_MEANING[category]}>
      {category}
    </Pill>
  );
}

/* -------------------------------------------------------------- browser */

/**
 * Which browser a defect was seen on, from the `[browser:x]` whiteboard tag the
 * UI bench writes.
 *
 * Neutral slate and monospaced, deliberately: a bug commonly names two or three
 * browsers, so this is the one cell that can hold a row of chips. Giving each
 * engine its own hue turned that row into the loudest thing on the line, over
 * Severity and Status. The engine is identified by its glyph and its name -
 * which is what a reader actually reads here - while the colour budget goes to
 * the axes that rank work.
 */
const BROWSER_STYLE: Record<string, { label: string; icon: ComponentType<{ className?: string }> }> = {
  chromium: { label: 'Chromium', icon: Monitor },
  'mobile-chrome': { label: 'Mobile Chrome', icon: Smartphone },
  firefox: { label: 'Firefox', icon: Globe },
  webkit: { label: 'WebKit / Safari', icon: Compass },
};

export function BrowserPill({ browser, className }: { browser: string; className?: string }) {
  // An unrecognised project name still renders, under its own raw name — a new
  // Playwright project should show up rather than silently vanish.
  const style = BROWSER_STYLE[browser] ?? { label: browser, icon: MonitorSmartphone };
  return (
    <Pill tone="slate" icon={style.icon} className={cn('font-mono', className)} title={`Observed on ${style.label}`}>
      {style.label}
    </Pill>
  );
}

/* ------------------------------------------------------------- test type */

/**
 * Which bench filed the bug — "UI Automation" or "API Automation".
 *
 * This is NOT a field Bugzilla stores, and it is not the `Category` axis
 * (Functional / Performance / Security / Compatibility) despite both being
 * asked for under that name. The bench a bug came from IS its product: the UI
 * bench files into "KPost UI", the API bench into "KPost API". So the label is
 * derived from the product rather than invented as a fifth category.
 *
 * Matching is on the product NAME, which is fine for a display badge and would
 * not be fine for a filter — an unrecognised product falls back to showing its
 * own name in neutral slate rather than being mislabelled as one of the two.
 * That is why the Browser *filter* is gated on browser data instead of on this.
 *
 * "KPost Admin" is an API bench too (it drives APIRequestContext, no browser),
 * but its name carries neither "API" nor "UI", so it is matched explicitly.
 * The UI test runs first, so a hypothetical "Admin UI" bench still reads as UI.
 */
export function TestTypePill({ product, className }: { product: string; className?: string }) {
  if (/\bUI\b/i.test(product)) {
    return (
      <Pill tone="teal" icon={MonitorSmartphone} className={className} title={`${product} — browser-driven UI suite`}>
        UI Automation
      </Pill>
    );
  }
  if (/\bAPI\b/i.test(product) || /\bAdmin\b/i.test(product)) {
    return (
      <Pill tone="indigo" icon={Workflow} className={className} title={`${product} — REST API suite`}>
        API Automation
      </Pill>
    );
  }
  return (
    <Pill tone="slate" className={className} title={product}>
      {product}
    </Pill>
  );
}

/**
 * Every browser a bug was seen on. Renders nothing when the list is empty —
 * API-bench bugs carry no browser tag, and a blank chip would read as "browser
 * unknown" rather than "not applicable to this product".
 */
export function BrowserPills({ browsers, className }: { browsers: string[]; className?: string }) {
  if (browsers.length === 0) return null;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {browsers.map((b) => (
        <BrowserPill key={b} browser={b} />
      ))}
    </span>
  );
}

/* --------------------------------------------------- status */

/**
 * Status is the one axis with a natural ORDER, so its colours track progress
 * toward done rather than labelling each value independently:
 *
 *   needs attention (amber) -> being worked (sky) -> finished (emerald)
 *
 * UNCONFIRMED stays slate because it is the absence of triage, not a stage of
 * it. VERIFIED shares emerald with RESOLVED - both are "done" to anyone
 * scanning a list, and the word still separates them.
 */
export const STATUS_TONE: Record<string, Tone> = {
  UNCONFIRMED: 'slate',
  CONFIRMED: 'amber',
  NEW: 'amber',
  IN_PROGRESS: 'sky',
  ASSIGNED: 'sky',
  REOPENED: 'amber',
  RESOLVED: 'emerald',
  VERIFIED: 'emerald',
  CLOSED: 'emerald',
};

/** Colour is never the only signal - each stage carries its own glyph too. */
const STATUS_ICON: Record<string, ComponentType<{ className?: string }>> = {
  UNCONFIRMED: CircleDashed,
  CONFIRMED: AlertTriangle,
  NEW: AlertTriangle,
  IN_PROGRESS: Timer,
  ASSIGNED: Timer,
  REOPENED: AlertTriangle,
  RESOLVED: CheckCircle2,
  VERIFIED: CheckCircle2,
  CLOSED: CheckCircle2,
};

export function StatusPill({ status }: { status: string }) {
  return (
    <Pill tone={STATUS_TONE[status] ?? 'slate'} icon={STATUS_ICON[status] ?? CircleDashed}>
      {status.replace('_', ' ')}
    </Pill>
  );
}

/**
 * Severity and priority are one paired axis, so the two pills belong together
 * wherever a bug is summarised.
 */
export function ClassificationPills({ severity, priority }: { severity: Severity; priority?: Priority }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <SeverityPill severity={severity} />
      <PriorityPill priority={priority ?? PRIORITY_FOR_SEVERITY[severity]} />
    </span>
  );
}

/* ------------------------------------------- Bugzilla's own raw vocabulary
 *
 * The admin screens list Bugzilla's native field values (blocker/critical/...,
 * Highest/High/...) rather than our four bands, because that is what an admin
 * is actually editing. These tones exist for those screens only - product
 * surfaces use SeverityPill/PriorityPill above, which speak our vocabulary.
 */
export const SEVERITY_TONE: Record<string, Tone> = {
  blocker: 'rose',
  critical: 'rose',
  major: 'orange',
  // `blue` left the palette when the pill tones were reorganised by axis; the
  // middle band sits on sky, and `minor` steps down to slate so the two stay
  // distinguishable rather than collapsing onto one colour.
  normal: 'sky',
  minor: 'slate',
  trivial: 'slate',
  enhancement: 'violet',
};

export const PRIORITY_TONE_MAP: Record<string, Tone> = {
  Highest: 'rose',
  High: 'orange',
  Normal: 'sky',
  Low: 'teal',
  Lowest: 'slate',
  '---': 'slate',
};
