import { ArrowRightLeft, CircleDashed, FilePlus2, Inbox, RotateCcw, Siren } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBugCounts, useBugs, useMeta, useProducts } from '../../api/hooks';
import { bugDisplayId, timeAgo } from '../../lib/utils';
import { TransferBugDialog } from '../bugs/TransferBugDialog';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { CategoryPill, SeverityPill, StatusPill } from '../ui/Pill';
import { Skeleton } from '../ui/Skeleton';
import { StatCard } from '../ui/StatCard';
import { QuickFileDialog } from './QuickFileDialog';
import type { Bug } from '../../types';

/**
 * The QA board: what has just arrived, and what still needs a decision.
 *
 * Two queues rather than one list, because they answer different questions.
 * "Incoming" is everything the bench has filed most recently - the feed you
 * watch during a run. "Needs triage" is the subset that is still UNCONFIRMED,
 * which is the work only someone with `canconfirm` can clear.
 */

const FEED_LIMIT = 8;
const TRIAGE_LIMIT = 8;

/**
 * `reporter` (an email) narrows every card, list and link to the bugs that
 * person reported - Bugzilla's own reporter field, the API's `creator` filter.
 * Unset, the board covers everyone.
 */
export function QaDashboard({ reporter }: { reporter?: string } = {}) {
  const [filing, setFiling] = useState(false);
  // Spread into every query below, so a card and the list behind it always agree.
  const who = useMemo(() => (reporter ? { creator: reporter } : {}), [reporter]);
  const withWho = (path: string) =>
    reporter ? `${path}${path.includes('?') ? '&' : '?'}creator=${encodeURIComponent(reporter)}` : path;
  const [transferId, setTransferId] = useState<number | null>(null);

  const { data: meta } = useMeta();
  // Feeds the quick-file dialog, so it wants the filing list rather than the
  // narrower filter scope.
  const { data: products } = useProducts({ forFiling: true });

  /*
   * UNCONFIRMED is deliberately NOT used here.
   *
   * It is Bugzilla's "nobody has judged this yet" status, and it can never
   * occur on this instance: Bug.pm confirms a bug outright for anyone holding
   * `editbugs`, and every role in backend/src/lib/roles.ts grants it. The
   * status exists and is enabled on every product, but no account can trigger
   * it - so a tile counting it was pinned at 0 permanently.
   *
   * What testers actually triage is further down: open bugs nobody has taken.
   */

  const { data: feedData, isLoading: feedLoading } = useBugs({
    ...who,
    limit: FEED_LIMIT,
    offset: 0,
    sortBy: 'creation_time',
    sortDir: 'desc',
  });

  /*
   * Bugzilla DROPS a `bug_status` it does not recognise rather than matching
   * nothing, so a filter naming one silently becomes "no filter" and returns
   * the caller's whole scope. The BFF now narrows unknown statuses out before
   * forwarding, which is what makes the REOPENED half of card 4 safe to ask
   * for on an instance that has no such status.
   */
  const openStatuses = (meta?.workflow ?? []).filter((w) => w.isOpen).map((w) => w.status);

  /*
   * "Longest open": the oldest OPEN bugs, oldest first.
   *
   * Filtered by status in the query itself. This used to fetch the 60 oldest
   * bugs of ANY status and keep the open ones client-side - but the oldest bugs
   * on a mature instance are almost all RESOLVED (1,173 of 1,330 here), so the
   * page held no open bug at all and the panel said "Nothing is ageing" while
   * the tile beside it counted 156 open defects.
   *
   * Waits for the status list: with no `status` the API returns every bug, which
   * would reintroduce exactly that mistake for the first render.
   */
  const { data: triageData, isLoading: triageQueryLoading } = useBugs(
    {
      ...who,
      status: openStatuses,
      limit: TRIAGE_LIMIT,
      offset: 0,
      sortBy: 'creation_time',
      sortDir: 'asc',
    },
    { enabled: openStatuses.length > 0 }
  );
  const triageLoading = triageQueryLoading || openStatuses.length === 0;

  const hasUnconfirmed = (meta?.statuses ?? []).includes('UNCONFIRMED');

  const { data: allCounts } = useBugCounts(who);

  /*
   * Card 2 - incoming failures QA has not judged yet.
   *
   * Gated on the status existing so an instance without it reads 0 rather than
   * the whole scope (Bugzilla DROPS an unknown bug_status instead of matching
   * nothing - the bug that once made a tile read 971).
   */
  const { data: unconfirmedCounts } = useBugCounts({ ...who, status: ['UNCONFIRMED'] }, { enabled: hasUnconfirmed });

  /*
   * Card 4 - fixed, but nobody has checked the fix. RESOLVED only.
   *
   * Deliberately NOT including REOPENED: a reopened bug has already been
   * re-tested and sent back, so it is the developer's again, not QA's. Counting
   * it here would keep it in the queue after QA had done exactly what the queue
   * asked for.
   *
   * VERIFIED is excluded for free by naming RESOLVED explicitly - so marking a
   * bug verified drops it from this count on the next refresh. The same holds
   * for any future CLOSED status.
   *
   * Soft-deleted bugs are excluded by the API's default `deleted=exclude`.
   */
  const { data: retestCounts } = useBugCounts({ ...who, status: ['RESOLVED'] });
  /*
   * Scoped to the open statuses so `blockerCritical` counts CURRENT load.
   *
   * tallyBugCounts tallies blocker/critical over whatever rows it is given and
   * never consults is_open, so the unscoped count includes every high-severity
   * bug ever resolved - which is why that tile could read higher than the open
   * total sitting beside it.
   */
  const { data: openCounts } = useBugCounts(
    { ...who, status: openStatuses },
    { enabled: openStatuses.length > 0 }
  );

  const feed = feedData?.bugs ?? [];


  const productNames = useMemo(() => (products?.products ?? []).map((p) => p.name), [products]);

  /*
   * The oldest OPEN bugs - what has been waiting longest for a fix.
   *
   * No owner filtering: a bug sitting with its product owner is owned, not
   * stranded, so splitting this list that way would imply a backlog the team
   * does not recognise. Age is the honest signal.
   */
  const triage = useMemo(
    () => (triageData?.bugs ?? []).filter((bug) => bug.isOpen).slice(0, TRIAGE_LIMIT),
    [triageData]
  );

  return (
    <div className="space-y-6">
      {/*
        No "awaiting triage" or "unassigned" tile here, deliberately.
        
        The bench files a bug and Bugzilla assigns it to the component's default
        owner - who IS the product owner for that module. That bug is properly
        owned from the moment it is filed; the owner reassigns it to a developer
        only if they decide to. So counting those as a backlog would invent a
        problem the team does not have, and would read as 150 bugs nobody is
        looking after when in fact every one of them has an owner.
        
        "With developers" stays because it is informational rather than a
        verdict: it says how much work has been pushed down to an individual.
      */}
      {/*
        Four cards, each a question QA can act on:
        what is broken, what needs my judgement, what is urgent, what needs my
        verification. Nothing here describes how a bug was filed or who owns it
        - that is the product owner's concern, not the tester's.
      */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Open defects"
          value={allCounts?.counts.open ?? 0}
          icon={Inbox}
          tone="brand"
          to={withWho('/bugs')}
          hint="Everything still broken"
        />

        <StatCard
          label="Needs triage"
          value={hasUnconfirmed ? (unconfirmedCounts?.counts.total ?? 0) : 0}
          icon={CircleDashed}
          tone="amber"
          to={(unconfirmedCounts?.counts.total ?? 0) > 0 ? withWho('/bugs?status=UNCONFIRMED') : undefined}
          hint={
            (unconfirmedCounts?.counts.total ?? 0) > 0
              ? 'Unconfirmed - waiting on QA'
              : 'Nothing awaiting confirmation'
          }
        />

        <StatCard
          label="Blocker / critical"
          value={openCounts?.counts.blockerCritical ?? 0}
          icon={Siren}
          tone="rose"
          to={withWho('/bugs?severity=Critical')}
          hint="Open, high severity"
        />

        <StatCard
          label="Ready for re-test"
          value={retestCounts?.counts.total ?? 0}
          icon={RotateCcw}
          tone="emerald"
          to={withWho('/bugs?status=RESOLVED&sortBy=last_change_time&sortDir=desc')}
          hint="Fixed - waiting on your verification"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setFiling(true)}>
          <FilePlus2 className="h-3.5 w-3.5" /> Quick file a bug
        </Button>
        <Button asChild variant="secondary">
          <Link to="/bugs/new">Full filing form</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link to="/search">Advanced search</Link>
        </Button>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Queue
          title="Longest open"
          subtitle="Open the longest - still waiting on a fix"
          to={withWho('/bugs?sortBy=creation_time&sortDir=asc')}
          loading={triageLoading}
          bugs={triage}
          emptyTitle="Nothing is ageing"
          emptyDescription="There are no open bugs right now."
          onTransfer={setTransferId}
        />

        <Queue
          title="Latest incoming"
          subtitle="Newest first - what the bench has just filed"
          to={withWho('/bugs?sortBy=creation_time&sortDir=desc')}
          loading={feedLoading}
          bugs={feed}
          emptyTitle="Nothing filed yet"
          emptyDescription="New bugs will appear here as they arrive."
          onTransfer={setTransferId}
        />
      </div>

      <QuickFileDialog
        open={filing}
        onClose={() => setFiling(false)}
        products={products?.products ?? []}
        productNames={productNames}
        severities={meta?.severities ?? []}
      />

      {/*
        Reuses the existing transfer dialog rather than a new one: it already
        reads the allowed routes from the BFF (`/bugs/:id/transfer-options`),
        and a second implementation would be a second place for those rules to
        drift out of step.
      */}
      {transferId !== null && (
        <TransferBugDialog
          open
          bugId={transferId}
          onClose={() => setTransferId(null)}
          onTransferred={() => setTransferId(null)}
        />
      )}
    </div>
  );
}

