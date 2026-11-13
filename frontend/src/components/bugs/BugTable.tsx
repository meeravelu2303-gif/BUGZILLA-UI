import { ArrowDown, ArrowUp, ArrowUpDown, Bug as BugIcon, ChevronRight, Layers } from 'lucide-react';
import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { bugDisplayId, cn, timeAgo } from '../../lib/utils';
import type { Bug } from '../../types';
import { Avatar } from '../ui/Avatar';
import { EmptyState } from '../ui/EmptyState';
import {
  BrowserPills,
  CategoryPill,
  MobilePill,
  NoBrowserPill,
  PriorityPill,
  SeverityPill,
  StatusPill,
  TestTypePill,
} from '../ui/Pill';
import { TableSkeleton } from '../ui/Skeleton';

interface Column {
  key: string;
  label: string;
  sortable?: boolean;
  className?: string;
  numeric?: boolean;
}

const COLUMNS: Column[] = [
  { key: 'id', label: 'ID', sortable: true, className: 'w-[5.25rem] whitespace-nowrap' },
  { key: 'summary', label: 'Summary', sortable: true, className: 'min-w-[18rem]' },
  { key: 'severity', label: 'Severity', sortable: true, className: 'w-[5.75rem]' },
  { key: 'priority', label: 'Priority', sortable: true, className: 'w-[4.25rem]' },
  { key: 'category', label: 'Category', className: 'w-[6.5rem]' },
  { key: 'browser', label: 'Browser', className: 'w-24' },
  { key: 'status', label: 'Status', sortable: true, className: 'w-[6.75rem]' },
  { key: 'assigned_to', label: 'Assignee', sortable: true, className: 'w-32' },
  { key: 'last_change_time', label: 'Changed', sortable: true, className: 'w-[4.5rem]' },
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
  selection?: {
    selectedIds: Set<number>;
    onToggle: (id: number) => void;
    onToggleAll: () => void;
    allOnPageSelected: boolean;
    canSelect: (bug: Bug) => boolean;
    selectReason: (bug: Bug) => string | undefined;
  };
  showBrowserColumn?: boolean;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);

  const showBrowser =
    showBrowserColumn ??
    bugs.some((bug) => (bug.triage?.browsers?.length ?? 0) > 0 || bug.triage?.uiPlatform === 'Mobile');

  const columns = showBrowser ? COLUMNS : COLUMNS.filter((column) => column.key !== 'browser');
  const totalColumnCount = columns.length + 1 + (selection ? 1 : 0);

  return (
    <div className="max-h-[70vh] overflow-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-hairline bg-slate-50 text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-slate-500">
            {selection && (
              <th scope="col" className="w-9 px-2.5 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer rounded border-line text-brand-600 focus-ring"
                  checked={selection.allOnPageSelected}
                  onChange={selection.onToggleAll}
                  aria-label="Select all bugs on this page"
                />
              </th>
            )}
            <th scope="col" className="w-7 px-1.5 py-3">
              <span className="sr-only">Expand row</span>
            </th>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn('px-3 py-3 font-semibold', column.numeric && 'text-right', column.className)}
              >
                {column.sortable ? (
                  <button
                    onClick={() => onSort(column.key)}
                    className={cn(
                      'focus-ring -mx-1 flex items-center gap-1 rounded px-1 transition-colors hover:text-slate-900',
                      column.numeric && 'ml-auto flex-row-reverse',
                    )}
                  >
                    {column.label}
                    {sortBy === column.key ? (
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
                  column.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? null : bugs.length === 0 ? (
            <tr>
              <td colSpan={totalColumnCount}>
                <EmptyState
                  icon={BugIcon}
                  title="No bugs match these filters"
                  description="Try removing a filter, or clear them all."
                />
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
                  <tr className="group/row border-b border-hairline align-middle transition-colors last:border-0 hover:bg-brand-50/50">
                    {selection && (
                      <td className="px-2.5 py-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-line text-brand-600 focus-ring enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                          checked={selection.selectedIds.has(bug.id)}
                          disabled={!selection.canSelect(bug)}
                          onChange={() => selection.onToggle(bug.id)}
                          aria-label={selection.selectReason(bug) ?? `Select ${bugDisplayId(bug)}`}
                          title={selection.selectReason(bug)}
                        />
                      </td>
                    )}
                    <td className="px-1.5 py-3">
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
                    <td className="whitespace-nowrap px-3 py-3 align-middle">
                      <Link
                        to={`/bugs/${bug.id}`}
                        className="focus-ring inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[0.7333rem] font-semibold text-slate-600 ring-1 ring-inset ring-slate-900/[0.06] transition-colors hover:bg-brand-50 hover:text-brand-800 hover:ring-brand-500/30"
                        title={`Bug #${bug.id}`}
                      >
                        {bugDisplayId(bug)}
                      </Link>
                    </td>
                    <td className="max-w-0 min-w-[18rem] px-3 py-2.5 align-middle">
                      <Link
                        to={`/bugs/${bug.id}`}
                        className="focus-ring block truncate rounded text-[0.9rem] font-medium text-slate-900 transition-colors group-hover/row:text-brand-800"
                        title={bug.summary}
                      >
                        {bug.summary}
                      </Link>
                      <div className="mt-1 flex min-w-0 items-center gap-1.5">
                        <TestTypePill
                          product={bug.product}
                          source={bug.triage?.source}
                          testType={bug.triage?.testType}
                        />
                        <span className="text-slate-300" aria-hidden>
                          ·
                        </span>
                        <span
                          className="truncate text-xs text-slate-500"
                          title={bug.subcomponentName ? `${bug.component} / ${bug.subcomponentName}` : bug.component}
                        >
                          {bug.component}
                          {bug.subcomponentName && <span className="text-slate-400"> › {bug.subcomponentName}</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-middle">{triage && <SeverityPill severity={triage.severity} />}</td>
                    <td className="px-3 py-3 align-middle">{triage && <PriorityPill priority={triage.priority} />}</td>
                    <td className="px-3 py-3 align-middle">{triage && <CategoryPill category={triage.category} />}</td>
                    {showBrowser && (
                      <td className="px-3 py-3 align-middle">
                        {triage?.uiPlatform === 'Mobile' ? (
                          <MobilePill devices={triage.devices} />
                        ) : triage?.browsers && triage.browsers.length > 0 ? (
                          <BrowserPills browsers={triage.browsers} />
                        ) : (
                          <NoBrowserPill testType={triage?.testType} />
                        )}
                      </td>
                    )}
                    <td className="px-3 py-3 align-middle">
                      <StatusPill status={bug.status} />
                    </td>
                    <td className="max-w-0 px-3 py-3 align-middle">
                      <div className="flex items-center gap-2">
                        <Avatar name={bug.assignedTo?.name ?? '?'} />
                        <span
                          className="truncate text-[0.8667rem] font-medium text-slate-700"
                          title={bug.assignedTo?.name ?? 'Unassigned'}
                        >
                          {bug.assignedTo?.name ?? 'Unassigned'}
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 align-middle text-xs tabular-nums text-slate-500">
                      {timeAgo(bug.lastChangeTime)}
                    </td>
                  </tr>

                  {isOpen && (
                    <tr className="border-b border-hairline bg-slate-50/60">
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
                          {endpoints.map((endpoint) => (
                            <li
                              key={`${endpoint.method} ${endpoint.path}`}
                              className="flex items-center gap-2 font-mono text-xs text-slate-700"
                            >
                              <span className="w-14 shrink-0 font-semibold text-slate-900">{endpoint.method}</span>
                              <span className="min-w-0 flex-1 truncate" title={endpoint.path}>
                                {endpoint.path}
                              </span>
                              <span className="shrink-0 text-slate-500">{endpoint.module}</span>
                              <span className="w-10 shrink-0 text-right">x{endpoint.occurrences}</span>
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
