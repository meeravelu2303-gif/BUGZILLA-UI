import { AlertOctagon, AlertTriangle, Bug, CircleHelp, Gauge, Info, Lock, MonitorSmartphone, Workflow } from 'lucide-react';
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

export type Tone = 'slate' | 'blue' | 'amber' | 'emerald' | 'violet' | 'rose' | 'orange' | 'sky';

/*
 * Every tone is AA against its own background at this text size, per the
 * contrast work recorded in BRANDING.md. Severity colours stay semantic - the
 * brand palette themes the chrome, never the signals.
 */
const TONE_STYLES: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-600/20',
  blue: 'bg-blue-50 text-blue-800 ring-blue-700/20',
  amber: 'bg-amber-50 text-amber-900 ring-amber-700/20',
  emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-700/20',
  violet: 'bg-violet-50 text-violet-800 ring-violet-700/20',
  rose: 'bg-rose-50 text-rose-800 ring-rose-700/20',
  orange: 'bg-orange-50 text-orange-900 ring-orange-700/20',
  sky: 'bg-sky-50 text-sky-800 ring-sky-700/20',
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
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONE_STYLES[tone],
        className
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
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

const CATEGORY_STYLE: Record<Category, { tone: Tone; icon: ComponentType<{ className?: string }> }> = {
  Functional: { tone: 'blue', icon: Workflow },
  Performance: { tone: 'amber', icon: Gauge },
  Security: { tone: 'violet', icon: Lock },
  Compatibility: { tone: 'emerald', icon: MonitorSmartphone },
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

/* --------------------------------------------------- status / tier (unchanged axes) */

export const STATUS_TONE: Record<string, Tone> = {
  UNCONFIRMED: 'slate',
  CONFIRMED: 'blue',
  IN_PROGRESS: 'amber',
  RESOLVED: 'emerald',
  VERIFIED: 'violet',
};

export function StatusPill({ status }: { status: string }) {
  return <Pill tone={STATUS_TONE[status] ?? 'slate'}>{status.replace('_', ' ')}</Pill>;
}

/** Tier 1 is the most business-critical module, so it reads as heavily as a blocker. */
export const TIER_TONE: Record<number, Tone> = { 1: 'rose', 2: 'orange', 3: 'sky' };

export function TierPill({ tier }: { tier: number | null }) {
  if (tier === null) return null;
  return (
    <Pill tone={TIER_TONE[tier] ?? 'slate'} title={`Business tier ${tier} of the affected module`}>
      Tier {tier}
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
  normal: 'blue',
  minor: 'sky',
  trivial: 'slate',
  enhancement: 'violet',
};

export const PRIORITY_TONE_MAP: Record<string, Tone> = {
  Highest: 'rose',
  High: 'orange',
  Normal: 'blue',
  Low: 'sky',
  Lowest: 'slate',
  '---': 'slate',
};