function Queue({
  title,
  subtitle,
  to,
  loading,
  bugs,
  emptyTitle,
  emptyDescription,
  onTransfer,
}: {
  title: string;
  subtitle?: string;
  to: string;
  loading: boolean;
  bugs: Bug[];
  emptyTitle: string;
  emptyDescription: string;
  onTransfer: (id: number) => void;
}) {
  return (
    <section className="surface overflow-hidden">
      <header className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
        <div>
          <h2 className="font-display text-sm font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-2xs text-slate-500">{subtitle}</p>}
        </div>
        <Link to={to} className="focus-ring shrink-0 rounded text-xs font-medium text-brand-700 hover:text-brand-800">
          View all
        </Link>
      </header>

      {loading && (
        <div className="space-y-2 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}

      {!loading && bugs.length === 0 && <EmptyState icon={Inbox} title={emptyTitle} description={emptyDescription} />}

      {!loading && bugs.length > 0 && (
        <ul className="divide-y divide-hairline">
          {bugs.map((bug) => (
            <li key={bug.id} className="group flex items-start gap-3 px-5 py-3.5 transition-colors duration-200 hover:bg-slate-50/80">
              <div className="min-w-0 flex-1">
                <Link
                  to={`/bugs/${bug.id}`}
                  className="focus-ring block truncate rounded text-sm font-medium text-slate-900 hover:text-brand-700"
                >
                  <span className="mr-2 font-mono text-2xs text-slate-400">{bugDisplayId(bug)}</span>
                  {bug.summary}
                </Link>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusPill status={bug.status} />
                  <SeverityPill severity={bug.triage?.severity ?? 'Unclassified'} />
                  {bug.triage?.category && <CategoryPill category={bug.triage.category} />}
                  <span className="text-2xs text-slate-500">
                    {bug.product} · {timeAgo(bug.creationTime)}
                  </span>
                </div>
              </div>
              {/*
                Only shown on hover/focus: a transfer is a deliberate act, and a
                visible button on every row invites mis-clicks in a queue that is
                scanned quickly.
              */}
              <Button
                variant="ghost"
                size="icon-sm"
                title="Transfer to another product"
                aria-label={`Transfer ${bugDisplayId(bug)} to another product`}
                className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                onClick={() => onTransfer(bug.id)}
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
