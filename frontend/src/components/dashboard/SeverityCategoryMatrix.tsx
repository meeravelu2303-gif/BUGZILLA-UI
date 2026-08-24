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
/** Severity ↔ priority pairing, shown beside each severity label. */
const PRIORITY_FOR: Record<string, string> = {
  Critical: 'P0',
  Major: 'P1',
  Minor: 'P2',
  Trivial: 'P3',
  Unclassified: '—',
};

/** Each priority badge takes its severity's colour so it stands out and reads at a glance. */
const PRIORITY_BADGE: Record<string, string> = {
  Critical: 'bg-rose-100 text-rose-700 ring-rose-600/30',
  Major: 'bg-amber-100 text-amber-800 ring-amber-600/30',
  Minor: 'bg-sky-100 text-sky-700 ring-sky-600/30',
  Trivial: 'bg-slate-100 text-slate-600 ring-slate-400/40',
  Unclassified: 'bg-slate-100 text-slate-500 ring-slate-400/40',
};

export function SeverityCategoryMatrix({ stats }: { stats: BugStats }) {
  /*
   * Open bugs only — the matrix is a picture of current defect load, and its cells
   * are navigation targets ("show me the 2 open Critical Security bugs"). Counting
   * resolved bugs here would send a reader to a filtered list far shorter than the
   * cell promised. Falls back to the lifetime tallies against a backend that
   * predates the open-only fields.
   */
  const byCategory = stats.openByCategory ?? stats.byCategory;
  const bySeverity = stats.openBySeverity ?? stats.bySeverity;
  const cells = stats.openMatrix ?? stats.matrix;

  // Empty bands are dropped so the grid does not carry columns of zeros -
  // Performance and Compatibility have no bugs until the bench's taxonomy grows.
  const categories = CATEGORIES.filter((c) => (byCategory[c] ?? 0) > 0);
  const severities = SEVERITIES.filter((s) => (bySeverity[s] ?? 0) > 0);
  const peak = Math.max(1, ...severities.flatMap((s) => categories.map((c) => cells[s]?.[c] ?? 0)));

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
                <span className="inline-flex items-center gap-2">
                  {s}
                  <span
                    className={cn(
                      'rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold tracking-tight ring-1 ring-inset',
                      PRIORITY_BADGE[s] ?? PRIORITY_BADGE.Unclassified
                    )}
                  >
                    {PRIORITY_FOR[s] ?? ''}
                  </span>
                </span>
              </th>
              {categories.map((c) => {
                const n = cells[s]?.[c] ?? 0;
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
                {(bySeverity[s] ?? 0).toLocaleString()}
              </td>
            </tr>
          ))}
          <tr className="border-t border-white/40">
            <th scope="row" className="py-2 pr-3 text-left text-xs font-medium uppercase tracking-wide text-slate-600">
              Total
            </th>
            {categories.map((c) => (
              <td key={c} className="px-2 py-2 text-center font-mono text-xs tabular-nums text-slate-700">
                {(byCategory[c] ?? 0).toLocaleString()}
              </td>
            ))}
            <td className="px-2 py-2 text-right font-mono text-xs font-semibold tabular-nums text-slate-900">
              {/* stats.open, not stats.total: every row and column here counts open
                  bugs, so a lifetime grand total would not equal the sum of its own
                  margins. */}
              {(stats.openBySeverity ? stats.open : stats.total).toLocaleString()}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
