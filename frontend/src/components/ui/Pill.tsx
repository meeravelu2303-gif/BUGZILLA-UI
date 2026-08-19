import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export type Tone = 'slate' | 'blue' | 'amber' | 'emerald' | 'violet' | 'rose' | 'orange' | 'sky';

const TONE_STYLES: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-600/10',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  rose: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  orange: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  sky: 'bg-sky-50 text-sky-700 ring-sky-600/20',
};

export function Pill({ children, tone = 'slate', className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
        TONE_STYLES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

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

export const SEVERITY_TONE: Record<string, Tone> = {
  blocker: 'rose',
  critical: 'rose',
  major: 'orange',
  normal: 'blue',
  minor: 'sky',
  trivial: 'slate',
  enhancement: 'violet',
};

export function SeverityPill({ severity }: { severity: string }) {
  return <Pill tone={SEVERITY_TONE[severity] ?? 'slate'}>{severity}</Pill>;
}

export const PRIORITY_TONE_MAP: Record<string, Tone> = {
  Highest: 'rose',
  High: 'orange',
  Normal: 'blue',
  Low: 'sky',
  Lowest: 'slate',
  '---': 'slate',
};

export function PriorityPill({ priority }: { priority: string }) {
  return <Pill tone={PRIORITY_TONE_MAP[priority] ?? 'slate'}>{priority}</Pill>;
}

/** Tier 1 is the most severe, so it carries the same weight as a blocker severity. */
export const TIER_TONE: Record<number, Tone> = {
  1: 'rose',
  2: 'orange',
  3: 'sky',
};

/** Renders nothing when the bug carries no `[tierN]` marker - see tierOf(). */
export function TierPill({ tier }: { tier: number | null }) {
  if (tier === null) return null;
  return <Pill tone={TIER_TONE[tier] ?? 'slate'}>Tier {tier}</Pill>;
}
