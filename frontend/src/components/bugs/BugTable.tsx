import { ArrowDown, ArrowUp, ArrowUpDown, Bug as BugIcon, ChevronRight, Layers } from 'lucide-react';
import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { bugDisplayId, cn, timeAgo } from '../../lib/utils';
import type { Bug } from '../../types';
import { Avatar } from '../ui/Avatar';
import { EmptyState } from '../ui/EmptyState';
import { BrowserPills, CategoryPill, PriorityPill, SeverityPill, StatusPill, TestTypePill } from '../ui/Pill';
import { TableSkeleton } from '../ui/Skeleton';

interface Column {
  key: string;
  label: string;
  sortable?: boolean;
  className?: string;
  /** Right-aligned, so digits line up down the column. */
  numeric?: boolean;
}

/*
 * `severity` sorts on Bugzilla's bug_severity sortkey, which ranks
 * blocker->trivial rather than sorting the words alphabetically. `importance`
 * (the default) is the composite triage order: severity, then priority.
 */
const COLUMNS: Column[] = [
  { key: 'id', label: 'ID', sortable: true, className: 'w-24' },
  { key: 'summary', label: 'Summary', sortable: true },
  { key: 'component', label: 'Component', sortable: true, className: 'w-44' },
  /*
   * Which bench filed the bug. Sorts on `product`, the field it is derived from
   * - there is no separate "test type" column in Bugzilla to order by.
   */
  { key: 'product', label: 'Type', sortable: true, className: 'w-36' },
  { key: 'severity', label: 'Severity', sortable: true, className: 'w-32' },
  { key: 'priority', label: 'Priority', sortable: true, className: 'w-24' },
  { key: 'category', label: 'Category', className: 'w-36' },
  // Not sortable: browser comes from a whiteboard tag, and Bugzilla cannot
  // order by a substring of one. Shown so a triager can scan for their browser.
  //
  // The only OPTIONAL column: it is dropped entirely for an API-only scope,
  // where every cell in it would read "—". See `showBrowser` below.
  { key: 'browser', label: 'Browser', className: 'w-32' },
  { key: 'status', label: 'Status', sortable: true, className: 'w-28' },
  { key: 'assigned_to', label: 'Assignee', sortable: true, className: 'w-40' },
  { key: 'last_change_time', label: 'Changed', sortable: true, className: 'w-24' },
];

