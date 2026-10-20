import { UserRound } from 'lucide-react';
import { useReporters } from '../../api/hooks';
import { Select } from '../ui/Field';

/**
 * Whose reported bugs the QA board shows - for admins.
 *
 * Filters on Bugzilla's own reporter field. Bugs filed in this app carry the
 * signed-in person as reporter; bugs filed by the test bench carry the account
 * whose API key the bench uses, so those all sit under that one person until
 * the bench files as the tester who ran it.
 *
 * `value` is an email, or '' for everyone.
 */
export function ReporterPicker({ value, onChange }: { value: string; onChange: (email: string) => void }) {
  const { data, isLoading } = useReporters();
  const people = data?.users ?? [];
  const testers = people.filter((p) => p.role === 'tester');
  const admins = people.filter((p) => p.role === 'admin');
  const selected = people.find((p) => p.email === value);

  return (
    <div className="mb-5 flex flex-wrap items-end gap-3">
      <div className="w-full sm:w-80">
        <Select
          label="Reporter"
          value={value}
          disabled={isLoading}
          onChange={(e) => onChange(e.target.value)}
          hint={isLoading ? 'Loading reporters…' : 'Bugs reported by this person'}
        >
          <option value="">Everyone</option>
          {testers.length > 0 && (
            <optgroup label="Testers">
              {testers.map((p) => (
                <option key={p.email} value={p.email}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
          {admins.length > 0 && (
            <optgroup label="Admins">
              {admins.map((p) => (
                <option key={p.email} value={p.email}>
                  {p.name}
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
