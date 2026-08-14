import { ExternalLink, Lock, SlidersHorizontal } from 'lucide-react';
import { ApiError } from '../../api/client';
import { useAdminParameters, useMeta } from '../../api/hooks';
import { Card, CardBody } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function Parameters() {
  const { data, isLoading, error } = useAdminParameters();
  const { data: meta } = useMeta();
  const entries = Object.entries(data?.parameters ?? {}).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="mx-auto max-w-[900px] px-4 py-8 sm:px-8">
      <PageHeader
        title="Parameters"
        description="Instance-wide configuration Bugzilla exposes to the API. Bugzilla intentionally surfaces only a safe subset here; the rest is edited in its admin."
        crumbs={[{ label: 'Administration' }, { label: 'Parameters' }]}
        actions={
          meta?.bugzillaWebUrl ? (
            <a
              href={`${meta.bugzillaWebUrl}/editparams.cgi`}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-white/70 px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-inset ring-white/60 hover:bg-white/90"
            >
              <ExternalLink className="h-4 w-4" /> Manage all in Bugzilla
            </a>
          ) : null
        }
      />

      {isLoading ? (
        <Card>
          <CardBody>
            <p className="text-sm text-slate-500">Loading parameters…</p>
          </CardBody>
        </Card>
      ) : error ? (
        <EmptyState
          icon={Lock}
          title="Parameters unavailable"
          description={error instanceof ApiError ? error.message : 'Bugzilla did not return parameters for this account.'}
        />
      ) : entries.length === 0 ? (
        <EmptyState icon={SlidersHorizontal} title="No parameters returned" description="This Bugzilla exposes no parameters over its API." />
      ) : (
        <Card>
          <div className="divide-y divide-white/40">
            {entries.map(([key, value]) => (
              <div key={key} className="flex items-start justify-between gap-4 px-5 py-3">
                <span className="font-mono text-xs font-medium text-slate-700">{key}</span>
                <span className="max-w-[60%] break-words text-right text-sm text-slate-900">{renderValue(value)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
