import { ArrowRight, Boxes, Eye, Gauge, History, Link2, ListChecks, PenLine, RotateCcw, UserRound, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useBugActivity } from '../../api/hooks';
import { cn, formatDateTime, timeAgo } from '../../lib/utils';
import type { ActivityChange, ActivityChangeKind, ActivityEntry, JourneyStep } from '../../types';
import { Avatar } from '../ui/Avatar';
import { Card, CardBody, CardHeader, CardTitle } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';
import { StatusPill } from '../ui/Pill';

/**
 * The bug's activity - every recorded change, who made it and when - the way
 * Mantis's "Bug History" showed it, read from Bugzilla's own change log.
 *
 * Two views of the same log:
 *
 *   1. The journey: the status story as a row of steps (Filed -> Confirmed ->
 *      Resolved (FIXED) -> Reopened -> Resolved (FIXED) -> Verified), each with
 *      who and when, so "fixed, reopened by QA, fixed again" reads at a glance.
 *      Reopen steps are marked, and a count says how many times it bounced.
 *
 *   2. The timeline: every save, newest first, each change as "field: old ->
 *      new". "Key changes" (status, resolution, assignee, placement, severity
 *      and priority) is the default; "All changes" adds tags, CC, links, etc.
 */

const KEY_KINDS = new Set<ActivityChangeKind>(['status', 'resolution', 'assignee', 'placement', 'priority']);

const KIND_ICON: Record<ActivityChangeKind, typeof History> = {
  status: ListChecks,
  resolution: ListChecks,
  assignee: UserRound,
  placement: Boxes,
  priority: Gauge,
  people: Users,
  text: PenLine,
  link: Link2,
  visibility: Eye,
  other: PenLine,
};

/** Statuses that mean "the fix is in", and the one that means "it came back". */
const DONE = new Set(['RESOLVED', 'VERIFIED', 'CLOSED']);
const isReopen = (step: JourneyStep, prev?: JourneyStep) =>
  step.status === 'REOPENED' || (prev !== undefined && DONE.has(prev.status) && !DONE.has(step.status));

