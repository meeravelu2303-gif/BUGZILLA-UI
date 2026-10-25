import { Crown, Pencil, Plus, Search, Trash2, UsersRound, X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { useDeleteTeam, useSaveTeam, useSearchableAssignees, useTeams, type AssignableUser, type Team } from '../../api/hooks';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input, Select } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../context/ToastContext';

const ROLE_LABEL: Record<NonNullable<AssignableUser['role']>, string> = {
  developer: 'Developer',
  tester: 'Tester',
  admin: 'Admin',
  reporter: 'Reporter',
};
const ROLE_ORDER = ['developer', 'tester', 'admin', 'reporter'] as const;

/**
 * Teams: a name, one team leader and the members who report to them. Members
 * may work on any product - a team is who reports to whom, so each leader can
 * be sent their team's activity. Admin only.
 */
export function Teams() {
  const { data, isLoading, error } = useTeams();
  const teams = data?.teams ?? [];
  const [editing, setEditing] = useState<Team | 'new' | null>(null);

  return (
    <div className="mx-auto max-w-[72rem] animate-page-in px-4 py-6 sm:px-6 lg:px-8 2xl:px-10">
      <PageHeader
        title="Teams"
        description="Group people into teams, each with one team leader. Members can work on any product."
        crumbs={[{ label: 'Administration' }, { label: 'Teams' }]}
        actions={
          editing === null ? (
            <Button onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" /> New team
            </Button>
          ) : null
        }
      />

      {editing !== null && (
        <TeamForm key={editing === 'new' ? 'new' : editing.id} team={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
      )}

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : error ? (
        <Card>
          <CardBody>
            <p className="text-sm text-slate-600">{error instanceof ApiError ? error.message : 'Could not load the teams.'}</p>
          </CardBody>
        </Card>
      ) : teams.length === 0 ? (
        editing === null && (
          <Card>
            <CardBody>
              <EmptyState
                icon={UsersRound}
                title="No teams yet"
                description="Create the first team: give it a name, choose its team leader and add the members."
              />
            </CardBody>
          </Card>
        )
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {teams.map((team) => (
            <TeamCard key={team.id} team={team} onEdit={() => setEditing(team)} editingThis={editing !== null && editing !== 'new' && editing.id === team.id} />
          ))}
        </div>
      )}
    </div>
  );
}

