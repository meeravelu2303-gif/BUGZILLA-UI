import { UserRound } from 'lucide-react';
import { useMemo } from 'react';
import { useAssignableUsers, useBugStats } from '../../api/hooks';
import { Select } from '../ui/Field';

/** Whose Developer board to show - for admins and testers. */
export function DeveloperPicker({ value, onChange }: { value: string; onChange: (email: string) => void }) {
  const { data, isLoading } = useAssignableUsers();
  const { data: stats } = useBugStats({});
  const developers = useMemo(
    () =>
      (data?.users ?? [])
        .filter((user) => user.role === 'developer' || user.role === undefined)
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name)),
    [data],
  );
  const load = (email: string) => {
    const key = email.toLowerCase();
    return { total: stats?.byAssignee?.[key] ?? 0, open: stats?.openByAssignee?.[key] ?? 0 };
  };
  const selected = developers.find((developer) => developer.email === value);

  return (
    <div className="mb-5 flex flex-wrap items-end gap-3">
      <div className="w-full sm:w-96">
        <Select
          label="Developer"
          value={value}
          disabled={isLoading}
          onChange={(event) => onChange(event.target.value)}
          hint={
            isLoading
              ? 'Loading developers…'
              : value
                ? `${selected?.name ?? value} · ${load(value).total} bugs assigned, ${load(value).open} open`
                : `${developers.length} developers · showing everyone's assigned work`
          }
        >
          <option value="">All developers</option>
          {developers.map((developer) => {
            const workload = load(developer.email);
            return (
              <option key={developer.email} value={developer.email}>
                {developer.name} · {workload.open} open
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