export function BugActivity({ bugId }: { bugId: number }) {
  const { data, isLoading, isError } = useBugActivity(bugId);
  const [view, setView] = useState<'key' | 'all'>('key');
  const [showAll, setShowAll] = useState(false);

  const entries = useMemo(() => {
    const list = data?.entries ?? [];
    if (view === 'all') return list;
    return list
      .map((e) => ({ ...e, changes: e.changes.filter((c) => KEY_KINDS.has(c.kind)) }))
      .filter((e) => e.changes.length > 0);
  }, [data, view]);

  const reopenCount = useMemo(
    () => (data?.journey ?? []).filter((step, i, all) => i > 0 && isReopen(step, all[i - 1])).length,
    [data]
  );

  const LIMIT = 8;
  const visible = showAll ? entries : entries.slice(0, LIMIT);

  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 items-center gap-2">
          <History className="h-4 w-4 text-brand-600" aria-hidden />
          <CardTitle>Activity</CardTitle>
          {data && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-2xs font-semibold text-slate-600">{data.entries.length}</span>}
          {reopenCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-2xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/15">
              <RotateCcw className="h-3 w-3" aria-hidden />
              Reopened {reopenCount}×
            </span>
          )}
        </div>
        <div className="flex shrink-0 rounded-lg bg-slate-100 p-0.5 text-xs font-medium" role="tablist" aria-label="Which changes to show">
          {(['key', 'all'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn(
                'focus-ring rounded-md px-2.5 py-1 transition-colors',
                view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              )}
            >
              {v === 'key' ? 'Key changes' : 'All changes'}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardBody className="flex flex-col gap-5">
        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-10 rounded-xl" />
          </div>
        ) : isError || !data ? (
          <p className="text-sm text-slate-500">The activity for this bug could not be loaded.</p>
        ) : (
          <>
            <Journey steps={data.journey} />

            {entries.length === 0 ? (
              <p className="text-sm text-slate-500">
                {data.entries.length === 0 ? 'No changes yet - the bug is as it was filed.' : 'No key changes yet. Switch to "All changes" to see the rest.'}
              </p>
            ) : (
              <ol className="relative flex flex-col">
                {/* the timeline rail */}
                <span aria-hidden className="absolute bottom-3 left-[17.5px] top-3 w-px bg-slate-200" />
                {visible.map((entry, i) => (
                  <TimelineEntry key={`${entry.when}-${entry.who}-${i}`} entry={entry} />
                ))}
                <li className="relative flex items-center gap-3 pl-0 pt-1">
                  <span className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-slate-200">
                    <span className="h-2 w-2 rounded-full bg-slate-300" />
                  </span>
                  <p className="text-xs text-slate-500">
                    Filed by <span className="font-medium text-slate-700">{data.created.whoName}</span> ·{' '}
                    <time dateTime={data.created.when} title={formatDateTime(data.created.when)}>
                      {formatDateTime(data.created.when)}
                    </time>
                  </p>
                </li>
              </ol>
            )}

            {entries.length > LIMIT && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="focus-ring self-start rounded px-1 text-xs font-medium text-brand-700 hover:underline"
              >
                {showAll ? 'Show fewer' : `Show all ${entries.length} changes`}
              </button>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

/** The status story as a row of steps, wrapping on narrow screens. */
function Journey({ steps }: { steps: JourneyStep[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="rounded-xl border border-hairline bg-slate-50/60 p-3">
      <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-slate-500">Status journey</p>
      <ol className="flex flex-wrap items-start gap-x-1.5 gap-y-3">
        {steps.map((step, i) => {
          const reopened = i > 0 && isReopen(step, steps[i - 1]);
          return (
            <li key={`${step.when}-${i}`} className="flex items-start gap-1.5">
              {i > 0 && <ArrowRight className="mt-1.5 h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />}
              <div
                className={cn(
                  'flex flex-col gap-1 rounded-lg px-2 py-1.5',
                  reopened && 'bg-rose-50 ring-1 ring-inset ring-rose-600/15'
                )}
                title={`${step.status}${step.resolution && DONE.has(step.status) ? ` (${step.resolution})` : ''} - ${step.whoName}, ${formatDateTime(step.when)}`}
              >
                <span className="flex items-center gap-1">
                  {i === 0 && (
                    <span className="rounded-md bg-white px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-inset ring-slate-900/10">
                      Filed
                    </span>
                  )}
                  <StatusPill status={step.status} />
                  {step.resolution && DONE.has(step.status) && (
                    <span className="text-2xs font-semibold text-emerald-700">{step.resolution}</span>
                  )}
                </span>
                <span className="max-w-[9.5rem] truncate text-2xs text-slate-500">
                  {reopened && <span className="font-semibold text-rose-700">Reopened · </span>}
                  {step.whoName}
                </span>
                <time className="text-2xs text-slate-400" dateTime={step.when}>
                  {formatDateTime(step.when)}
                </time>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function TimelineEntry({ entry }: { entry: ActivityEntry }) {
  return (
    <li className="relative flex gap-3 pb-4">
      <span className="relative z-10 shrink-0 rounded-full ring-4 ring-white">
        <Avatar name={entry.whoName} size="md" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-xs text-slate-500">
          <span className="font-semibold text-slate-800">{entry.whoName}</span>{' '}
          <time dateTime={entry.when} title={formatDateTime(entry.when)}>
            · {timeAgo(entry.when)} · {formatDateTime(entry.when)}
          </time>
        </p>
        <ul className="mt-1.5 flex flex-col gap-1.5">
          {entry.changes.map((change, i) => (
            <ChangeLine key={`${change.field}-${i}`} change={change} />
          ))}
        </ul>
      </div>
    </li>
  );
}

function ChangeLine({ change }: { change: ActivityChange }) {
  const Icon = KIND_ICON[change.kind];
  const statusLike = change.kind === 'status';
  const value = (v: string, side: 'old' | 'new') => {
    if (!v) return <span className="italic text-slate-400">{side === 'old' ? 'none' : 'cleared'}</span>;
    if (statusLike) return <StatusPill status={v} />;
    return (
      <span
        className={cn(
          'break-words rounded px-1.5 py-0.5',
          side === 'old' ? 'bg-slate-100 text-slate-500 line-through decoration-slate-400/70' : 'bg-brand-50 font-medium text-slate-900'
        )}
      >
        {v}
      </span>
    );
  };
  return (
    <li className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
      <span className="inline-flex items-center gap-1 font-medium text-slate-600">
        <Icon className="h-3.5 w-3.5 text-slate-400" aria-hidden />
        {change.label}
      </span>
      {value(change.removed, 'old')}
      <ArrowRight className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />
      {value(change.added, 'new')}
    </li>
  );
}
