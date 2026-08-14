import { ExternalLink, ShieldCheck, Users } from 'lucide-react';
import { ApiError } from '../../api/client';
import { useAdminGroups, useMe, useMeta } from '../../api/hooks';
import { Card, CardBody, CardHeader, CardTitle } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';

export function Groups() {
  const { data, isLoading, error } = useAdminGroups();
  const { data: me } = useMe();
  const { data: meta } = useMeta();
  const groups = data?.groups ?? [];

  return (
    <div className="mx-auto max-w-[900px] px-4 py-8 sm:px-8">
      <PageHeader
        title="Groups & Permissions"
        description="The groups your account belongs to. Creating groups and editing membership is security-critical and stays in Bugzilla’s native admin by design."
        crumbs={[{ label: 'Administration' }, { label: 'Groups & Permissions' }]}
        actions={
          meta?.bugzillaWebUrl ? (
            <a
              href={`${meta.bugzillaWebUrl}/editgroups.cgi`}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-white/70 px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-inset ring-white/60 hover:bg-white/90"
            >
              <ExternalLink className="h-4 w-4" /> Manage in Bugzilla
            </a>
          ) : null
        }
      />

      <Card className="mb-6">
        <CardBody className="flex flex-wrap gap-3">
          <div className="rounded-xl bg-white/60 px-4 py-3 ring-1 ring-inset ring-white/60">
            <p className="text-xs text-slate-500">Signed in as</p>
            <p className="text-sm font-semibold text-slate-900">{me?.user.email}</p>
          </div>
          <div className="rounded-xl bg-white/60 px-4 py-3 ring-1 ring-inset ring-white/60">
            <p className="text-xs text-slate-500">Manage users</p>
            <p className="text-sm font-semibold text-slate-900">{me?.user.permissions.canManageUsers ? 'Yes' : 'No'}</p>
          </div>
          <div className="rounded-xl bg-white/60 px-4 py-3 ring-1 ring-inset ring-white/60">
            <p className="text-xs text-slate-500">Manage products</p>
            <p className="text-sm font-semibold text-slate-900">{me?.user.permissions.canManageProducts ? 'Yes' : 'No'}</p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-brand-600" /> My group memberships
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">{groups.length}</span>
          </CardTitle>
        </CardHeader>
        <CardBody>
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading groups…</p>
          ) : error ? (
            <p className="text-sm text-slate-500">
              {error instanceof ApiError ? error.message : 'Could not load group membership.'}
            </p>
          ) : groups.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="No group memberships" description="Your account isn’t a member of any Bugzilla group." />
          ) : (
            <div className="divide-y divide-white/40">
              {groups.map((g) => (
                <div key={g.name} className="flex items-start gap-3 py-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                  <div>
                    <p className="font-mono text-sm font-medium text-slate-900">{g.name}</p>
                    {g.description && <p className="text-xs text-slate-600">{g.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
