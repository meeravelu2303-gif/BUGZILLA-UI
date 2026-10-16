import { AlertTriangle, CheckCircle2, ChevronDown, Play, ShieldCheck, Wrench } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { useSanityCheck } from '../../api/hooks';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { useToast } from '../../context/ToastContext';
import { cn } from '../../lib/utils';
import type { SanityCheckResult } from '../../types';

/** What each repair actually does - shown in its confirmation, in plain words. */
const FIX_EFFECT: Record<string, string> = {
  repair_creation_date: 'Sets a creation date on these bugs (taken from their first comment), so they become visible again.',
  repair_bugs_fulltext: 'Rebuilds the full-text search entries for these bugs.',
  repair_everconfirmed: 'Corrects the "ever confirmed" flag on these bugs to match their status.',
  createmissinggroupcontrolmapentries: 'Adds the missing product group-control entries these bugs need.',
  remove_invalid_bug_references: 'Deletes rows in other tables that point at bugs which no longer exist.',
  remove_invalid_attach_references: 'Deletes rows that point at attachments which no longer exist.',
  remove_invalid_flags: 'Deletes flags that are in a product or component where their flag type is not allowed.',
  rescanallBugMail: 'Sends the notification email that was never sent for these bugs.',
  remove_old_whine_targets: 'Deletes scheduled-report recipients whose user or group no longer exists.',
};

export function SanityCheck() {
  const run = useSanityCheck();
  const { toast } = useToast();
  const [result, setResult] = useState<SanityCheckResult | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [showPassed, setShowPassed] = useState(false);

  async function go(fix?: string) {
    try {
      const r = await run.mutateAsync(fix);
      setResult(r);
      setConfirming(null);
      if (fix) toast({ variant: 'success', title: 'Repair ran, checks re-run', description: r.problemsFound ? 'Some problems remain.' : 'No problems remain.' });
    } catch (err) {
      toast({ variant: 'error', title: fix ? 'Repair failed' : 'Sanity check failed', description: err instanceof ApiError ? err.message : 'Please try again.' });
    }
  }

  // The first and last lines are "now running" / "completed" banners, not checks.
  const checks = (result?.checks ?? []).filter((c) => !/^(OK, now running|Sanity check completed)/i.test(c.title));
  const problems = checks.filter((c) => c.alerts.length > 0);
  const passed = checks.filter((c) => c.alerts.length === 0);

  return (
    <div className="mx-auto max-w-[960px] px-4 py-8 sm:px-8">
      <PageHeader
        title="Sanity Check"
        description="Bugzilla's database consistency check. Running it only reads the database; each repair is a separate, confirmed action - nothing is fixed automatically."
        crumbs={[{ label: 'Administration' }, { label: 'Sanity Check' }]}
        actions={
          <Button onClick={() => go()} loading={run.isPending && !confirming}>
            <Play className="h-4 w-4" /> {result ? 'Run again' : 'Run sanity check'}
          </Button>
        }
      />

      {!result ? (
        <Card>
          <CardBody className="flex flex-col items-center gap-2 py-12 text-center">
            <ShieldCheck className="h-8 w-8 text-slate-400" />
            <p className="text-sm font-medium text-slate-700">Not run yet</p>
            <p className="max-w-md text-xs text-slate-500">Checks cross-references between bugs, users, groups and products, flags, search entries and unsent mail. It takes a few seconds and changes nothing.</p>
          </CardBody>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <div
            className={cn(
              'flex items-center gap-3 rounded-xl px-4 py-3 text-sm ring-1 ring-inset',
              problems.length ? 'bg-amber-50 text-amber-900 ring-amber-600/20' : 'bg-emerald-50 text-emerald-900 ring-emerald-600/20'
            )}
          >
            {problems.length ? <AlertTriangle className="h-5 w-5 shrink-0" /> : <CheckCircle2 className="h-5 w-5 shrink-0" />}
            <p>
              <span className="font-semibold">{problems.length ? `${problems.length} check${problems.length === 1 ? '' : 's'} found problems` : 'No problems found'}</span>
              {' '}· {checks.length} checks · {(result.durationMs / 1000).toFixed(1)} s · {new Date(result.ranAt).toLocaleTimeString()}
              {result.fixApplied && <> · after repair <span className="font-mono">{result.fixApplied}</span></>}
            </p>
          </div>

          {problems.map((c) => (
            <Card key={c.title}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-900">
                  <AlertTriangle className="h-4 w-4" /> {c.title}
                </CardTitle>
              </CardHeader>
              <CardBody className="flex flex-col gap-3">
                {c.alerts.map((a, i) => (
                  <div key={i} className="rounded-lg bg-white/70 px-3 py-2 text-sm text-slate-800 ring-1 ring-inset ring-white/60">
                    <p>{a.text.replace(/\s*\(as bug list\)\.?$/, '')}</p>
                    {a.bugIds.length > 0 && (
                      <p className="mt-1 flex flex-wrap gap-1.5 text-xs">
                        {a.bugIds.slice(0, 50).map((id) => (
                          <Link key={id} to={`/bugs/${id}`} className="focus-ring rounded bg-slate-100 px-1.5 py-0.5 font-mono text-brand-700 hover:bg-slate-200">#{id}</Link>
                        ))}
                        {a.bugIds.length > 50 && <span className="text-slate-500">and {a.bugIds.length - 50} more</span>}
                      </p>
                    )}
                  </div>
                ))}

                {c.fixes.length === 0 ? (
                  <p className="text-xs text-slate-500">Bugzilla offers no automatic repair for this - it needs to be investigated by hand.</p>
                ) : (
                  c.fixes.map((f) =>
                    confirming === f.action ? (
                      <div key={f.action} className="flex flex-col gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900 ring-1 ring-inset ring-amber-600/20">
                        <p className="font-medium">{f.label}</p>
                        <p className="text-xs leading-5">{FIX_EFFECT[f.action] ?? 'Runs Bugzilla’s repair for this check.'} This changes the database. All checks run again afterwards.</p>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => go(f.action)} loading={run.isPending}>
                            <Wrench className="h-3.5 w-3.5" /> Yes, repair
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div key={f.action}>
                        <Button size="sm" variant="secondary" onClick={() => setConfirming(f.action)}>
                          <Wrench className="h-3.5 w-3.5" /> {f.label}
                        </Button>
                      </div>
                    )
                  )
                )}
              </CardBody>
            </Card>
          ))}

          <Card>
            <button type="button" onClick={() => setShowPassed((v) => !v)} aria-expanded={showPassed} className="focus-ring flex w-full items-center justify-between px-5 py-4 text-left">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {passed.length} checks passed
              </span>
              <ChevronDown className={cn('h-4 w-4 text-slate-500 transition-transform', showPassed && 'rotate-180')} />
            </button>
            {showPassed && (
              <ul className="divide-y divide-white/40 border-t border-white/40">
                {passed.map((c) => (
                  <li key={c.title} className="px-5 py-2 text-sm text-slate-700">
                    {c.title}
                    {c.steps.length > 0 && <span className="ml-2 text-xs text-slate-500">({c.steps.length} reference{c.steps.length === 1 ? '' : 's'})</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
