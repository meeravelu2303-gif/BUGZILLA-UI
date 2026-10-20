import { UserRound } from 'lucide-react';
import { useMemo } from 'react';
import { useAssignableUsers } from '../../api/hooks';
import { Select } from '../ui/Field';

/**
 * Whose Developer board to show - for admins and testers, who otherwise only
 * ever saw their own (usually empty) one.
 *
 * The list is the BFF's assignable-users pool with no product: everyone who
 * takes defects, strict testers already removed, each tagged with a role. Only
 * `developer` is offered - admins are not the people a backlog review is about.
 * The signed-in user is never in that pool, so "Me" is added as the first entry.
 *
 * `value` is an email, or '' for "Me".
 */
export function DeveloperPicker({
  value,
  onChange,
  meName,
}: {
  value: string;
  onChange: (email: string) => void;
  meName: string;
}) {
  const { data, isLoading } = useAssignableUsers();
  const developers = useMemo(
    () =>
      (data?.users ?? [])
        .filter((u) => u.role !== 'admin')
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [data]
  );

  return (
    <div className="mb-5 flex flex-wrap items-end gap-3">
      <div className="w-full sm:w-80">
        <Select
          label="Developer"
          value={value}
          disabled={isLoading}
          onChange={(e) => onChange(e.target.value)}
          hint={isLoading ? 'Loading developers…' : `${developers.length} developers · showing their assigned work`}
        >
          <option value="">Me ({meName})</option>
          {developers.map((d) => (
            <option key={d.email} value={d.email}>
              {d.name}
            </option>
          ))}
        </Select>
      </div>
      {value && (
        <p className="mb-6 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-800 ring-1 ring-inset ring-brand-600/15">
          <UserRound className="h-3.5 w-3.5" aria-hidden />
          Viewing {developers.find((d) => d.email === value)?.name ?? value}&rsquo;s board
        </p>
      )}
    </div>
  );
}
