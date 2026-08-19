import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { CATEGORIES, SEVERITIES, type BugStats, type Category, type Severity } from '../../types';

/**
 * The two axes crossed: severity down, category across.
 *
 * Every cell is a link into the bug list with both filters applied, so the
 * matrix is a navigation surface rather than a picture - "17 Critical Security
 * bugs" is one click from the list of those 17.
 *
 * Intensity is a background wash, but the number is always present and readable,
 * so the cell never depends on colour alone to be understood.
 */
export function SeverityCategoryMatrix({ stats }: { stats: BugStats }) {
  // Empty bands are dropped so the grid does not carry columns of zeros -
  // Performance and Compatibility have no bugs until the bench's taxonomy grows.
  const categories = CATEGORIES.filter((c) => (stats.byCategory[c] ?? 0) > 0);
  const severities = SEVERITIES.filter((s) => (stats.bySeverity[s] ?? 0) > 0);
  const peak = Math.max(1, ...severities.flatMap((s) => categories.map((c) => stats.matrix[s]?.[c] ?? 0)));

  const shade = (n: number) => {
    if (n === 0) return 'bg-white/40 text-slate-400';
    const ratio = n / peak;
    if (ratio > 0.66) return 'bg-brand-700/25 text-slate-900 font-semibold';
    if (ratio > 0.33) return 'bg-brand-700/15 text-slate-900 font-medium';
    return 'bg-brand-700/[0.07] text-slate-800';
  };

  const href = (s: Severity, c: Category) => `/bugs?severity=${encodeURIComponent(s)}&category=${encodeURIComponent(c)}`;

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
            {categories.map((c) => (
              <th key={c} scope="col" className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wide text-slate-600">
                {c}
              </th>
            ))}
            <th scope="col" className="px-2 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate-600">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {severities.map((s) => (
            <tr key={s}>
              <th scope="row" className="py-1.5 pr-3 text-left text-sm font-medium text-slate-800">
                {s}
              </th>
              {categories.map((c) => {
                const n = stats.matrix[s]?.[c] ?? 0;
                return (
                  <td key={c} className="p-0.5">
                    {n === 0 ? (
                      <div className={cn('rounded-lg px-2 py-2 text-center tabular-nums', shade(0))}>0</div>
                    ) : (
                      <Link
                        to={href(s, c)}
                        title={`${n} ${s} / ${c} ${n === 1 ? 'bug' : 'bugs'} — click to filter`}
                        className={cn(
                          'focus-ring block rounded-lg px-2 py-2 text-center tabular-nums transition-colors hover:ring-2 hover:ring-brand-700/40',
                          shade(n)
                        )}
                      >
                        {n.toLocaleString()}
                      </Link>
                    )}
                  </td>
                );
              })}
              <td className="px-2 py-2 text-right font-mono text-xs tabular-nums text-slate-700">
                {(stats.bySeverity[s] ?? 0).toLocaleString()}
              </td>
            </tr>
          ))}
          <tr className="border-t border-white/40">
            <th scope="row" className="py-2 pr-3 text-left text-xs font-medium uppercase tracking-wide text-slate-600">
              Total
            </th>
            {categories.map((c) => (
              <td key={c} className="px-2 py-2 text-center font-mono text-xs tabular-nums text-slate-700">
                {(stats.byCategory[c] ?? 0).toLocaleString()}
              </td>
            ))}
            <td className="px-2 py-2 text-right font-mono text-xs font-semibold tabular-nums text-slate-900">
              {stats.total.toLocaleString()}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