export function BugTable({
  bugs,
  isLoading,
  sortBy,
  sortDir,
  onSort,
  selection,
  showBrowserColumn,
}: {
  bugs: Bug[];
  isLoading: boolean;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  onSort: (key: string) => void;
  /** When provided, renders a selection checkbox column for bulk actions. */
  selection?: {
    selectedIds: Set<number>;
    onToggle: (id: number) => void;
    onToggleAll: () => void;
    allOnPageSelected: boolean;
  };
  /**
   * Whether the Browser column is meaningful here — normally from
   * `useBrowserScope`, which answers it for the whole filtered scope rather
   * than for the page on screen.
   *
   * Left undefined, it falls back to whether any row on this page carries a
   * browser. That keeps the component usable on its own, but it is the weaker
   * signal: the column can then appear and disappear between pages of the same
   * list. Callers that have the filters should pass the prop.
   */
  showBrowserColumn?: boolean;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);

  const showBrowser =
    showBrowserColumn ?? bugs.some((bug) => (bug.triage?.browsers?.length ?? 0) > 0);

  /*
   * One filtered list drives the header, the body and every colSpan below, so a
   * hidden column cannot leave a stray header cell or a misaligned empty-state
   * row behind it.
   */
  const columns = showBrowser ? COLUMNS : COLUMNS.filter((col) => col.key !== 'browser');
  /** Data columns + the expander, plus the checkbox when bulk actions are on. */
  const totalColumnCount = columns.length + 1 + (selection ? 1 : 0);

  return (
    /*
     * The table owns its own overflow so the page body never scrolls sideways,
     * and the header stays put while the rows scroll under it.
     */
    <div className="max-h-[70vh] overflow-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="sticky top-0 z-10">
          {/*
            Opaque slate-50, not slate-50/50: this header is `sticky`, so any
            alpha lets the rows scrolling underneath show straight through the
            column labels. Over the white card the flat tint lands in the same
            place visually, without that cost.
          */}
          <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
            {selection && (
              <th scope="col" className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer rounded border-slate-300 text-brand-600 focus-ring"
                  checked={selection.allOnPageSelected}
                  onChange={selection.onToggleAll}
                  aria-label="Select all bugs on this page"
                />
              </th>
            )}
            <th scope="col" className="w-8 px-2 py-3">
              <span className="sr-only">Expand row</span>
            </th>
            {columns.map((col) => (
              <th key={col.key} scope="col" className={cn('px-3 py-2.5 font-semibold', col.numeric && 'text-right', col.className)}>
                {col.sortable ? (
                  <button
                    onClick={() => onSort(col.key)}
                    className={cn(
                      'focus-ring -mx-1 flex items-center gap-1 rounded px-1 transition-colors hover:text-slate-900',
                      col.numeric && 'ml-auto flex-row-reverse'
                    )}
                  >
                    {col.label}
                    {sortBy === col.key ? (
                      sortDir === 'asc' ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </button>
                ) : (
                  col.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? null : bugs.length === 0 ? (
            <tr>
              <td colSpan={totalColumnCount}>
                <EmptyState icon={BugIcon} title="No bugs match these filters" description="Try removing a filter, or clear them all." />
              </td>
            </tr>
          ) : (
            bugs.map((bug) => {
              const triage = bug.triage;
              const group = bug.grouping;
              const endpoints = group?.affectedEndpoints ?? [];
              const canExpand = endpoints.length > 0;
              const isOpen = expanded === bug.id;
              return (
                <Fragment key={bug.id}>
                  <tr className="border-b border-slate-100 align-middle transition-colors last:border-0 hover:bg-slate-50/80">
                    {selection && (
                      <td className="px-3 py-2.5">
                        {/*
                          Closed bugs are not selectable: the only bulk action is
                          reassignment, and reassigning finished work is refused by
                          the backend. Disabling here means the refusal never has to
                          happen - the reason is on the control instead of arriving
                          as an error after the fact.
                        */}
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus-ring enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                          checked={selection.selectedIds.has(bug.id)}
                          disabled={!bug.isOpen}
                          onChange={() => selection.onToggle(bug.id)}
                          aria-label={
                            bug.isOpen
                              ? `Select ${bugDisplayId(bug)}`
                              : `${bugDisplayId(bug)} is closed and cannot be reassigned`
                          }
                          title={bug.isOpen ? undefined : `${bug.status} bugs can't be reassigned — reopen it first.`}
                        />
                      </td>
                    )}
                    <td className="px-2 py-2.5">
                      {canExpand && (
                        <button
                          onClick={() => setExpanded(isOpen ? null : bug.id)}
                          aria-expanded={isOpen}
                          aria-label={`Show affected endpoints for ${bugDisplayId(bug)}`}
                          className="focus-ring rounded p-0.5 text-slate-500 hover:text-slate-800"
                        >
                          <ChevronRight className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-90')} />
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-middle">
                      <Link
                        to={`/bugs/${bug.id}`}
                        className="focus-ring rounded font-mono text-xs text-slate-600 transition-colors hover:text-slate-900 hover:underline"
                        title={`Bug #${bug.id}`}
                      >
                        {bugDisplayId(bug)}
                      </Link>
                    </td>
                    <td className="max-w-0 px-3 py-2.5 align-middle">
                      <Link
                        to={`/bugs/${bug.id}`}
                        className="focus-ring block truncate rounded font-medium text-slate-900 transition-colors hover:text-brand-800"
                        title={bug.summary}
                      >
                        {bug.summary}
                      </Link>
                    </td>
                    <td className="max-w-0 truncate px-3 py-2.5 align-middle font-medium text-slate-700" title={bug.component}>
                      {bug.component}
                    </td>
                    <td className="px-3 py-2.5 align-middle">
                      <TestTypePill product={bug.product} />
                    </td>
                    <td className="px-3 py-2.5 align-middle">{triage && <SeverityPill severity={triage.severity} />}</td>
                    <td className="px-3 py-2.5 align-middle">{triage && <PriorityPill priority={triage.priority} />}</td>
                    <td className="px-3 py-2.5 align-middle">{triage && <CategoryPill category={triage.category} />}</td>
                    {showBrowser && (
                      <td className="px-3 py-2.5 align-middle">
                        {triage?.browsers && triage.browsers.length > 0 ? (
                          <BrowserPills browsers={triage.browsers} />
                        ) : (
                          /*
                           * The column is shown, so this scope has UI bugs -
                           * but an individual row may still be an API bug, or a
                           * UI bug filed before browser tagging existed. An em
                           * dash reads as "not applicable"; blank reads as a
                           * value that failed to load.
                           */
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2.5 align-middle">
                      <StatusPill status={bug.status} />
                    </td>
                    <td className="max-w-0 px-3 py-2.5 align-middle">
                      <div className="flex items-center gap-2">
                        <Avatar name={bug.assignedTo?.name ?? '?'} />
                        <span className="truncate font-medium text-slate-700" title={bug.assignedTo?.name ?? 'Unassigned'}>
                          {bug.assignedTo?.name ?? 'Unassigned'}
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 align-middle text-slate-500">
                      {timeAgo(bug.lastChangeTime)}
                    </td>
                  </tr>

                  {isOpen && (
                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      {selection && <td />}
                      <td />
                      <td colSpan={columns.length} className="px-3 py-3">
                        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-700">
                          <Layers className="h-3.5 w-3.5" aria-hidden />
                          Affected endpoints
                          {group?.truncated && (
                            <span className="font-normal text-slate-600">
                              (first {endpoints.length} of {group.endpointCount})
                            </span>
                          )}
                        </p>
                        <ul className="flex flex-col gap-1">
                          {endpoints.map((e) => (
                            <li key={`${e.method} ${e.path}`} className="flex items-center gap-2 font-mono text-xs text-slate-700">
                              <span className="w-14 shrink-0 font-semibold text-slate-900">{e.method}</span>
                              <span className="min-w-0 flex-1 truncate" title={e.path}>
                                {e.path}
                              </span>
                              <span className="shrink-0 text-slate-500">{e.module}</span>
                              <span className="w-10 shrink-0 text-right">x{e.occurrences}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
      {isLoading && <TableSkeleton />}
    </div>
  );
}
