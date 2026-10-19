import { AlertOctagon, ArrowUpRight, CheckCircle2, Inbox, Loader2, RotateCcw } from 'lucide-react';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBug, useBugCounts, useBugs, useMeta, useUpdateBug } from '../../api/hooks';
import { useToast } from '../../context/ToastContext';
import { drawerVariants, listVariants, pageVariants } from '../../lib/motion';
import { bugDisplayId, cn, timeAgo } from '../../lib/utils';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { SeverityPill, StatusPill } from '../ui/Pill';
import { Skeleton } from '../ui/Skeleton';
import { StatCard } from '../ui/StatCard';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../ui/primitives/dropdown-menu';
import { SEVERITIES, type Bug, type Severity } from '../../types';

/**
 * The developer's board: what is on me, and what is on fire.
 *
 * Deliberately NOT a copy of the shared dashboard with a filter applied. The
 * question a developer opens this to answer is "what do I work on next", so the
 * backlog is the page, and everything else is context around it.
 */

const BACKLOG_LIMIT = 50;

/*
 * Grouped by the app's OWN severity vocabulary (`bug.triage.severity`), not
 * Bugzilla's raw `bug.severity`.
 *
 * The two are not the same axis: the backend folds Bugzilla's six raw values
 * into four bands paired with a priority, and SeverityPill is typed to those
 * bands. Grouping on the raw string would produce headings the pill cannot
 * render and buckets that disagree with every other screen.
 *
 * SEVERITIES is already declared worst-first, so its own order is the order
 * work should be picked in.
 */
function bandRank(severity: Severity): number {
  const i = SEVERITIES.indexOf(severity);
  return i === -1 ? SEVERITIES.length : i;
}

const severityOf = (bug: Bug): Severity => bug.triage?.severity ?? 'Unclassified';

