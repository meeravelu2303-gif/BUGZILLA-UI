import type { Source, TestType } from '../../types';
import {
  FileQuestion,
  GitPullRequest,
  Hourglass,
  Accessibility,
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
  RotateCcw,
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

const TONE_STYLES: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700 border-hairline',
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
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1 text-[0.7333rem] font-semibold leading-[14px] tracking-[0.01em]',
        TONE_STYLES[tone],
        className,
      )}
    >
      {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden />}
      {children}
    </span>
  );
}

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

const PRIORITY_STYLE: Record<Priority, Tone> = {
  P0: 'rose',
  P1: 'orange',
  P2: 'sky',
  P3: 'slate',
  Unclassified: 'slate',
};

const PRIORITY_TITLE: Record<Priority, string> = {
  P0: 'P0 / Showstopper - fix before anything else',
  P1: 'P1 - significant loss of core functionality',
  P2: 'P2 - small functional failure or limitation',
  P3: 'P3 - cosmetic',
  Unclassified: 'Priority outside the classification model',
};

export function PriorityPill({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <Pill
      tone={PRIORITY_STYLE[priority] ?? 'slate'}
      className={cn('font-mono', className)}
      title={PRIORITY_TITLE[priority]}
    >
      {priority}
    </Pill>
  );
}

const CATEGORY_STYLE: Record<Category, { tone: Tone; icon: ComponentType<{ className?: string }> }> = {
  Functional: { tone: 'purple', icon: Workflow },
  Performance: { tone: 'purple', icon: Gauge },
  Security: { tone: 'purple', icon: Lock },
  Compatibility: { tone: 'purple', icon: MonitorSmartphone },
  Accessibility: { tone: 'purple', icon: Accessibility },
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

const BROWSER_STYLE: Record<string, { label: string; icon: ComponentType<{ className?: string }> }> = {
  chromium: { label: 'Chromium', icon: Monitor },
  'mobile-chrome': { label: 'Mobile Chrome', icon: Smartphone },
  firefox: { label: 'Firefox', icon: Globe },
  webkit: { label: 'WebKit / Safari', icon: Compass },
};

export function BrowserPill({ browser, className }: { browser: string; className?: string }) {
  const style = BROWSER_STYLE[browser] ?? { label: browser, icon: MonitorSmartphone };
  return (
    <Pill tone="slate" icon={style.icon} className={cn('font-mono', className)} title={`Observed on ${style.label}`}>
      {style.label}
    </Pill>
  );
}

/** The Browser cell for a bug that has no browser: a pill like every other cell, not a bare dash. */
export function NoBrowserPill({ testType, className }: { testType?: TestType; className?: string }) {
  if (testType === 'API') {
    return (
      <Pill
        tone="slate"
        icon={Workflow}
        className={cn('font-mono text-slate-500', className)}
        title="API test - no browser involved"
      >
        API
      </Pill>
    );
  }
  return (
    <Pill
      tone="slate"
      icon={MonitorSmartphone}
      className={cn('font-mono text-slate-500', className)}
      title="No browser recorded on this bug"
    >
      Not recorded
    </Pill>
  );
}

/** A mobile-app UI bug, with the device platforms it was seen on - shown where browsers are. */
export function MobilePill({ devices, className }: { devices?: string[]; className?: string }) {
  const names = (devices ?? []).map((device) => ({ android: 'Android', ios: 'iOS' })[device.toLowerCase()] ?? device);
  return (
    <Pill
      tone="indigo"
      icon={Smartphone}
      className={className}
      title={names.length ? `Mobile app - ${names.join(', ')}` : 'Mobile app'}
    >
      {names.length ? `Mobile · ${names.join(', ')}` : 'Mobile'}
    </Pill>
  );
}

/** Which bench filed the bug — "UI Automation" or "API Automation". */
export function TestTypePill({
  product,
  source,
  testType,
  className,
}: {
  product: string;
  source?: Source;
  testType?: TestType;
  className?: string;
}) {
  const kind: TestType =
    testType ??
    (/\bUI\b/i.test(product) ? 'UI' : /\bAPI\b/i.test(product) || /\bAdmin\b/i.test(product) ? 'API' : 'UI');
  const by: Source = source ?? 'Automation';
  const label = by === 'Automation' ? `${kind} Automation` : `Manual ${kind} test`;
  const what = kind === 'UI' ? 'the user interface' : 'the API';
  const who = by === 'Automation' ? 'filed by the test bench' : 'filed by a tester';
  if (kind === 'UI') {
    return (
      <Pill
        tone={by === 'Automation' ? 'teal' : 'amber'}
        icon={MonitorSmartphone}
        className={className}
        title={`${product} — ${what}, ${who}`}
      >
        {label}
      </Pill>
    );
  }
  return (
    <Pill
      tone={by === 'Automation' ? 'indigo' : 'violet'}
      icon={Workflow}
      className={className}
      title={`${product} — ${what}, ${who}`}
    >
      {label}
    </Pill>
  );
}

/** Every browser a bug was seen on. */
export function BrowserPills({ browsers, className }: { browsers: string[]; className?: string }) {
  if (browsers.length === 0) return null;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {browsers.map((browser) => (
        <BrowserPill key={browser} browser={browser} />
      ))}
    </span>
  );
}

/** Status is the one axis with a natural ORDER. */
export const STATUS_TONE: Record<string, Tone> = {
  UNCONFIRMED: 'slate',
  CONFIRMED: 'amber',
  NEW: 'amber',
  IN_PROGRESS: 'sky',
  ASSIGNED: 'sky',
  REOPENED: 'rose',
  PENDING_APPROVAL: 'violet',
  AWAITING_REQUIREMENT: 'indigo',
  IN_REVIEW: 'teal',
  RESOLVED: 'emerald',
  VERIFIED: 'emerald',
  CLOSED: 'emerald',
};

const STATUS_ICON: Record<string, ComponentType<{ className?: string }>> = {
  UNCONFIRMED: CircleDashed,
  CONFIRMED: AlertTriangle,
  NEW: AlertTriangle,
  IN_PROGRESS: Timer,
  ASSIGNED: Timer,
  REOPENED: RotateCcw,
  PENDING_APPROVAL: Hourglass,
  AWAITING_REQUIREMENT: FileQuestion,
  IN_REVIEW: GitPullRequest,
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

/** Severity and priority are one paired axis, so the two pills belong together wherever a bug is summarised. */
export function ClassificationPills({ severity, priority }: { severity: Severity; priority?: Priority }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <SeverityPill severity={severity} />
      <PriorityPill priority={priority ?? PRIORITY_FOR_SEVERITY[severity]} />
    </span>
  );
}

/** ------------------------------------------- Bugzilla's own raw vocabulary The admin screens list. */
export const SEVERITY_TONE: Record<string, Tone> = {
  blocker: 'rose',
  critical: 'rose',
  major: 'orange',
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
