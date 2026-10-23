import { AlertOctagon, ArrowUpRight, Boxes, CheckCircle2, Clock, FileText, Inbox, ListTodo, Loader2, Package, RotateCcw, UserRound } from 'lucide-react';
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

/**
 * One developer's board. `name` is set when someone else's board is being
 * viewed (an admin or tester picking a developer on the Dashboard); unset, it
 * is the signed-in user's own, and the wording stays first-person.
 */
/**
 * `all` = the team-wide board: every developer's assigned work in one view
 * (what admins and testers open by default). Then `email` is ignored and no
 * query carries an assignee.
 */
export function DeveloperDashboard({ email, name, all = false }: { email: string; name?: string; all?: boolean }) {
  // The assignee scope every query below carries: one person, or nobody (everyone).
  const who = all ? {} : { assignedTo: email };
  const whoQs = all ? '' : `&assignedTo=${encodeURIComponent(email)}`;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const isSelf = !name && !all;
  const first = name?.trim().split(/\s+/)[0] ?? '';
  // Wording that follows whose board this is: mine, one developer's, or everyone's.
  const t = all
    ? {
        openBacklog: 'Open backlog',
        highSeverity: 'Urgent',
        resolved: 'Resolved',
        backlog: 'Team backlog',
        empty: 'No open bugs are assigned to any developer right now.',
      }
    : {
        openBacklog: isSelf ? 'My open backlog' : 'Open backlog',
        highSeverity: isSelf ? 'My urgent bugs' : 'Urgent',
        resolved: isSelf ? 'Resolved by me' : `Resolved by ${first}`,
        backlog: isSelf ? 'My backlog' : `${first}'s backlog`,
        empty: isSelf ? 'No open bugs are assigned to you right now.' : `No open bugs are assigned to ${name} right now.`,
      };
  // "My Bugs" is the SIGNED-IN user's page; anyone else's full list is a search.
  const fullListHref = isSelf ? '/my-bugs' : all ? '/bugs' : `/bugs?assignedTo=${encodeURIComponent(email)}`;

  const { data: meta } = useMeta();
  const openStatusList = (meta?.workflow ?? []).filter((w) => w.isOpen).map((w) => w.status);

  /*
   * `assignedTo` AND the open statuses are server-side filters, so this is the
   * real backlog rather than a page filtered in the browser. Filtering only by
   * assignee used to fill the page with the developer's RESOLVED bugs first -
   * someone with more closed than BACKLOG_LIMIT bugs saw an empty backlog while
   * the "My open bugs" card counted dozens.
   *
   * Waits for the status list: without `status` the API returns every status.
   */
  const { data, isLoading: backlogQueryLoading, isError } = useBugs(
    {
      ...who,
      status: openStatusList,
      limit: BACKLOG_LIMIT,
      offset: 0,
      sortBy: 'importance',
      sortDir: 'asc',
    },
    { enabled: (all || email !== '') && openStatusList.length > 0 }
  );
  const isLoading = backlogQueryLoading || openStatusList.length === 0;

  /*
   * EVERY card on this board is scoped to the signed-in developer - each query
   * carries `assignedTo: email`, and none of them is enabled before the email
   * is known, so a half-loaded session cannot briefly render instance-wide
   * totals as if they were personal ones.
   */
  const scoped = all || email !== '';

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
    { ...who, status: openStatuses },
    { enabled: scoped && openStatuses.length > 0 }
  );


  /*
   * Card 3 - handed back by QA. Gated on the status existing: Bugzilla drops an
   * unrecognised `bug_status` rather than matching nothing, which would turn
   * this into "every bug assigned to me".
   */
  const hasReopened = (meta?.statuses ?? []).includes('REOPENED');
  const { data: reopenedCounts } = useBugCounts(
    { ...who, status: ['REOPENED'] },
    { enabled: scoped && hasReopened }
  );

  /*
   * Card 4 - lifetime fixes. Every closed status the workflow defines, so
   * CLOSED counts alongside RESOLVED, and any other closed status is picked up
   * without a code change.
   */
  const { data: myResolved } = useBugCounts(
    { ...who, status: closedStatuses },
    { enabled: scoped && closedStatuses.length > 0 }
  );

  /*
   * Blocker + critical, counted from the raw Bugzilla severities of my
   * OPEN bugs.
   *
   * Read from `bySeverity` rather than by applying a severity filter, because
   * `toBugzillaQuery` pins a paired PRIORITY alongside each severity band - so
   * filtering would quietly drop a `critical` bug sitting at P2. Tallying the
   * raw values asks the question the card actually poses.
   */
  // Blocker + critical only - the same rule as the QA board's "Blocker / critical" tile. Major
  // was counted too, and since most open bugs are major the card read close to the whole backlog.
  const HIGH = ['blocker', 'critical'];
  // Urgent = Critical severity OR P0 priority (from the BFF); the raw-severity tally is the fallback for an older backend.
  const myHighSeverity = myOpen?.counts.urgent ?? HIGH.reduce((n, key) => n + (myOpen?.counts.bySeverity?.[key] ?? 0), 0);

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
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:gap-5"
      >
        <motion.div variants={pageVariants}>
          <StatCard
            label={t.openBacklog}
            value={myOpen?.counts.total ?? 0}
            icon={Inbox}
            tone="brand"
            // Open statuses in the link too, so the list matches the count rather than showing everything ever assigned.
            to={`/bugs?${openStatuses.map((s) => `status=${encodeURIComponent(s)}`).join('&')}${whoQs}`}
            hint="Active bugs to fix"
          />
        </motion.div>
        <motion.div variants={pageVariants}>
          <StatCard
            label={t.highSeverity}
            value={myHighSeverity}
            icon={AlertOctagon}
            tone="rose"
            to={`/bugs?${openStatuses.map((s) => `status=${encodeURIComponent(s)}`).join('&')}&urgent=1${whoQs}`}
            hint="Open bugs, Critical or P0"
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
                ? `/bugs?status=REOPENED${whoQs}`
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
            label={t.resolved}
            value={myResolved?.counts.total ?? 0}
            icon={CheckCircle2}
            tone="emerald"
            to={`/bugs?${closedStatuses.map((s) => `status=${encodeURIComponent(s)}`).join('&')}${whoQs}&sortBy=last_change_time&sortDir=desc`}
            hint="Lifetime fixes"
          />
        </motion.div>
      </motion.div>

      {/*
        Split pane: the backlog stays visible while a bug is read, so triaging a
        queue does not mean a navigate-and-back for every row. Collapses to a
        single column below lg, where there is no room for two.
      */}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section className={PANEL_SHELL}>
          <span aria-hidden className="h-1 shrink-0 bg-gradient-to-r from-brand-500 via-brand-400 to-ueducate-accent" />
          <header className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-600/15">
                <ListTodo className="h-4 w-4" aria-hidden />
              </span>
              <h2 className="font-display text-sm font-semibold text-slate-900">{t.backlog}</h2>
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
              <EmptyState
                icon={CheckCircle2}
                title="Nothing assigned"
                description={t.empty}
              />
            )}

            {grouped.map(([severity, list]) => (
              <div key={severity}>
                <div
                  className={cn(
                    'sticky top-0 z-10 flex items-center gap-2 border-b border-l-4 border-hairline px-5 py-2 backdrop-blur',
                    SEVERITY_GROUP[severity]
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
          /*
           * py-3.5 rather than py-2.5: a 56px row is comfortably past the 44px
           * touch-target floor and, more to the point, gives the two-line
           * summary-plus-meta stack room to breathe instead of stacking tight.
           *
           * The selected row carries an accent RULE as well as a fill - with a
           * tint alone, "selected" and "hovered" look alike, and on a list you
           * arrow through that ambiguity is constant.
           */
          'focus-ring relative flex w-full flex-col gap-2 border-b border-hairline py-3.5 pl-6 pr-5 text-left transition-all duration-200',
          selected ? 'bg-white shadow-[inset_0_0_0_1px_rgb(37_99_235_/_0.18)]' : 'hover:bg-slate-50/80'
        )}
      >
        {/* Severity accent, the same colour as the reading pane's top band; full strength when selected. */}
        <span
          aria-hidden
          className={cn(
            'absolute inset-y-0 left-0 w-1 bg-gradient-to-b',
            SEVERITY_BAND[severityOf(bug)],
            selected ? 'opacity-100' : 'opacity-40'
          )}
        />
        <span className="flex items-center gap-2">
          <span className="rounded-md bg-slate-900/[0.05] px-1.5 py-0.5 font-mono text-2xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-900/10">
            {bugDisplayId(bug)}
          </span>
          <StatusPill status={bug.status} />
        </span>
        <span className={cn('line-clamp-2 text-sm font-medium leading-snug', selected ? 'text-brand-900' : 'text-slate-900')}>
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
      {/* Severity reads before a word does: a thin band in the bug's own colour. */}
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

        {/* Display face and a generous measure: this is the one block on the
            dashboard someone actually reads rather than scans. */}
        <h2 className="mt-3 font-display text-lg font-semibold leading-snug tracking-tight text-slate-900">{bug.summary}</h2>

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

      {/* The report in the same sectioned layout as the bug page - Summary,
          Steps, Expected / Actual, curl - rather than one grey wall of text. */}
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

/**
 * Both columns of the split pane share one shell - same surface, same height on
 * desktop - so the list and the bug being read line up as one board instead of
 * two unrelated cards.
 */
const PANEL_SHELL =
  'surface-raised flex flex-col overflow-hidden min-h-[26rem] max-h-[44rem] xl:sticky xl:top-[5rem] xl:h-[calc(100dvh-6rem)] xl:max-h-none';

/** Severity group header tints in the backlog list - same hues as the bands. */
const SEVERITY_GROUP: Record<Severity, string> = {
  Critical: 'border-l-rose-500 bg-rose-50/90',
  Major: 'border-l-orange-500 bg-orange-50/90',
  Minor: 'border-l-sky-500 bg-sky-50/90',
  Trivial: 'border-l-slate-400 bg-slate-50/95',
  Unclassified: 'border-l-brand-500 bg-brand-50/80',
};

/** The top band of the reading pane, by severity - matched to SeverityPill's tones. */
const SEVERITY_BAND: Record<Severity, string> = {
  Critical: 'from-rose-500 via-rose-400 to-orange-400',
  Major: 'from-orange-500 via-amber-400 to-amber-300',
  Minor: 'from-sky-500 via-sky-400 to-cyan-300',
  Trivial: 'from-slate-400 via-slate-300 to-slate-200',
  Unclassified: 'from-brand-500 via-brand-400 to-ueducate-accent',
};

/** Colour dots for the quick-change buttons, so the current value reads at a glance. */
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
  /** Tailwind bg-* class for the dot beside the current value. */
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
