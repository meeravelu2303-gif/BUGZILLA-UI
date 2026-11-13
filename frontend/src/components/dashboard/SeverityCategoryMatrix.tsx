import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { CATEGORIES, SEVERITIES, type BugStats, type Category, type Severity } from '../../types';

const PRIORITY_FOR: Record<string, string> = {
  Critical: 'P0',
  Major: 'P1',
  Minor: 'P2',
  Trivial: 'P3',
  Unclassified: '—',
};

const PRIORITY_BADGE: Record<string, string> = {
  Critical: 'bg-rose-100 text-rose-700 ring-rose-600/30',
  Major: 'bg-amber-100 text-amber-800 ring-amber-600/30',
  Minor: 'bg-sky-100 text-sky-700 ring-sky-600/30',
  Trivial: 'bg-slate-100 text-slate-600 ring-slate-400/40',
  Unclassified: 'bg-slate-100 text-slate-500 ring-slate-400/40',
};

export function SeverityCategoryMatrix({ stats }: { stats: BugStats }) {
  const byCategory = stats.openByCategory ?? stats.byCategory;
  const bySeverity = stats.openBySeverity ?? stats.bySeverity;
  const cells = stats.openMatrix ?? stats.matrix;

  const categories = CATEGORIES.filter((category) => (byCategory[category] ?? 0) > 0);
  const severities = SEVERITIES.filter((severity) => (bySeverity[severity] ?? 0) > 0);
  const peak = Math.max(
    1,
    ...severities.flatMap((severity) => categories.map((category) => cells[severity]?.[category] ?? 0)),
  );

  const shade = (value: number) => {
    if (value === 0) return 'bg-white/40 text-slate-400';
    const ratio = value / peak;
    if (ratio > 0.66)
      return 'bg-gradient-to-br from-brand-500/35 to-brand-700/35 text-slate-900 font-semibold ring-1 ring-inset ring-brand-600/30';
    if (ratio > 0.33) return 'bg-brand-500/20 text-slate-900 font-medium ring-1 ring-inset ring-brand-600/15';
    return 'bg-brand-500/[0.08] text-slate-800';
  };

  const href = (rowSeverity: Severity, columnCategory: Category) =>
    `/bugs?severity=${encodeURIComponent(rowSeverity)}&category=${encodeURIComponent(columnCategory)}`;

  if (categories.length === 0 || severities.length === 0) {
    return <p className="text-sm text-slate-600">No classified bugs to cross-tabulate yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className="py-2 pr-3 text-left text-xs font-medium uppercase tracking-wide text-slate-600">
              Severity
            </th>
            {categories.map((category) => (
              <th
                key={category}
                scope="col"
                className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wide text-slate-600"
              >
                {category}
              </th>
            ))}
            <th scope="col" className="px-2 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate-600">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {severities.map((severity) => (
            <tr key={severity}>
              <th scope="row" className="py-1.5 pr-3 text-left text-sm font-medium text-slate-800">
                <span className="inline-flex items-center gap-2">
                  {severity}
                  <span
                    className={cn(
                      'rounded-md px-1.5 py-0.5 font-mono text-[0.7333rem] font-bold tracking-tight ring-1 ring-inset',
                      PRIORITY_BADGE[severity] ?? PRIORITY_BADGE.Unclassified,
                    )}
                  >
                    {PRIORITY_FOR[severity] ?? ''}
                  </span>
                </span>
              </th>
              {categories.map((category) => {
                const count = cells[severity]?.[category] ?? 0;
                return (
                  <td key={category} className="p-0.5">
                    {count === 0 ? (
                      <div className={cn('rounded-lg px-2 py-2 text-center tabular-nums', shade(0))}>0</div>
                    ) : (
                      <Link
                        to={href(severity, category)}
                        title={`${count} ${severity} / ${category} ${count === 1 ? 'bug' : 'bugs'} — click to filter`}
                        className={cn(
                          'focus-ring block rounded-lg px-2 py-2 text-center tabular-nums transition-colors hover:ring-2 hover:ring-brand-700/40',
                          shade(count),
                        )}
                      >
                        {count.toLocaleString()}
                      </Link>
                    )}
                  </td>
                );
              })}
              <td className="px-2 py-2 text-right font-mono text-xs tabular-nums text-slate-700">
                {(bySeverity[severity] ?? 0).toLocaleString()}
              </td>
            </tr>
          ))}
          <tr className="border-t border-white/40">
            <th scope="row" className="py-2 pr-3 text-left text-xs font-medium uppercase tracking-wide text-slate-600">
              Total
            </th>
            {categories.map((category) => (
              <td key={category} className="px-2 py-2 text-center font-mono text-xs tabular-nums text-slate-700">
                {(byCategory[category] ?? 0).toLocaleString()}
              </td>
            ))}
            <td className="px-2 py-2 text-right font-mono text-xs font-semibold tabular-nums text-slate-900">
              {(stats.openBySeverity ? stats.open : stats.total).toLocaleString()}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
