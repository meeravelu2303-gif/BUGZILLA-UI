import { AlertCircle, ChevronRight, Lock, Plus, ShieldCheck, Users, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { useAdminGroupList, useCreateGroup } from '../../api/hooks';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { Pill } from '../../components/ui/Pill';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../context/ToastContext';
import type { AdminGroupSummary } from '../../types';

/** Same rule the backend applies - a bad pattern is caught at the field, not as an upstream error. */
export function regexpError(v: string): string | undefined {
  if (!v) return undefined;
  try {
    new RegExp(v);
    return undefined;
  } catch {
    return 'This is not a valid regular expression.';
  }
}

function GroupRow({ group }: { group: AdminGroupSummary }) {
  return (
    <li>
      <Link
        to={`/admin/groups/${group.id}`}
        className="focus-ring group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-white/50"
      >
        {group.isBugGroup ? (
          <ShieldCheck className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
        ) : (
          <Lock className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-medium text-slate-900">{group.name}</span>
            {group.isProductGroup && <Pill tone="teal">Product access</Pill>}
            {!group.isActive && <Pill tone="amber">Inactive</Pill>}
            {group.userRegexp && (
              <span className="rounded bg-slate-900/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-slate-600" title="User regexp">
                /{group.userRegexp}/
              </span>
            )}
          </div>
          {group.description && <p className="mt-0.5 truncate text-xs text-slate-600">{group.description}</p>}
        </div>
        <span className="flex shrink-0 items-center gap-1 text-xs text-slate-500" title="Members">
          <Users className="h-3.5 w-3.5" aria-hidden />
          {group.memberCount}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </li>
  );
}

function CreateGroupCard({ onClose }: { onClose: () => void }) {
  const createGroup = useCreateGroup();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [userRegexp, setUserRegexp] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const errors = {
    name: !name.trim() ? 'Group name is required' : name.includes(',') ? 'Group names cannot contain a comma.' : undefined,
    description: !description.trim() ? 'Description is required' : undefined,
    userRegexp: regexpError(userRegexp),
  };
  const valid = !errors.name && !errors.description && !errors.userRegexp;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setServerError(null);
    if (!valid) return;
    try {
      const { group } = await createGroup.mutateAsync({
        name: name.trim(),
        description: description.trim(),
        userRegexp: userRegexp || undefined,
        isActive,
      });
      toast({ variant: 'success', title: `Group "${group.name}" created` });
      navigate(`/admin/groups/${group.id}`);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not create the group.');
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>New group</CardTitle>
        <button type="button" onClick={onClose} aria-label="Close" className="focus-ring rounded p-1 text-slate-500 hover:text-slate-800">
          <X className="h-4 w-4" />
        </button>
      </CardHeader>
      <CardBody>
        <form onSubmit={onSubmit} noValidate autoComplete="off" className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} error={submitted ? errors.name : undefined} maxLength={255} />
            <Input
              label="User regexp"
              value={userRegexp}
              onChange={(e) => setUserRegexp(e.target.value)}
              error={errors.userRegexp}
              placeholder="Optional, e.g. @kpost\.in$"
              hint="Accounts whose email matches are members automatically."
              className="font-mono text-[13px]"
            />
          </div>
          <Input
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            error={submitted ? errors.description : undefined}
            maxLength={255}
            placeholder="Who belongs here and what it unlocks"
          />
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="focus-ring mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600" />
            <span>
              <span className="font-medium text-slate-900">Active — use for bugs</span>
              <span className="block text-xs text-slate-600">Bugs can be restricted to this group. Turn off to retire it without losing membership.</span>
            </span>
          </label>
          {serverError && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
              {serverError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={createGroup.isPending}>
              <Plus className="h-4 w-4" /> Create group
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export function Groups() {
  const { data, isLoading, error } = useAdminGroupList();
  const [creating, setCreating] = useState(false);
  const groups = data?.groups ?? [];
  const bugGroups = groups.filter((g) => g.isBugGroup);
  const systemGroups = groups.filter((g) => !g.isBugGroup);

  return (
    <div className="mx-auto max-w-[960px] px-4 py-8 sm:px-8">
      <PageHeader
        title="Groups & Permissions"
        description="Groups decide who can see which product's bugs and who holds admin rights. Bug groups are editable here; Bugzilla's built-in system groups are read-only."
        crumbs={[{ label: 'Administration' }, { label: 'Groups & Permissions' }]}
        actions={
          !creating && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> New group
            </Button>
          )
        }
      />

      {creating && <CreateGroupCard onClose={() => setCreating(false)} />}

      {isLoading ? (
        <Card>
          <CardBody className="flex flex-col gap-3">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </CardBody>
        </Card>
      ) : error ? (
        <EmptyState icon={AlertCircle} title="Couldn't load groups" description={error instanceof ApiError ? error.message : 'Please try again.'} />
      ) : (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Bug & access groups
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">{bugGroups.length}</span>
              </CardTitle>
            </CardHeader>
            {bugGroups.length === 0 ? (
              <CardBody>
                <EmptyState icon={ShieldCheck} title="No bug groups yet" description="Create one to restrict bugs to a set of people." />
              </CardBody>
            ) : (
              <ul className="divide-y divide-white/40">
                {bugGroups.map((g) => (
                  <GroupRow key={g.id} group={g} />
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-slate-400" aria-hidden /> System groups
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">{systemGroups.length}</span>
              </CardTitle>
              <span className="text-xs text-slate-500">Read-only — built into Bugzilla</span>
            </CardHeader>
            <ul className="divide-y divide-white/40">
              {systemGroups.map((g) => (
                <GroupRow key={g.id} group={g} />
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
