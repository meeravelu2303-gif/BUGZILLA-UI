import { ArrowRight, Check, ExternalLink } from 'lucide-react';
import { useMeta } from '../../api/hooks';
import { Card, CardBody, CardHeader, CardTitle } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatusPill } from '../../components/ui/Pill';
import { cn } from '../../lib/utils';

export function Workflow() {
  const { data: meta, isLoading } = useMeta();
  const workflow = meta?.workflow ?? [];
  const statuses = workflow.map((w) => w.status);

  const canGo = (from: string, to: string) => workflow.find((w) => w.status === from)?.canChangeTo.includes(to) ?? false;

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-8">
      <PageHeader
        title="Status Workflow"
        description="Which status a bug may move to from each current status. This mirrors Bugzilla’s workflow — edit transitions in Bugzilla."
        crumbs={[{ label: 'Administration' }, { label: 'Status Workflow' }]}
        actions={
          meta?.bugzillaWebUrl ? (
            <a
              href={`${meta.bugzillaWebUrl}/editworkflow.cgi`}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-white/70 px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-inset ring-white/60 hover:bg-white/90"
            >
              <ExternalLink className="h-4 w-4" /> Edit in Bugzilla
            </a>
          ) : null
        }
      />

      {isLoading ? (
        <Card>
          <CardBody>
            <p className="text-sm text-slate-500">Loading workflow…</p>
          </CardBody>
        </Card>
      ) : workflow.length === 0 ? (
        <EmptyState icon={ArrowRight} title="No workflow data" description="Bugzilla did not return status transition information." />
      ) : (
        <>
          <Card className="mb-6 overflow-hidden">
            <CardHeader>
              <CardTitle>Transition matrix</CardTitle>
              <span className="text-xs text-slate-500">row → column</span>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-white/70 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      From \ To
                    </th>
                    {statuses.map((s) => (
                      <th key={s} className="px-3 py-3 text-center text-[11px] font-medium text-slate-600">
                        {s.replace('_', ' ')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {statuses.map((from) => (
                    <tr key={from} className="border-t border-white/40">
                      <th className="sticky left-0 z-10 whitespace-nowrap bg-white/70 px-4 py-2.5 text-left">
                        <StatusPill status={from} />
                      </th>
                      {statuses.map((to) => {
                        const allowed = canGo(from, to);
                        return (
                          <td key={to} className="px-3 py-2.5 text-center">
                            <span
                              className={cn(
                                'inline-flex h-6 w-6 items-center justify-center rounded-md',
                                from === to
                                  ? 'bg-slate-100 text-slate-300'
                                  : allowed
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'text-slate-200'
                              )}
                              aria-label={allowed ? `${from} can change to ${to}` : `${from} cannot change to ${to}`}
                            >
                              {from === to ? '·' : allowed ? <Check className="h-3.5 w-3.5" /> : '—'}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workflow.map((w) => (
              <Card key={w.status}>
                <CardBody>
                  <div className="mb-2 flex items-center gap-2">
                    <StatusPill status={w.status} />
                    <span className={cn('text-xs font-medium', w.isOpen ? 'text-amber-600' : 'text-emerald-600')}>
                      {w.isOpen ? 'Open' : 'Closed'}
                    </span>
                  </div>
                  <p className="mb-1.5 text-xs text-slate-500">Can change to</p>
                  <div className="flex flex-wrap gap-1.5">
                    {w.canChangeTo.length === 0 ? (
                      <span className="text-xs text-slate-400">— (terminal)</span>
                    ) : (
                      w.canChangeTo.map((to) => <StatusPill key={to} status={to} />)
                    )}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