function TeamCard({ team, onEdit, editingThis }: { team: Team; onEdit: () => void; editingThis: boolean }) {
  const remove = useDeleteTeam();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);

  async function onDelete() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    try {
      await remove.mutateAsync(team.id);
      toast({ variant: 'success', title: 'Team deleted', description: `${team.name} was deleted. Its people are not affected.` });
    } catch (err) {
      toast({ variant: 'error', title: 'Could not delete the team', description: err instanceof ApiError ? err.message : 'Please try again.' });
      setConfirming(false);
    }
  }

  return (
    <Card className={editingThis ? 'ring-2 ring-brand-300' : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersRound className="h-4 w-4 text-brand-600" />
          <span className="truncate">{team.name}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">
            {team.members.length} {team.members.length === 1 ? 'member' : 'members'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl bg-amber-50/70 px-3 py-2 ring-1 ring-inset ring-amber-100">
          <Crown className="h-4 w-4 shrink-0 text-amber-600" />
          {team.leader ? (
            <div className="min-w-0">
              <p className="text-xs text-amber-700">Team leader</p>
              <p className="truncate text-sm font-semibold text-slate-900">
                {team.leader.name} <span className="font-normal text-slate-500">({team.leader.email})</span>
              </p>
            </div>
          ) : (
            <p className="text-sm text-amber-800">No team leader - the leader's account was removed. Edit the team to choose one.</p>
          )}
        </div>

        {team.members.length === 0 ? (
          <p className="text-sm text-slate-500">No members yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {team.members.map((m) => (
              <li key={m.id} title={m.email} className="flex items-center gap-1.5 rounded-full bg-white/70 py-1 pl-1 pr-3 text-sm text-slate-700 ring-1 ring-inset ring-slate-200">
                <Avatar name={m.name} size="sm" />
                {m.name}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
          {confirming && !remove.isPending && (
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Keep team
            </Button>
          )}
          <Button variant={confirming ? 'danger' : 'ghost'} size="sm" onClick={onDelete} loading={remove.isPending}>
            <Trash2 className="h-3.5 w-3.5" /> {confirming ? 'Click again to delete' : 'Delete'}
          </Button>
          <Button variant="secondary" size="sm" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function TeamForm({ team, onDone }: { team: Team | null; onDone: () => void }) {
  const { data: peopleData, isLoading: peopleLoading } = useSearchableAssignees();
  const save = useSaveTeam();
  const { toast } = useToast();

  const [name, setName] = useState(team?.name ?? '');
  const [leader, setLeader] = useState(team?.leader?.email ?? '');
  const [members, setMembers] = useState<string[]>(team?.members.map((m) => m.email) ?? []);
  const [filter, setFilter] = useState('');
  const [formError, setFormError] = useState('');

  const people = useMemo(() => (peopleData?.users ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)), [peopleData]);
  const byEmail = useMemo(() => new Map(people.map((p) => [p.email.toLowerCase(), p])), [people]);
  const selected = new Set(members.map((m) => m.toLowerCase()));

  const choices = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return people.filter((p) => p.email.toLowerCase() !== leader.toLowerCase() && (!q || `${p.name} ${p.email}`.toLowerCase().includes(q)));
  }, [people, filter, leader]);

  function toggle(email: string) {
    setMembers((prev) => (prev.some((m) => m.toLowerCase() === email.toLowerCase()) ? prev.filter((m) => m.toLowerCase() !== email.toLowerCase()) : [...prev, email]));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!name.trim()) return setFormError('Please give the team a name.');
    if (!leader) return setFormError('Please choose the team leader.');
    try {
      const input = { name: name.trim(), leader, members: members.filter((m) => m.toLowerCase() !== leader.toLowerCase()) };
      const result = await save.mutateAsync(team ? { id: team.id, ...input } : input);
      toast({
        variant: 'success',
        title: team ? 'Team updated' : 'Team created',
        description: `${result.team.name}: led by ${result.team.leader?.name ?? 'nobody'}, ${result.team.members.length} ${result.team.members.length === 1 ? 'member' : 'members'}.`,
      });
      onDone();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save the team. Please try again.');
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersRound className="h-4 w-4 text-brand-600" /> {team ? `Edit team: ${team.name}` : 'New team'}
        </CardTitle>
      </CardHeader>
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Team name" required value={name} maxLength={64} onChange={(e) => setName(e.target.value)} placeholder="e.g. Flutter Developers" />
            <Select
              label="Team leader"
              required
              value={leader}
              disabled={peopleLoading}
              onChange={(e) => setLeader(e.target.value)}
              hint="Gets this team's reports. Can lead more than one team."
            >
              <option value="">{peopleLoading ? 'Loading people…' : 'Choose the team leader'}</option>
              {ROLE_ORDER.map((role) => {
                const group = people.filter((p) => (p.role ?? 'developer') === role);
                if (group.length === 0) return null;
                return (
                  <optgroup key={role} label={`${ROLE_LABEL[role]}s`}>
                    {group.map((p) => (
                      <option key={p.email} value={p.email}>
                        {p.name} ({p.email})
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </Select>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-slate-800">Members</p>
                <p className="text-xs text-slate-500">Anyone, on any product. A person can be in more than one team.</p>
              </div>
              <span className="text-xs font-medium text-brand-700">{members.length} selected</span>
            </div>

            {members.length > 0 && (
              <ul className="mb-3 flex flex-wrap gap-2">
                {members.map((email) => {
                  const p = byEmail.get(email.toLowerCase());
                  return (
                    <li key={email} className="flex items-center gap-1 rounded-full bg-brand-50 py-1 pl-3 pr-1 text-sm text-brand-800 ring-1 ring-inset ring-brand-200">
                      {p?.name ?? email}
                      <button
                        type="button"
                        onClick={() => toggle(email)}
                        className="focus-ring rounded-full p-0.5 text-brand-600 hover:bg-brand-100"
                        aria-label={`Remove ${p?.name ?? email}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search people by name or email"
                className="focus-ring h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm"
              />
            </div>
            <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white">
              {peopleLoading ? (
                <p className="p-3 text-sm text-slate-500">Loading people…</p>
              ) : choices.length === 0 ? (
                <p className="p-3 text-sm text-slate-500">Nobody matches "{filter}".</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {choices.map((p) => (
                    <li key={p.email}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={selected.has(p.email.toLowerCase())}
                          onChange={() => toggle(p.email)}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600"
                        />
                        <Avatar name={p.name} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-slate-900">{p.name}</span>
                          <span className="block truncate text-xs text-slate-500">{p.email}</span>
                        </span>
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{ROLE_LABEL[p.role ?? 'developer']}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {formError && <p className="text-sm font-medium text-rose-600">{formError}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onDone} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {team ? 'Save changes' : 'Create team'}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
