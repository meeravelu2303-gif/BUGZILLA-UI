import { ArrowRightLeft, CheckCircle2, CircleDashed, FilePlus2, Inbox, RotateCcw, Siren } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBugCounts, useBugs, useMeta } from '../../api/hooks';
import { bugDisplayId, timeAgo } from '../../lib/utils';
import { TransferBugDialog } from '../bugs/TransferBugDialog';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { CategoryPill, SeverityPill, StatusPill } from '../ui/Pill';
import { Skeleton } from '../ui/Skeleton';
import { StatCard } from '../ui/StatCard';
import type { Bug } from '../../types';

const FEED_LIMIT = 8;
const TRIAGE_LIMIT = 8;

/** reporter (an email) narrows every card. */
export function QaDashboard({ reporter, mine = false }: { reporter?: string; mine?: boolean } = {}) {
  const yours = (text: string, otherwise: string) => (mine ? `Reported by you · ${text}` : otherwise);
  const who = useMemo(() => (reporter ? { creator: reporter } : {}), [reporter]);
  const withWho = (path: string) =>
    reporter ? `${path}${path.includes('?') ? '&' : '?'}creator=${encodeURIComponent(reporter)}` : path;
  const [transferId, setTransferId] = useState<number | null>(null);

  const { data: meta } = useMeta();

  const { data: feedData, isLoading: feedLoading } = useBugs({
    ...who,
    limit: FEED_LIMIT,
    offset: 0,
    sortBy: 'creation_time',
    sortDir: 'desc',
  });

  const openStatuses = (meta?.workflow ?? [])
    .filter((workflow) => workflow.isOpen)
    .map((workflowTransition) => workflowTransition.status);
  const openQueryString = openStatuses.map((openStatus) => `status=${encodeURIComponent(openStatus)}`).join('&');

  const { data: triageData, isLoading: triageQueryLoading } = useBugs(
    {
      ...who,
      status: openStatuses,
      limit: TRIAGE_LIMIT,
      offset: 0,
      sortBy: 'creation_time',
      sortDir: 'asc',
    },
    { enabled: openStatuses.length > 0 },
  );
  const triageLoading = triageQueryLoading || openStatuses.length === 0;

  const hasUnconfirmed = (meta?.statuses ?? []).includes('UNCONFIRMED');

  const { data: allCounts } = useBugCounts(who);

  const { data: unconfirmedCounts } = useBugCounts({ ...who, status: ['UNCONFIRMED'] }, { enabled: hasUnconfirmed });

  const { data: retestCounts } = useBugCounts({ ...who, status: ['RESOLVED'] });
  const { data: closedCounts } = useBugCounts({ ...who, status: ['CLOSED'] });
  const { data: openCounts } = useBugCounts({ ...who, status: openStatuses }, { enabled: openStatuses.length > 0 });

  const feed = feedData?.bugs ?? [];

  const triage = useMemo(
    () => (triageData?.bugs ?? []).filter((bug) => bug.isOpen).slice(0, TRIAGE_LIMIT),
    [triageData],
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 2xl:gap-5">
        <StatCard
          label="Open defects"
          value={allCounts?.counts.open ?? 0}
          icon={Inbox}
          tone="brand"
          to={withWho(`/bugs?${openQueryString}`)}
          hint={yours('still broken', 'Everything still broken')}
        />

        <StatCard
          label="Needs triage"
          value={hasUnconfirmed ? (unconfirmedCounts?.counts.total ?? 0) : 0}
          icon={CircleDashed}
          tone="amber"
          to={(unconfirmedCounts?.counts.total ?? 0) > 0 ? withWho('/bugs?status=UNCONFIRMED') : undefined}
          hint={
            (unconfirmedCounts?.counts.total ?? 0) > 0
              ? yours('unconfirmed', 'Unconfirmed - waiting on QA')
              : yours('nothing to confirm', 'Nothing awaiting confirmation')
          }
        />

        <StatCard
          label="Top priority"
          value={openCounts?.counts.urgent ?? openCounts?.counts.blockerCritical ?? 0}
          icon={Siren}
          tone="rose"
          to={withWho(`/bugs?${openQueryString}&urgent=1`)}
          hint={yours('open, Critical or P0', 'Open, Critical or P0')}
        />

        <StatCard
          label="Ready for re-test"
          value={retestCounts?.counts.total ?? 0}
          icon={RotateCcw}
          tone="emerald"
          to={withWho('/bugs?status=RESOLVED&sortBy=last_change_time&sortDir=desc')}
          hint={yours('fixed, waiting on your verification', 'Fixed - waiting on your verification')}
        />

        <StatCard
          label="Closed"
          value={closedCounts?.counts.total ?? 0}
          icon={CheckCircle2}
          tone="slate"
          to={withWho('/bugs?status=CLOSED&sortBy=last_change_time&sortDir=desc')}
          hint={yours('verified and closed', 'Verified and closed')}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild>
          <Link to="/bugs/new">
            <FilePlus2 className="h-3.5 w-3.5" /> File a bug
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link to="/search">Advanced search</Link>
        </Button>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Queue
          title="Longest open"
          subtitle={yours('open the longest, still waiting on a fix', 'Open the longest - still waiting on a fix')}
          to={withWho(`/bugs?${openQueryString}&sortBy=creation_time&sortDir=asc`)}
          loading={triageLoading}
          bugs={triage}
          emptyTitle="Nothing is ageing"
          emptyDescription="There are no open bugs right now."
          onTransfer={setTransferId}
        />

        <Queue
          title="Latest incoming"
          subtitle={yours(
            'newest first',
            reporter ? 'Newest first - the latest reports filed' : 'Newest first - what the bench has just filed',
          )}
          to={withWho('/bugs?sortBy=creation_time&sortDir=desc')}
          loading={feedLoading}
          bugs={feed}
          emptyTitle="Nothing filed yet"
          emptyDescription="New bugs will appear here as they arrive."
          onTransfer={setTransferId}
        />
      </div>

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
            <li
              key={bug.id}
              className="group flex items-start gap-3 px-5 py-3.5 transition-colors duration-200 hover:bg-slate-50/80"
            >
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
