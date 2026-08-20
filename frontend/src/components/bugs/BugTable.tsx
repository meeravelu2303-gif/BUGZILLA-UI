import { ArrowDown, ArrowUp, ArrowUpDown, Bug as BugIcon, ChevronRight, Layers } from 'lucide-react';
import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { bugDisplayId, cn, timeAgo } from '../../lib/utils';
import type { Bug } from '../../types';
import { Avatar } from '../ui/Avatar';
import { EmptyState } from '../ui/EmptyState';
import { CategoryPill, PriorityPill, SeverityPill, StatusPill } from '../ui/Pill';
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
  { key: 'severity', label: 'Severity', sortable: true, className: 'w-32' },
  { key: 'priority', label: 'Priority', sortable: true, className: 'w-24' },
  { key: 'category', label: 'Category', className: 'w-36' },
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
}) {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    /*
     * The table owns its own overflow so the page body never scrolls sideways,
     * and the header stays put while the rows scroll under it.
     */
    <div className="max-h-[70vh] overflow-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-white/40 bg-white/85 text-xs font-medium uppercase tracking-wide text-slate-700 backdrop-blur-md">
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
            {COLUMNS.map((col) => (
              <th key={col.key} scope="col" className={cn('px-3 py-3 font-medium', col.numeric && 'text-right', col.className)}>
                {col.sortable ? (
                  <button
                    onClick={() => onSort(col.key)}
                    className={cn(
                      'focus-ring -mx-1 flex items-center gap-1 rounded px-1 hover:text-slate-900',
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
              <td colSpan={COLUMNS.length + 1 + (selection ? 1 : 0)}>
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
                  <tr className="border-b border-white/30 align-middle transition-colors last:border-0 hover:bg-white/60">
                    {selection && (
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer rounded border-slate-300 text-brand-600 focus-ring"
                          checked={selection.selectedIds.has(bug.id)}
                          onChange={() => selection.onToggle(bug.id)}
                          aria-label={`Select ${bugDisplayId(bug)}`}
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
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-600">
                      <Link to={`/bugs/${bug.id}`} className="focus-ring rounded text-brand-800 hover:underline" title={`Bug #${bug.id}`}>
                        {bugDisplayId(bug)}
                      </Link>
                    </td>
                    <td className="max-w-0 px-3 py-2.5">
                      <Link
                        to={`/bugs/${bug.id}`}
                        className="focus-ring block truncate rounded font-medium text-slate-900 hover:text-brand-800"
                        title={bug.summary}
                      >
                        {bug.summary}
                      </Link>
                    </td>
                    <td className="max-w-0 truncate px-3 py-2.5 text-slate-700" title={bug.component}>
                      {bug.component}
                    </td>
                    <td className="px-3 py-2.5">{triage && <SeverityPill severity={triage.severity} />}</td>
                    <td className="px-3 py-2.5">{triage && <PriorityPill priority={triage.priority} />}</td>
                    <td className="px-3 py-2.5">{triage && <CategoryPill category={triage.category} />}</td>
                    <td className="px-3 py-2.5">
                      <StatusPill status={bug.status} />
                    </td>
                    <td className="max-w-0 px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Avatar name={bug.assignedTo?.name ?? '?'} />
                        <span className="truncate text-slate-700" title={bug.assignedTo?.name ?? 'Unassigned'}>
                          {bug.assignedTo?.name ?? 'Unassigned'}
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{timeAgo(bug.lastChangeTime)}</td>
                  </tr>

                  {isOpen && (
                    <tr className="border-b border-white/30 bg-slate-50/70">
                      {selection && <td />}
                      <td />
                      <td colSpan={COLUMNS.length} className="px-3 py-3">
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
