import { UserRound } from 'lucide-react';
import { useReporters } from '../../api/hooks';
import { Select } from '../ui/Field';

/** Whose reported bugs the QA board shows - for admins. */
export function ReporterPicker({ value, onChange }: { value: string; onChange: (email: string) => void }) {
  const { data, isLoading } = useReporters();
  const people = data?.users ?? [];
  const testers = people.filter((person) => person.role === 'tester');
  const admins = people.filter((person) => person.role === 'admin');
  const staff = people.filter((person) => person.role === 'reporter');
  const developers = people.filter((person) => person.role === 'developer');
  const selected = people.find((person) => person.email === value);

  return (
    <div className="mb-5 flex flex-wrap items-end gap-3">
      <div className="w-full sm:w-80">
        <Select
          label="Reporter"
          value={value}
          disabled={isLoading}
          onChange={(event) => onChange(event.target.value)}
          hint={isLoading ? 'Loading reporters…' : 'Bugs reported by this person'}
        >
          <option value="">Everyone</option>
          {testers.length > 0 && (
            <optgroup label="Testers">
              {testers.map((tester) => (
                <option key={tester.email} value={tester.email}>
                  {tester.name}
                </option>
              ))}
            </optgroup>
          )}
          {staff.length > 0 && (
            <optgroup label="Reporters (office staff)">
              {staff.map((item) => (
                <option key={item.email} value={item.email}>
                  {item.name}
                </option>
              ))}
            </optgroup>
          )}
          {developers.length > 0 && (
            <optgroup label="Developers (who have filed bugs)">
              {developers.map((developer) => (
                <option key={developer.email} value={developer.email}>
                  {developer.name}
                </option>
              ))}
            </optgroup>
          )}
          {admins.length > 0 && (
            <optgroup label="Admins">
              {admins.map((admin) => (
                <option key={admin.email} value={admin.email}>
                  {admin.name}
                </option>
              ))}
            </optgroup>
          )}
        </Select>
      </div>
      {value && (
        <p className="mb-6 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-800 ring-1 ring-inset ring-brand-600/15">
          <UserRound className="h-3.5 w-3.5" aria-hidden />
          Reported by {selected?.name ?? value}
        </p>
      )}
    </div>
  );
}
