import {
  AlertOctagon,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  Clock,
  FileText,
  Inbox,
  ListTodo,
  Loader2,
  Package,
  RotateCcw,
  UserRound,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBug, useBugCounts, useBugs, useMeta, useUpdateBug } from '../../api/hooks';
import { useToast } from '../../context/ToastContext';
import { drawerVariants, listVariants, pageVariants } from '../../lib/motion';
import { bugDisplayId, cn, timeAgo } from '../../lib/utils';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { CategoryPill, PriorityPill, SeverityPill, StatusPill } from '../ui/Pill';
import { DescriptionReport } from '../bugs/DescriptionReport';
import { Skeleton } from '../ui/Skeleton';
import { StatCard } from '../ui/StatCard';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../ui/primitives/DropdownMenu';
import { SEVERITIES, type Bug, type Severity } from '../../types';

const BACKLOG_LIMIT = 50;

function bandRank(severity: Severity): number {
  const i = SEVERITIES.indexOf(severity);
  return i === -1 ? SEVERITIES.length : i;
}

const severityOf = (bug: Bug): Severity => bug.triage?.severity ?? 'Unclassified';

/** One developer's board. */
export function DeveloperDashboard({ email, name, all = false }: { email: string; name?: string; all?: boolean }) {
  const who = all ? {} : { assignedTo: email };
  const whoQueryString = all ? '' : `&assignedTo=${encodeURIComponent(email)}`;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const isSelf = !name && !all;
  const first = name?.trim().split(/\s+/)[0] ?? '';
  const labels = all
    ? {
        openBacklog: 'Open backlog',
        highSeverity: 'Top priority',
        resolved: 'Resolved',
        backlog: 'Team backlog',
        empty: 'No open bugs are assigned to any developer right now.',
      }
    : {
        openBacklog: isSelf ? 'My open backlog' : 'Open backlog',
        highSeverity: isSelf ? 'My top priority' : 'Top priority',
        resolved: isSelf ? 'Resolved by me' : `Resolved by ${first}`,
        backlog: isSelf ? 'My backlog' : `${first}'s backlog`,
        empty: isSelf
          ? 'No open bugs are assigned to you right now.'
          : `No open bugs are assigned to ${name} right now.`,
      };
  const fullListHref = isSelf ? '/my-bugs' : all ? '/bugs' : `/bugs?assignedTo=${encodeURIComponent(email)}`;

  const { data: meta } = useMeta();
  const openStatusList = (meta?.workflow ?? [])
    .filter((workflow) => workflow.isOpen)
    .map((workflowTransition) => workflowTransition.status);

  const {
    data,
    isLoading: backlogQueryLoading,
    isError,
  } = useBugs(
    {
      ...who,
      status: openStatusList,
      limit: BACKLOG_LIMIT,
      offset: 0,
      sortBy: 'importance',
      sortDir: 'asc',
    },
    { enabled: (all || email !== '') && openStatusList.length > 0 },
  );
  const isLoading = backlogQueryLoading || openStatusList.length === 0;

  const scoped = all || email !== '';

  const openStatuses = (meta?.workflow ?? [])
    .filter((workflow) => workflow.isOpen)
    .map((workflowTransition) => workflowTransition.status);
  const closedStatuses = (meta?.workflow ?? [])
    .filter((workflow) => !workflow.isOpen)
    .map((workflowTransition) => workflowTransition.status);

  const { data: myOpen } = useBugCounts(
    { ...who, status: openStatuses },
    { enabled: scoped && openStatuses.length > 0 },
  );

  const hasReopened = (meta?.statuses ?? []).includes('REOPENED');
  const { data: reopenedCounts } = useBugCounts({ ...who, status: ['REOPENED'] }, { enabled: scoped && hasReopened });

  const { data: myResolved } = useBugCounts(
    { ...who, status: closedStatuses },
    { enabled: scoped && closedStatuses.length > 0 },
  );

  const HIGH = ['blocker', 'critical'];
  const myHighSeverity =
    myOpen?.counts.urgent ?? HIGH.reduce((total, key) => total + (myOpen?.counts.bySeverity?.[key] ?? 0), 0);

  const bugs = useMemo(() => (data?.bugs ?? []).filter((bug) => bug.isOpen), [data]);

  useEffect(() => {
    if (bugs.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((current) => (current && bugs.some((bug) => bug.id === current) ? current : bugs[0].id));
  }, [bugs]);

  const grouped = useMemo(() => {
    const out = new Map<Severity, Bug[]>();
    for (const bug of [...bugs].sort((left, right) => bandRank(severityOf(left)) - bandRank(severityOf(right)))) {
      const key = severityOf(bug);
      const list = out.get(key);
      if (list) list.push(bug);
      else out.set(key, [bug]);
    }
    return [...out.entries()];
  }, [bugs]);

  return (
    <div className="space-y-6">
      <motion.div
        variants={listVariants}
        initial="hidden"
        animate="visible"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:gap-5"
      >
        <motion.div variants={pageVariants}>
          <StatCard
            label={labels.openBacklog}
            value={myOpen?.counts.total ?? 0}
            icon={Inbox}
            tone="brand"
            to={`/bugs?${openStatuses.map((openStatus) => `status=${encodeURIComponent(openStatus)}`).join('&')}${whoQueryString}`}
            hint="Active bugs to fix"
          />
        </motion.div>
        <motion.div variants={pageVariants}>
          <StatCard
            label={labels.highSeverity}
            value={myHighSeverity}
            icon={AlertOctagon}
            tone="rose"
            to={`/bugs?${openStatuses.map((openStatus) => `status=${encodeURIComponent(openStatus)}`).join('&')}&urgent=1${whoQueryString}`}
            hint="Open bugs, Critical or P0"
          />
        </motion.div>
        <motion.div variants={pageVariants}>
          <StatCard
            label="Reopened by QA"
            value={hasReopened ? (reopenedCounts?.counts.total ?? 0) : 0}
            icon={RotateCcw}
            tone="amber"
            to={(reopenedCounts?.counts.total ?? 0) > 0 ? `/bugs?status=REOPENED${whoQueryString}` : undefined}
            hint={
              hasReopened
                ? (reopenedCounts?.counts.total ?? 0) > 0
                  ? 'Needs re-investigation'
                  : 'Nothing handed back'
                : 'REOPENED not configured in Bugzilla'
            }
          />
        </motion.div>
        <motion.div variants={pageVariants}>
          <StatCard
            label={labels.resolved}
            value={myResolved?.counts.total ?? 0}
            icon={CheckCircle2}
            tone="emerald"
            to={`/bugs?${closedStatuses.map((closedStatus) => `status=${encodeURIComponent(closedStatus)}`).join('&')}${whoQueryString}&sortBy=last_change_time&sortDir=desc`}
            hint="All-time total"
          />
        </motion.div>
      </motion.div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section className={PANEL_SHELL}>
          <span aria-hidden className="h-1 shrink-0 bg-gradient-to-r from-brand-500 via-brand-400 to-ueducate-accent" />
          <header className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-600/15">
                <ListTodo className="h-4 w-4" aria-hidden />
              </span>
              <h2 className="font-display text-sm font-semibold text-slate-900">{labels.backlog}</h2>
              {!isLoading && bugs.length > 0 && (
                <span className="rounded-full bg-slate-900/[0.05] px-2 py-0.5 text-2xs font-semibold tabular-nums text-slate-600 ring-1 ring-inset ring-slate-900/10">
                  {bugs.length}
                </span>
              )}
            </div>
            <Link
              to={fullListHref}
              className="focus-ring inline-flex items-center gap-1 rounded text-xs font-medium text-brand-700 hover:text-brand-800"
            >
              Open full list <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </header>

          <div className="flex-1 overflow-y-auto">
            {isLoading && (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            )}

            {isError && (
              <p className="px-4 py-8 text-center text-sm text-slate-500">That backlog could not be loaded.</p>
            )}

            {!isLoading && !isError && bugs.length === 0 && (
              <EmptyState icon={CheckCircle2} title="Nothing assigned" description={labels.empty} />
            )}

            {grouped.map(([severity, list]) => (
              <div key={severity}>
                <div
                  className={cn(
                    'sticky top-0 z-10 flex items-center gap-2 border-b border-l-4 border-hairline px-5 py-2 backdrop-blur',
                    SEVERITY_GROUP[severity],
                  )}
                >
                  <SeverityPill severity={severity} />
                  <span className="text-2xs font-semibold tabular-nums text-slate-500">
                    {list.length} {list.length === 1 ? 'bug' : 'bugs'}
                  </span>
                </div>
                <ul>
                  {list.map((bug) => (
                    <BacklogRow
                      key={bug.id}
                      bug={bug}
                      selected={bug.id === selectedId}
                      onSelect={() => setSelectedId(bug.id)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <DetailPane bugId={selectedId} />
      </div>
    </div>
  );
}

function BacklogRow({ bug, selected, onSelect }: { bug: Bug; selected: boolean; onSelect: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className={cn(
          'focus-ring relative flex w-full flex-col gap-2 border-b border-hairline py-3.5 pl-6 pr-5 text-left transition-all duration-200',
          selected ? 'bg-white shadow-[inset_0_0_0_1px_rgb(37_99_235_/_0.18)]' : 'hover:bg-slate-50/80',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute inset-y-0 left-0 w-1 bg-gradient-to-b',
            SEVERITY_BAND[severityOf(bug)],
            selected ? 'opacity-100' : 'opacity-40',
          )}
        />
        <span className="flex items-center gap-2">
          <span className="rounded-md bg-slate-900/[0.05] px-1.5 py-0.5 font-mono text-2xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-900/10">
            {bugDisplayId(bug)}
          </span>
          <StatusPill status={bug.status} />
        </span>
        <span
          className={cn(
            'line-clamp-2 text-sm font-medium leading-snug',
            selected ? 'text-brand-900' : 'text-slate-900',
          )}
        >
          {bug.summary}
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-slate-500">
          <span className="inline-flex min-w-0 items-center gap-1">
            <Boxes className="h-3 w-3 shrink-0 text-violet-600" aria-hidden />
            <span className="truncate">
              {bug.component}
              {bug.subcomponentName ? ` › ${bug.subcomponentName}` : ''}
            </span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3 text-amber-600" aria-hidden />
            {timeAgo(bug.lastChangeTime)}
          </span>
        </span>
      </button>
    </li>
  );
}

function DetailPane({ bugId }: { bugId: number | null }) {
  const { data, isLoading } = useBug(bugId ?? 0);
  const { data: meta } = useMeta();
  const update = useUpdateBug(bugId ?? 0);
  const { toast } = useToast();

  const shell = PANEL_SHELL;

  if (bugId === null) {
    return (
      <section className={cn(shell, 'items-center justify-center p-12 text-center')}>
        <p className="text-sm text-slate-400">Select a bug to read it here.</p>
      </section>
    );
  }

  if (isLoading || !data) {
    return (
      <section className={cn(shell, 'gap-3 p-7')}>
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-28 w-full" />
      </section>
    );
  }

  const bug = data.bug;

  const transitions = meta?.workflow?.find((workflow) => workflow.status === bug.status)?.canChangeTo ?? [];

  const applyStatus = (status: string) => {
    const needsComment = meta?.workflow?.find((workflow) => workflow.status === bug.status)?.commentRequiredTo ?? [];
    if (needsComment.includes(status)) {
      toast({
        title: `${status} needs a comment`,
        description: 'Open the bug to explain why it is being reopened.',
        variant: 'info',
      });
      return;
    }
    update.mutate(
      { status },
      {
        onSuccess: () => toast({ title: `${bugDisplayId(bug)} is now ${status}.`, variant: 'success' }),
        onError: (err) =>
          toast({
            title: 'That change was refused.',
            description: err instanceof Error ? err.message : undefined,
            variant: 'error',
          }),
      },
    );
  };

  const applySeverity = (severity: string) => {
    update.mutate(
      { severity },
      {
        onSuccess: () => toast({ title: `${bugDisplayId(bug)} set to ${severity}.`, variant: 'success' }),
        onError: (err) =>
          toast({
            title: 'That change was refused.',
            description: err instanceof Error ? err.message : undefined,
            variant: 'error',
          }),
      },
    );
  };

  return (
    <motion.section key={bug.id} variants={drawerVariants} initial="hidden" animate="visible" className={shell}>
      <span aria-hidden className={cn('h-1 shrink-0 bg-gradient-to-r', SEVERITY_BAND[severityOf(bug)])} />

      <header className="border-b border-hairline px-7 pb-5 pt-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-slate-900/[0.05] px-2 py-0.5 font-mono text-2xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-900/10">
              {bugDisplayId(bug)}
            </span>
            <StatusPill status={bug.status} />
            {bug.triage && <SeverityPill severity={bug.triage.severity} />}
            {bug.triage && bug.triage.priority !== 'Unclassified' && <PriorityPill priority={bug.triage.priority} />}
            {bug.triage && bug.triage.category !== 'Unclassified' && <CategoryPill category={bug.triage.category} />}
          </div>
          <Button asChild variant="secondary" size="sm">
            <Link to={`/bugs/${bug.id}`}>
              Open <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        <h2 className="mt-3 font-display text-lg font-semibold leading-snug tracking-tight text-slate-900">
          {bug.summary}
        </h2>

        <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5 text-brand-600" aria-hidden />
            <dt className="sr-only">Product</dt>
            <dd className="font-medium text-slate-700">{bug.product}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <Boxes className="h-3.5 w-3.5 text-violet-600" aria-hidden />
            <dt className="sr-only">Component</dt>
            <dd className="font-medium text-slate-700">
              {bug.component}
              {bug.subcomponentName && <span className="font-normal text-slate-500"> › {bug.subcomponentName}</span>}
            </dd>
          </div>
          {bug.assignedTo && (
            <div className="flex items-center gap-1.5">
              <UserRound className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
              <dt className="sr-only">Assignee</dt>
              <dd className="font-medium text-slate-700">{bug.assignedTo.name || bug.assignedTo.email}</dd>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-amber-600" aria-hidden />
            <dt className="sr-only">Last updated</dt>
            <dd>Updated {timeAgo(bug.lastChangeTime)}</dd>
          </div>
        </dl>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-hairline bg-gradient-to-r from-brand-50/70 via-white to-white px-7 py-3">
        <span className="mr-1 text-2xs font-semibold uppercase tracking-wider text-slate-400">Quick change</span>
        <QuickMenu
          label="Status"
          current={bug.status}
          dot={STATUS_DOT[bug.status] ?? 'bg-slate-400'}
          options={transitions}
          onPick={applyStatus}
          busy={update.isPending}
          empty="No transitions from here"
        />
        <QuickMenu
          label="Severity"
          current={bug.severity}
          dot={RAW_SEVERITY_DOT[bug.severity.toLowerCase()] ?? 'bg-slate-400'}
          options={meta?.severities ?? []}
          onPick={applySeverity}
          busy={update.isPending}
          empty="No severities configured"
        />
        {update.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
      </div>

      <div className="flex-1 overflow-y-auto px-7 py-6">
        <p className="mb-3 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-slate-400">
          <FileText className="h-3.5 w-3.5" aria-hidden /> Report
        </p>
        {bug.description?.trim() ? (
          <DescriptionReport description={bug.description} />
        ) : (
          <p className="text-sm text-slate-500">This bug has no description.</p>
        )}
      </div>
    </motion.section>
  );
}

const PANEL_SHELL =
  'surface-raised flex flex-col overflow-hidden min-h-[26rem] max-h-[44rem] xl:sticky xl:top-[5rem] xl:h-[calc(100dvh-6rem)] xl:max-h-none';

const SEVERITY_GROUP: Record<Severity, string> = {
  Critical: 'border-l-rose-500 bg-rose-50/90',
  Major: 'border-l-orange-500 bg-orange-50/90',
  Minor: 'border-l-sky-500 bg-sky-50/90',
  Trivial: 'border-l-slate-400 bg-slate-50/95',
  Unclassified: 'border-l-brand-500 bg-brand-50/80',
};

const SEVERITY_BAND: Record<Severity, string> = {
  Critical: 'from-rose-500 via-rose-400 to-orange-400',
  Major: 'from-orange-500 via-amber-400 to-amber-300',
  Minor: 'from-sky-500 via-sky-400 to-cyan-300',
  Trivial: 'from-slate-400 via-slate-300 to-slate-200',
  Unclassified: 'from-brand-500 via-brand-400 to-ueducate-accent',
};

const STATUS_DOT: Record<string, string> = {
  UNCONFIRMED: 'bg-slate-400',
  CONFIRMED: 'bg-amber-500',
  IN_PROGRESS: 'bg-sky-500',
  REOPENED: 'bg-orange-500',
  PENDING_APPROVAL: 'bg-violet-500',
  AWAITING_REQUIREMENT: 'bg-indigo-500',
  IN_REVIEW: 'bg-teal-500',
  RESOLVED: 'bg-emerald-500',
  CLOSED: 'bg-emerald-600',
};
const RAW_SEVERITY_DOT: Record<string, string> = {
  blocker: 'bg-rose-600',
  critical: 'bg-rose-500',
  major: 'bg-orange-500',
  normal: 'bg-sky-500',
  minor: 'bg-sky-400',
  trivial: 'bg-slate-400',
  enhancement: 'bg-violet-500',
};

function QuickMenu({
  label,
  current,
  dot,
  options,
  onPick,
  busy,
  empty,
}: {
  label: string;
  current: string;
  dot: string;
  options: string[];
  onPick: (value: string) => void;
  busy: boolean;
  empty: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" disabled={busy}>
          <span className="text-slate-400">{label}</span>
          <span className={cn('h-2 w-2 rounded-full', dot)} aria-hidden />
          <span className="font-semibold text-slate-900">{current.replace('_', ' ')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Set {label.toLowerCase()}</DropdownMenuLabel>
        {options.length === 0 && <p className="px-2 py-1.5 text-xs text-slate-400">{empty}</p>}
        {options.map((option) => (
          <DropdownMenuItem key={option} onSelect={() => onPick(option)} disabled={option === current}>
            {option}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
