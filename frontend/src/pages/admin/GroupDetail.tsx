import { AlertCircle, ArrowLeft, Lock, Save, Search, UserMinus, UserPlus, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { useAdminGroup, useChangeGroupMembers, useGroupUserSearch, useUpdateGroup } from '../../api/hooks';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Field';
import { Pill } from '../../components/ui/Pill';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../context/ToastContext';
import { useDebounce } from '../../lib/useDebounce';
import type { AdminGroupDetail, GroupMember } from '../../types';
import { regexpError } from './Groups';

/**
 * Bugzilla grants a regexp group to every login matching it, case-insensitively (`=~ m/$re/i`).
 * Such a member cannot be removed by hand - they would be re-added on the next login - so the
 * row says so instead of offering a Remove that silently does nothing.
 */
function matchesRegexp(email: string, re: string): boolean {
  if (!re) return false;
  try {
    return new RegExp(re, 'i').test(email);
  } catch {
    return false;
  }
}

function SettingsCard({ group }: { group: AdminGroupDetail }) {
  const updateGroup = useUpdateGroup(group.id);
  const { toast } = useToast();
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const [userRegexp, setUserRegexp] = useState(group.userRegexp);
  const [isActive, setIsActive] = useState(group.isActive);

  useEffect(() => {
    setName(group.name);
    setDescription(group.description);
    setUserRegexp(group.userRegexp);
    setIsActive(group.isActive);
  }, [group]);

  const readOnly = !group.isBugGroup;
  const errors = {
    name: !name.trim() ? 'Group name is required' : name.includes(',') ? 'Group names cannot contain a comma.' : undefined,
    description: !description.trim() ? 'Description is required' : undefined,
    userRegexp: regexpError(userRegexp),
  };
  const dirty =
    name.trim() !== group.name || description.trim() !== group.description || userRegexp !== group.userRegexp || isActive !== group.isActive;
  const valid = !errors.name && !errors.description && !errors.userRegexp;

  async function onSave() {
    try {
      await updateGroup.mutateAsync({
        ...(name.trim() !== group.name ? { name: name.trim() } : {}),
        ...(description.trim() !== group.description ? { description: description.trim() } : {}),
        ...(userRegexp !== group.userRegexp ? { userRegexp } : {}),
        ...(isActive !== group.isActive ? { isActive } : {}),
      });
      toast({ variant: 'success', title: 'Group updated' });
    } catch (err) {
      toast({ variant: 'error', title: 'Update failed', description: err instanceof ApiError ? err.message : 'Please try again.' });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        {!readOnly && dirty && (
          <Button size="sm" onClick={onSave} disabled={!valid} loading={updateGroup.isPending}>
            <Save className="h-3.5 w-3.5" /> Save
          </Button>
        )}
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={readOnly || group.isProductGroup}
          error={readOnly ? undefined : errors.name}
          hint={
            group.isProductGroup
              ? 'Controls access to the product of the same name, so it cannot be renamed here.'
              : undefined
          }
          className="font-mono text-[13px]"
          maxLength={255}
        />
        <Input
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={readOnly}
          error={readOnly ? undefined : errors.description}
          maxLength={255}
        />
        <Input
          label="User regexp"
          value={userRegexp}
          onChange={(e) => setUserRegexp(e.target.value)}
          disabled={readOnly}
          error={readOnly ? undefined : errors.userRegexp}
          placeholder={readOnly ? '—' : 'Optional, e.g. @kpost\\.in$'}
          hint="Accounts whose email matches are members automatically, and can't be removed by hand."
          className="font-mono text-[13px]"
        />
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            disabled={readOnly}
            className="focus-ring mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 disabled:opacity-50"
          />
          <span>
            <span className="font-medium text-slate-900">Active — use for bugs</span>
            <span className="block text-xs text-slate-600">
              Bugzilla's one "active" flag. Off: no new bugs can be restricted to this group; bugs already restricted and
              all members are kept.
              {group.isProductGroup && isActive !== group.isActive && !isActive && (
                <span className="mt-1 block font-medium text-amber-700">
                  This group gates a product - deactivating it changes how that product's bugs are restricted.
                </span>
              )}
            </span>
          </span>
        </label>
      </CardBody>
    </Card>
  );
}

function AddMemberPicker({ group, onAdd, busy }: { group: AdminGroupDetail; onAdd: (u: GroupMember) => void; busy: boolean }) {
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query, 250);
  const { data, isFetching } = useGroupUserSearch(debounced);
  const memberIds = useMemo(() => new Set(group.members.map((m) => m.id)), [group.members]);
  const results = (data?.users ?? []).filter(() => debounced.trim().length >= 2);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="member-search" className="text-sm font-medium text-slate-700">
        Add people
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          id="member-search"
          type="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email (2+ characters)"
          className="focus-ring w-full rounded-xl border border-white/60 bg-white/80 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-500"
        />
      </div>
      {debounced.trim().length >= 2 && (
        <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-xl bg-white ring-1 ring-slate-900/10" aria-busy={isFetching}>
          {results.length === 0 ? (
            <li className="px-3 py-4 text-center text-sm text-slate-500">{isFetching ? 'Searching…' : 'No matching accounts.'}</li>
          ) : (
            results.map((u) => {
              const isMember = memberIds.has(u.id);
              return (
                <li key={u.id} className="flex items-center gap-3 px-3 py-2">
                  <Avatar name={u.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{u.name}</p>
                    <p className="truncate text-xs text-slate-500">{u.email}</p>
                  </div>
                  {!u.isEnabled && <Pill tone="rose">Disabled</Pill>}
                  {isMember ? (
                    <span className="text-xs font-medium text-slate-500">Member</span>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => onAdd(u)} disabled={busy}>
                      <UserPlus className="h-3.5 w-3.5" /> Add
                    </Button>
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

function MembersCard({ group }: { group: AdminGroupDetail }) {
  const change = useChangeGroupMembers(group.id);
  const { toast } = useToast();
  const [filter, setFilter] = useState('');
  const readOnly = !group.isBugGroup;
  const shown = group.members.filter((m) => `${m.name} ${m.email}`.toLowerCase().includes(filter.trim().toLowerCase()));

  async function apply(input: { add?: number[]; remove?: number[] }, label: string) {
    try {
      const result = await change.mutateAsync(input);
      if (result.failed?.length) {
        toast({ variant: 'error', title: 'Membership not changed', description: result.failed.map((f) => f.message).join(' ') });
      } else if (result.notRemoved?.length) {
        toast({
          variant: 'error',
          title: 'Still a member',
          description: `${result.notRemoved.join(', ')} matches the group's user regexp or inherits it from another group, so Bugzilla keeps them in.`,
        });
      } else {
        toast({ variant: 'success', title: label });
      }
    } catch (err) {
      toast({ variant: 'error', title: 'Membership not changed', description: err instanceof ApiError ? err.message : 'Please try again.' });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-4 w-4 text-brand-600" aria-hidden /> Members
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">{group.members.length}</span>
        </CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-5">
        {!readOnly && <AddMemberPicker group={group} busy={change.isPending} onAdd={(u) => apply({ add: [u.id] }, `${u.name} added`)} />}

        {group.members.length > 8 && (
          <Input aria-label="Filter members" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter members…" autoComplete="off" />
        )}

        {group.members.length === 0 ? (
          <EmptyState icon={Users} title="No members" description={readOnly ? 'Nobody holds this group.' : 'Search above to add people.'} />
        ) : (
          <ul className="divide-y divide-white/40 rounded-xl ring-1 ring-inset ring-white/60">
            {shown.map((m) => {
              const viaRegexp = matchesRegexp(m.email, group.userRegexp);
              return (
                <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                  <Avatar name={m.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{m.name}</p>
                    <p className="truncate text-xs text-slate-500">{m.email}</p>
                  </div>
                  {!m.isEnabled && <Pill tone="rose">Disabled</Pill>}
                  {viaRegexp && (
                    <span className="text-xs text-slate-500" title="Granted by the group's user regexp">
                      via regexp
                    </span>
                  )}
                  {m.inheritedVia === 'admin' && (
                    <span className="text-xs text-slate-500" title="Bugzilla gives the admin group membership in every group">
                      via admin
                    </span>
                  )}
                  {!readOnly && !viaRegexp && !m.inheritedVia && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => apply({ remove: [m.id] }, `${m.name} removed`)}
                      disabled={change.isPending}
                      aria-label={`Remove ${m.name}`}
                    >
                      <UserMinus className="h-3.5 w-3.5" /> Remove
                    </Button>
                  )}
                </li>
              );
            })}
            {shown.length === 0 && <li className="px-3 py-4 text-center text-sm text-slate-500">No member matches "{filter}".</li>}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

export function GroupDetail() {
  const { id } = useParams<{ id: string }>();
  const groupId = Number(id);
  const { data, isLoading, error } = useAdminGroup(groupId);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[960px] px-4 py-8 sm:px-8">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-4 h-64" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-[960px] px-4 py-8 sm:px-8">
        <EmptyState icon={AlertCircle} title="Couldn't load this group" description={error instanceof ApiError ? error.message : 'Please try again.'} />
      </div>
    );
  }

  const { group } = data;
  return (
    <div className="mx-auto max-w-[960px] px-4 py-8 sm:px-8">
      <Link to="/admin/groups" className="focus-ring inline-flex items-center gap-1.5 rounded text-sm text-slate-600 hover:text-slate-700">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to groups
      </Link>

      <div className="mb-6 mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-xl font-semibold tracking-tight text-slate-900">{group.name}</h1>
        {!group.isBugGroup && (
          <Pill tone="slate">
            <Lock className="h-3 w-3" /> System group
          </Pill>
        )}
        {group.isProductGroup && <Pill tone="teal">Product access</Pill>}
        <Pill tone={group.isActive ? 'emerald' : 'amber'}>{group.isActive ? 'Active' : 'Inactive'}</Pill>
      </div>

      {!group.isBugGroup && (
        <div className="mb-6 flex items-start gap-3 rounded-xl bg-slate-900/[0.04] px-4 py-3 text-sm text-slate-700 ring-1 ring-inset ring-slate-900/10">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          <p>
            This is one of Bugzilla's built-in permission groups, so it is shown read-only. Changing who holds it can lock
            people out of administration or grant it to the wrong person.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <SettingsCard group={group} />
        <MembersCard group={group} />
      </div>
    </div>
  );
}