export function DeveloperDashboard({ email }: { email: string }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  /*
   * `assignedTo` is the server-side filter, so this is the real backlog rather
   * than a page of all bugs filtered in the browser - which would miss anything
   * past the list endpoint's cap.
   */
  const { data, isLoading, isError } = useBugs({
    assignedTo: email,
    limit: BACKLOG_LIMIT,
    offset: 0,
    sortBy: 'importance',
    sortDir: 'asc',
  });

  const { data: meta } = useMeta();

  /*
   * EVERY card on this board is scoped to the signed-in developer - each query
   * carries `assignedTo: email`, and none of them is enabled before the email
   * is known, so a half-loaded session cannot briefly render instance-wide
   * totals as if they were personal ones.
   */
  const scoped = email !== '';

  /*
   * Open statuses come from the live workflow rather than a hard-coded list.
   * Spelling them out (NEW/CONFIRMED/IN_PROGRESS/ASSIGNED) would be wrong here
   * twice over: this instance has no NEW or ASSIGNED, and a status an admin
   * adds later would silently stop being counted.
   */
  const openStatuses = (meta?.workflow ?? []).filter((w) => w.isOpen).map((w) => w.status);
  const closedStatuses = (meta?.workflow ?? []).filter((w) => !w.isOpen).map((w) => w.status);

  /** Cards 1 and 2: my open work, and how much of it is severe. */
  const { data: myOpen } = useBugCounts(
    { assignedTo: email, status: openStatuses },
    { enabled: scoped && openStatuses.length > 0 }
  );

  /*
   * Card 3 - handed back by QA. Gated on the status existing: Bugzilla drops an
   * unrecognised `bug_status` rather than matching nothing, which would turn
   * this into "every bug assigned to me".
   */
  const hasReopened = (meta?.statuses ?? []).includes('REOPENED');
  const { data: reopenedCounts } = useBugCounts(
    { assignedTo: email, status: ['REOPENED'] },
    { enabled: scoped && hasReopened }
  );

  /*
   * Card 4 - lifetime fixes. Every closed status the workflow defines, so
   * VERIFIED counts alongside RESOLVED and any future CLOSED is picked up
   * without a code change.
   */
  const { data: myResolved } = useBugCounts(
    { assignedTo: email, status: closedStatuses },
    { enabled: scoped && closedStatuses.length > 0 }
  );

  /*
   * Blocker + critical + major, counted from the raw Bugzilla severities of my
   * OPEN bugs.
   *
   * Read from `bySeverity` rather than by applying a severity filter, because
   * `toBugzillaQuery` pins a paired PRIORITY alongside each severity band - so
   * filtering would quietly drop a `critical` bug sitting at P2. Tallying the
   * raw values asks the question the card actually poses.
   */
  const HIGH = ['blocker', 'critical', 'major'];
  const myHighSeverity = HIGH.reduce((n, key) => n + (myOpen?.counts.bySeverity?.[key] ?? 0), 0);

  const bugs = useMemo(() => (data?.bugs ?? []).filter((b) => b.isOpen), [data]);

  // Keep a selection in the pane as the list loads or changes underneath it.
  useEffect(() => {
    if (bugs.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((current) => (current && bugs.some((b) => b.id === current) ? current : bugs[0].id));
  }, [bugs]);

  const grouped = useMemo(() => {
    const out = new Map<Severity, Bug[]>();
    for (const bug of [...bugs].sort((a, b) => bandRank(severityOf(a)) - bandRank(severityOf(b)))) {
      const key = severityOf(bug);
      const list = out.get(key);
      if (list) list.push(bug);
      else out.set(key, [bug]);
    }
    return [...out.entries()];
  }, [bugs]);

  return (
    <div className="space-y-6">
      {/* The tiles settle in sequence rather than all at once - 35ms apart, so
          the row reads as arriving without feeling dealt out. */}
      <motion.div
        variants={listVariants}
        initial="hidden"
        animate="visible"
        className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
      >
        <motion.div variants={pageVariants}>
          <StatCard
            label="My open backlog"
            value={myOpen?.counts.total ?? 0}
            icon={Inbox}
            tone="brand"
            to={`/bugs?assignedTo=${encodeURIComponent(email)}`}
            hint="Active bugs to fix"
          />
        </motion.div>
        <motion.div variants={pageVariants}>
          <StatCard
            label="My high severity"
            value={myHighSeverity}
            icon={AlertOctagon}
            tone="rose"
            hint="Blocker, critical or major"
          />
        </motion.div>
        <motion.div variants={pageVariants}>
          <StatCard
            label="Reopened by QA"
            value={hasReopened ? (reopenedCounts?.counts.total ?? 0) : 0}
            icon={RotateCcw}
            tone="amber"
            to={
              (reopenedCounts?.counts.total ?? 0) > 0
                ? `/bugs?status=REOPENED&assignedTo=${encodeURIComponent(email)}`
                : undefined
            }
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
            label="Resolved by me"
            value={myResolved?.counts.total ?? 0}
            icon={CheckCircle2}
            tone="emerald"
            hint="Lifetime fixes"
          />
        </motion.div>
      </motion.div>

      {/*
        Split pane: the backlog stays visible while a bug is read, so triaging a
        queue does not mean a navigate-and-back for every row. Collapses to a
        single column below lg, where there is no room for two.
      */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section className="surface overflow-hidden">
          <header className="flex items-center justify-between border-b border-hairline px-5 py-4">
            <h2 className="font-display text-sm font-semibold text-slate-900">My backlog</h2>
            <Link to="/my-bugs" className="focus-ring rounded text-xs font-medium text-brand-700 hover:text-brand-800">
              Open full list
            </Link>
          </header>

          <div className="max-h-[34rem] overflow-y-auto">
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
              <EmptyState
                icon={CheckCircle2}
                title="Nothing assigned"
                description="No open bugs are assigned to you right now."
              />
            )}

            {grouped.map(([severity, list]) => (
              <div key={severity}>
                <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-hairline bg-slate-50/95 px-5 py-2.5 backdrop-blur">
                  <SeverityPill severity={severity} />
                  <span className="text-2xs font-medium text-slate-500">{list.length}</span>
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
          /*
           * py-3.5 rather than py-2.5: a 56px row is comfortably past the 44px
           * touch-target floor and, more to the point, gives the two-line
           * summary-plus-meta stack room to breathe instead of stacking tight.
           *
           * The selected row carries an accent RULE as well as a fill - with a
           * tint alone, "selected" and "hovered" look alike, and on a list you
           * arrow through that ambiguity is constant.
           */
          'focus-ring flex w-full items-start gap-3 border-b border-hairline px-5 py-3.5 text-left transition-colors duration-200',
          selected
            ? 'border-l-2 border-l-brand-600 bg-brand-50/70 pl-[18px]'
            : 'border-l-2 border-l-transparent hover:bg-slate-50/80'
        )}
      >
        <span className="mt-0.5 font-mono text-2xs text-slate-400">{bugDisplayId(bug)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-900">{bug.summary}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-2 text-2xs text-slate-500">
            <StatusPill status={bug.status} />
            <span className="truncate">{bug.component}</span>
            <span>· {timeAgo(bug.lastChangeTime)}</span>
          </span>
        </span>
      </button>
    </li>
  );
}

/**
 * The right half: the selected bug, with the two edits a developer makes most.
 *
 * Status and severity are changed inline because walking to the detail page to
 * flip one field is the friction this board exists to remove. Everything else
 * stays on the detail page - this is a shortcut for the common case, not a
 * second editor competing with the real one.
 */
function DetailPane({ bugId }: { bugId: number | null }) {
  const { data, isLoading } = useBug(bugId ?? 0);
  const { data: meta } = useMeta();
  const update = useUpdateBug(bugId ?? 0);
  const { toast } = useToast();

  /*
   * Decoupled from the list: the pane sticks to the viewport and owns its own
   * height rather than stretching to match the backlog beside it. Scrolling a
   * long queue now leaves the bug you are reading in place, and a one-line
   * summary no longer forces a half-empty column the height of fifty rows.
   */
  const shell = 'surface-raised sticky top-6 flex max-h-[calc(100vh-7rem)] min-h-[26rem] flex-col overflow-hidden';

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

  /*
   * The workflow decides which statuses are reachable from here - Bugzilla
   * rejects an arbitrary transition, so offering every status would produce
   * buttons that fail. `meta.workflow` is the same graph editworkflow.cgi uses.
   */
  const transitions = meta?.workflow?.find((w) => w.status === bug.status)?.canChangeTo ?? [];

  const applyStatus = (status: string) => {
    // Bugzilla refuses some transitions without a comment (REOPENED, by
    // configuration). Those are sent to the detail page rather than failing here.
    const needsComment = meta?.workflow?.find((w) => w.status === bug.status)?.commentRequiredTo ?? [];
    if (needsComment.includes(status)) {
      toast({ title: `${status} needs a comment`, description: 'Open the bug to explain why it is being reopened.', variant: 'info' });
      return;
    }
    update.mutate(
      { status },
      {
        onSuccess: () => toast({ title: `${bugDisplayId(bug)} is now ${status}.`, variant: 'success' }),
        onError: (err) =>
          toast({ title: 'That change was refused.', description: err instanceof Error ? err.message : undefined, variant: 'error' }),
      }
    );
  };

  const applySeverity = (severity: string) => {
    update.mutate(
      { severity },
      {
        onSuccess: () => toast({ title: `${bugDisplayId(bug)} set to ${severity}.`, variant: 'success' }),
        onError: (err) =>
          toast({ title: 'That change was refused.', description: err instanceof Error ? err.message : undefined, variant: 'error' }),
      }
    );
  };

  return (
    <motion.section
      // `key` on the bug id restarts the animation whenever the selection
      // changes, so picking a different row slides the new one in rather than
      // swapping the text underneath a static panel.
      key={bug.id}
      variants={drawerVariants}
      initial="hidden"
      animate="visible"
      className={shell}
    >
      <header className="flex items-start justify-between gap-4 border-b border-hairline px-7 py-6">
        <div className="min-w-0">
          <p className="font-mono text-2xs tracking-wide text-slate-400">{bugDisplayId(bug)}</p>
          {/* Display face and a generous measure: this is the one block on the
              dashboard someone actually reads rather than scans. */}
          <h2 className="mt-1.5 font-display text-lg font-semibold leading-snug tracking-tight text-slate-900">
            {bug.summary}
          </h2>
          <p className="mt-2 text-xs text-slate-500">
            {bug.product} · {bug.component}
          </p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link to={`/bugs/${bug.id}`}>
            Open <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-hairline bg-slate-50/50 px-7 py-4">
        <QuickMenu
          label="Status"
          current={bug.status}
          options={transitions}
          onPick={applyStatus}
          busy={update.isPending}
          empty="No transitions from here"
        />
        <QuickMenu
          label="Severity"
          current={bug.severity}
          options={meta?.severities ?? []}
          onPick={applySeverity}
          busy={update.isPending}
          empty="No severities configured"
        />
        {update.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
      </div>

      {/* `max-w-[72ch]` caps the measure: past roughly 75 characters the eye
          loses the start of the next line, and a wide pane would otherwise run
          a description to the full column width. */}
      <div className="flex-1 overflow-y-auto px-7 py-6">
        <p className="max-w-[72ch] whitespace-pre-wrap break-words text-sm leading-[1.7] text-slate-600">
          {bug.description?.trim() || 'This bug has no description.'}
        </p>
      </div>
    </motion.section>
  );
}

function QuickMenu({
  label,
  current,
  options,
  onPick,
  busy,
  empty,
}: {
  label: string;
  current: string;
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
          <span className="font-medium text-slate-900">{current}</span>
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
