import { UserRound } from 'lucide-react';
import { useMemo } from 'react';
import { useAssignableUsers, useBugStats } from '../../api/hooks';
import { Select } from '../ui/Field';

/**
 * Whose Developer board to show - for admins and testers.
 *
 * Opens on "All developers": the team-wide backlog, worst first, which is the
 * question a lead opens this tab with. Picking a person narrows every card and
 * the backlog to them. The signed-in admin or tester is not offered - their own
 * assigned work is on My Bugs, and this board is about the developers.
 *
 * Each option carries the person's load (total assigned, and how many are
 * open), read from one stats call rather than one count request per developer.
 *
 * `value` is an email, or '' for everyone.
 */
export function DeveloperPicker({ value, onChange }: { value: string; onChange: (email: string) => void }) {
  const { data, isLoading } = useAssignableUsers();
  const { data: stats } = useBugStats({});
  const developers = useMemo(
    () =>
      (data?.users ?? [])
        // Developers only: admins and testers (who appear in the pool as component owners) are left out.
        .filter((u) => u.role === 'developer' || u.role === undefined)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [data]
  );
  const load = (email: string) => {
    const key = email.toLowerCase();
    return { total: stats?.byAssignee?.[key] ?? 0, open: stats?.openByAssignee?.[key] ?? 0 };
  };
  const selected = developers.find((d) => d.email === value);

  return (
    <div className="mb-5 flex flex-wrap items-end gap-3">
      <div className="w-full sm:w-96">
        <Select
          label="Developer"
          value={value}
          disabled={isLoading}
          onChange={(e) => onChange(e.target.value)}
          hint={
            isLoading
              ? 'Loading developers…'
              : value
                ? `${selected?.name ?? value} · ${load(value).total} bugs assigned, ${load(value).open} open`
                : `${developers.length} developers · showing everyone's assigned work`
          }
        >
          <option value="">All developers</option>
          {developers.map((d) => {
            const n = load(d.email);
            return (
              <option key={d.email} value={d.email}>
                {d.name} · {n.open} open
              </option>
            );
          })}
        </Select>
      </div>
      {value && (
        <p className="mb-6 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-800 ring-1 ring-inset ring-brand-600/15">
          <UserRound className="h-3.5 w-3.5" aria-hidden />
          Viewing {selected?.name ?? value}&rsquo;s board
        </p>
      )}
    </div>
  );
}
