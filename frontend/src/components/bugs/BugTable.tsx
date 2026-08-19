import { ArrowDown, ArrowUp, ArrowUpDown, Bug as BugIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Bug } from '../../types';
import { bugDisplayId, cn, tierOf, timeAgo } from '../../lib/utils';
import { Avatar } from '../ui/Avatar';
import { EmptyState } from '../ui/EmptyState';
import { PriorityPill, SeverityPill, StatusPill, TierPill } from '../ui/Pill';
import { TableSkeleton } from '../ui/Skeleton';

interface Column {
  key: string;
  label: string;
  sortable?: boolean;
  className?: string;
}

const COLUMNS: Column[] = [
  { key: 'id', label: 'ID', sortable: true, className: 'w-20' },
  { key: 'product', label: 'Product', sortable: true, className: 'w-32' },
  { key: 'component', label: 'Component', className: 'w-40' },
  { key: 'summary', label: 'Summary' },
  { key: 'assigned_to', label: 'Assignee', sortable: true, className: 'w-40' },
  { key: 'status', label: 'Status', sortable: true, className: 'w-32' },
  { key: 'severity', label: 'Severity', sortable: true, className: 'w-28' },
  { key: 'priority', label: 'Priority', sortable: true, className: 'w-24' },
  { key: 'status_whiteboard', label: 'Tier', sortable: true, className: 'w-24' },
  { key: 'last_change_time', label: 'Changed', sortable: true, className: 'w-24' },
];

export function BugTable({
  bugs,
  isLoading,
  sortBy,
  sortDir,
  onSort,
}: {
  bugs: Bug[];
  isLoading: boolean;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  onSort: (key: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-white/40 bg-white/40 text-xs font-medium uppercase tracking-wide text-slate-600">
            {COLUMNS.map((col) => (
              <th key={col.key} scope="col" className={cn('px-5 py-3 font-medium', col.className)}>
                {col.sortable ? (
                  <button
                    onClick={() => onSort(col.key)}
                    className="focus-ring -mx-1 flex items-center gap-1 rounded px-1 hover:text-slate-700"
                  >
                    {col.label}
                    {sortBy === col.key ? (
                      sortDir === 'asc' ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-100" />
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
              <td colSpan={COLUMNS.length}>
                <EmptyState icon={BugIcon} title="No bugs found" description="Try adjusting your filters or search terms." />
              </td>
            </tr>
          ) : (
            bugs.map((bug) => (
              <tr key={bug.id} className="border-b border-white/30 transition-colors last:border-0 hover:bg-white/50">
                <td className="px-5 py-3.5 font-mono text-xs text-slate-600">
                  <Link to={`/bugs/${bug.id}`} className="focus-ring rounded text-brand-700 hover:underline" title={`Bug #${bug.id}`}>
                    {bugDisplayId(bug)}
                  </Link>
                </td>
                <td className="max-w-[8rem] truncate px-5 py-3.5 text-slate-600" title={bug.product}>
                  {bug.product}
                </td>
                <td className="max-w-[10rem] truncate px-5 py-3.5 text-slate-600" title={bug.component}>
                  {bug.component}
                </td>
                <td className="max-w-md px-5 py-3.5">
                  <Link to={`/bugs/${bug.id}`} className="focus-ring rounded font-medium text-slate-900 hover:text-brand-700">
                    <span className="line-clamp-1">{bug.summary}</span>
                  </Link>
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <Avatar name={bug.assignedTo?.name ?? '?'} />
                    <span className="truncate text-slate-600">{bug.assignedTo?.name ?? 'Unassigned'}</span>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <StatusPill status={bug.status} />
                </td>
                <td className="px-5 py-3.5">
                  <SeverityPill severity={bug.severity} />
                </td>
                <td className="px-5 py-3.5">
                  <PriorityPill priority={bug.priority} />
                </td>
                <td className="px-5 py-3.5">
                  <TierPill tier={tierOf(bug)} />
                </td>
                <td className="whitespace-nowrap px-5 py-3.5 text-slate-600">{timeAgo(bug.lastChangeTime)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {isLoading && <TableSkeleton />}
    </div>
  );
}
