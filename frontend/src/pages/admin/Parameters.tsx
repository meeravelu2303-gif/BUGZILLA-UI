import { AlertCircle, AlertOctagon, KeyRound, RotateCcw, Save, Search, ShieldAlert, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../api/client';
import { useBugzillaParams, useUpdateBugzillaParams } from '../../api/hooks';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../context/ToastContext';
import { cn } from '../../lib/utils';
import type { BugzillaParam, ParamValue } from '../../types';

/**
 * What goes wrong if a dangerous parameter is set badly - shown in the confirmation. Learned by
 * actually breaking each one on staging (see bugzilla-extension/README.md for the recovery steps).
 */
const RISK: Record<string, string> = {
  shutdownhtml:
    'Takes Bugzilla offline for everyone - including this admin UI, which can then NOT turn it back off. Recovery is on the server (README: "Emergency parameter reset") or via the native editparams.cgi page.',
  urlbase: 'Links in emails and redirects will point to this address. A wrong value sends people to the wrong site.',
  sslbase: 'The HTTPS address Bugzilla redirects to. Bugzilla refuses a value it cannot reach.',
  ssl_redirect: 'Sends every request, including this UI’s, to sslbase over HTTPS. Without working HTTPS, nothing can reach Bugzilla.',
  user_verify_class: 'How passwords are checked. A misconfigured LDAP/RADIUS source means nobody can log in.',
  user_info_class: 'Where logins come from. A wrong value stops every new login, here and in Bugzilla - existing sessions keep working until they expire.',
  cookiepath: 'Where Bugzilla’s login cookie is valid. A wrong path signs everyone out of native Bugzilla (this UI is unaffected).',
  cookiedomain: 'Which domain gets the login cookie. A wrong domain signs everyone out of native Bugzilla (this UI is unaffected).',
  requirelogin: 'Hides everything from logged-out visitors and anonymous API calls.',
  emailregexp: 'Which email addresses are allowed. A pattern that rejects existing addresses blocks those accounts from new sign-ups and email changes.',
  utf8: 'The database character set. Changing it on a live database can corrupt text.',
  utf8_collate: 'The database collation. Changing it on a live database can corrupt sorting and comparisons.',
};
const MAIL_RISK = 'Email delivery. A wrong value can stop all mail - or start sending mail from a system that should not.';

const fmt = (v: ParamValue | undefined) => (Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'on' : 'off') : (v ?? ''));
const same = (a: ParamValue | undefined, b: ParamValue | undefined) => fmt(a) === fmt(b);

function ParamInput({ p, value, onChange }: { p: BugzillaParam; value: ParamValue; onChange: (v: ParamValue) => void }) {
  const id = `param-${p.name}`;
  if (p.type === 'b') {
    return (
      <label className="inline-flex items-center gap-2 text-sm">
        <input id={id} type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} className="focus-ring h-4 w-4 rounded border-slate-300 text-brand-600" />
        {value ? 'On' : 'Off'}
      </label>
    );
  }
  if (p.type === 's' && p.choices) {
    return (
      <select id={id} value={String(value)} onChange={(e) => onChange(e.target.value)} className="focus-ring w-full max-w-md rounded-xl border border-white/60 bg-white/80 px-3 py-2 text-sm">
        {p.choices.map((c) => (
          <option key={c} value={c}>{c || '(none)'}</option>
        ))}
      </select>
    );
  }
  if (p.type === 'm' && p.choices) {
    const set = new Set(Array.isArray(value) ? value : []);
    return (
      <div className="flex flex-wrap gap-2">
        {p.choices.map((c) => (
          <label key={c} className="flex items-center gap-1.5 rounded-lg bg-white/60 px-2 py-1 text-sm ring-1 ring-inset ring-white/60">
            <input type="checkbox" checked={set.has(c)} onChange={() => onChange(set.has(c) ? [...set].filter((x) => x !== c) : [...set, c])} className="h-3.5 w-3.5" />
            {c}
          </label>
        ))}
      </div>
    );
  }
  if (p.type === 'l') {
    return <textarea id={id} value={String(value)} onChange={(e) => onChange(e.target.value)} rows={4} spellCheck={false} className="focus-ring w-full rounded-xl border border-white/60 bg-white/80 px-3 py-2 font-mono text-[12.5px]" />;
  }
  if (p.type === 'r') {
    return <p className="font-mono text-sm text-slate-700">{fmt(value)}</p>;
  }
  return (
    <input
      id={id}
      value={String(value)}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={false}
      autoComplete="off"
      className="focus-ring w-full max-w-xl rounded-xl border border-white/60 bg-white/80 px-3 py-2 font-mono text-[13px]"
    />
  );
}

/** Passwords and credentials: the current value is never shown - only set a new one, or clear it. */
function SecretInput({ p, pending, onChange }: { p: BugzillaParam; pending: string | undefined; onChange: (v: string | undefined) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1 text-xs text-slate-600">
        <KeyRound className="h-3.5 w-3.5" /> {pending === '' ? 'Will be cleared' : pending ? 'New value entered' : p.isSet ? 'A value is set' : 'Not set'}
      </span>
      <input
        type="password"
        autoComplete="new-password"
        placeholder="Type a new value to replace it"
        value={pending ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="focus-ring w-64 rounded-xl border border-white/60 bg-white/80 px-3 py-1.5 text-sm"
      />
      {p.isSet && pending !== '' && (
        <Button size="sm" variant="ghost" onClick={() => onChange('')}>Clear</Button>
      )}
      {pending !== undefined && (
        <Button size="sm" variant="ghost" onClick={() => onChange(undefined)}>Undo</Button>
      )}
    </div>
  );
}

export function Parameters() {
  const { data, isLoading, error } = useBugzillaParams();
  const update = useUpdateBugzillaParams();
  const { toast } = useToast();
  const [panel, setPanel] = useState('core');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Record<string, ParamValue>>({});
  const [resets, setResets] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState(false);
  const [typed, setTyped] = useState<Record<string, string>>({});

  useEffect(() => {
    setDraft({});
    setResets(new Set());
    setReviewing(false);
    setTyped({});
  }, [data]);

  const all = useMemo(() => (data?.panels ?? []).flatMap((pn) => pn.params.map((p) => ({ ...p, panel: pn.name }))), [data]);
  const byName = useMemo(() => new Map(all.map((p) => [p.name, p])), [all]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-6 h-96" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-8">
        <EmptyState icon={AlertCircle} title="Couldn't load parameters" description={error instanceof ApiError ? error.message : 'Please try again.'} />
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const visible = q
    ? all.filter((p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
    : (data.panels.find((p) => p.name === panel)?.params ?? []).map((p) => ({ ...p, panel }));
  const current = data.panels.find((p) => p.name === panel);

  // Pending: edited values that differ from the saved value, plus resets.
  const changed = Object.keys(draft).filter(
    (n) => !resets.has(n) && (byName.get(n)?.secret ? draft[n] !== undefined : !same(draft[n], byName.get(n)?.value))
  );
  const pendingNames = [...new Set([...changed, ...resets])];
  const dangerousPending = pendingNames.filter((n) => byName.get(n)?.dangerous);
  const allTyped = dangerousPending.every((n) => typed[n] === n);

  function edit(name: string, v: ParamValue | undefined) {
    setDraft((d) => {
      const n = { ...d };
      if (v === undefined) delete n[name];
      else n[name] = v;
      return n;
    });
    setResets((r) => {
      const n = new Set(r);
      n.delete(name);
      return n;
    });
    setReviewing(false);
  }

  function reset(name: string) {
    setResets((r) => new Set(r).add(name));
    setDraft((d) => {
      const n = { ...d };
      delete n[name];
      return n;
    });
    setReviewing(false);
  }

  async function onSave() {
    const changes: Record<string, ParamValue> = {};
    for (const n of changed) changes[n] = draft[n];
    try {
      const r = await update.mutateAsync({ changes, reset: [...resets], confirm: dangerousPending });
      toast({ variant: 'success', title: `Saved ${r.changed?.length ?? 0} parameter${r.changed?.length === 1 ? '' : 's'}`, description: r.changed?.join(', ') });
    } catch (err) {
      toast({ variant: 'error', title: 'Nothing was saved', description: err instanceof ApiError ? err.message : 'Please try again.' });
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 pb-32 sm:px-8">
      <PageHeader
        title="Parameters"
        description="Instance-wide Bugzilla settings, grouped as on Bugzilla's own page. Every change is recorded in the audit log with its old and new value."
        crumbs={[{ label: 'Administration' }, { label: 'Parameters' }]}
      />

      {data.shutdownActive && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl bg-rose-600 px-4 py-3 text-sm text-white">
          <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0" />
          <p><span className="font-semibold">Bugzilla is shut down</span> (shutdownhtml is set). Clear it to bring Bugzilla back.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Parameter sections" className="flex flex-col gap-0.5 lg:sticky lg:top-20 lg:self-start">
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search all parameters" aria-label="Search all parameters" className="focus-ring w-full rounded-lg border border-white/60 bg-white/80 py-1.5 pl-8 pr-2 text-sm" />
          </div>
          {data.panels.map((p) => {
            const n = p.params.filter((x) => pendingNames.includes(x.name)).length;
            return (
              <button
                key={p.name}
                onClick={() => { setPanel(p.name); setQuery(''); }}
                className={cn('focus-ring flex items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm', !q && panel === p.name ? 'bg-white font-semibold text-brand-800 shadow-sm' : 'text-slate-600 hover:bg-white/50')}
              >
                {p.title}
                {n > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800">{n}</span>}
              </button>
            );
          })}
        </nav>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>{q ? `Search: “${query}”` : current?.title}</CardTitle>
              {!q && current?.description && <p className="mt-0.5 text-xs text-slate-600">{current.description}</p>}
            </div>
          </CardHeader>
          <ul className="divide-y divide-white/40">
            {visible.length === 0 && <li className="px-5 py-8 text-center text-sm text-slate-500">No parameter matches.</li>}
            {visible.map((p) => {
              const isReset = resets.has(p.name);
              const value = isReset ? p.default : (draft[p.name] ?? p.value);
              const dirty = pendingNames.includes(p.name);
              const canReset = !p.noReset && !p.secret && p.type !== 'r' && !same(p.value, p.default) && !isReset;
              return (
                <li key={p.name} className={cn('flex flex-col gap-2 px-5 py-4', dirty && 'bg-amber-50/60')}>
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor={`param-${p.name}`} className="font-mono text-sm font-semibold text-slate-900">{p.name}</label>
                    {p.dangerous && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20">
                        <ShieldAlert className="h-3 w-3" /> {RISK[p.name] ? 'Can lock users out' : 'Affects email'}
                      </span>
                    )}
                    {q && <span className="text-xs text-slate-500">in {data.panels.find((x) => x.name === p.panel)?.title}</span>}
                    {dirty && <span className="text-xs font-medium text-amber-700">{isReset ? 'Will reset to default' : 'Changed'}</span>}
                  </div>
                  {p.description && <p className="max-w-3xl text-xs leading-5 text-slate-600">{p.description}</p>}
                  {p.secret ? (
                    <SecretInput p={p} pending={draft[p.name] as string | undefined} onChange={(v) => edit(p.name, v)} />
                  ) : (
                    <ParamInput p={p} value={value} onChange={(v) => edit(p.name, same(v, p.value) ? undefined : v)} />
                  )}
                  {!p.secret && p.type !== 'r' && (
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span>Default: <span className="font-mono">{fmt(p.default) || '(empty)'}</span></span>
                      {canReset && <button onClick={() => reset(p.name)} className="focus-ring inline-flex items-center gap-1 rounded text-brand-700 hover:underline"><RotateCcw className="h-3 w-3" /> Reset to default</button>}
                      {dirty && <button onClick={() => edit(p.name, undefined)} className="focus-ring inline-flex items-center gap-1 rounded text-slate-600 hover:underline"><X className="h-3 w-3" /> Undo</button>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      {/* Save bar + review */}
      {pendingNames.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-900/10 bg-white/95 shadow-2xl backdrop-blur lg:left-64">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-3 px-4 py-3 sm:px-8">
            {reviewing && (
              <div className="max-h-[50vh] overflow-y-auto rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
                <p className="mb-2 text-sm font-semibold text-slate-900">Saving will change exactly these parameters:</p>
                <ul className="flex flex-col gap-3">
                  {pendingNames.map((n) => {
                    const p = byName.get(n)!;
                    const to = resets.has(n) ? p.default : draft[n];
                    return (
                      <li key={n} className={cn('rounded-lg p-3 text-sm', p.dangerous ? 'bg-rose-50 ring-1 ring-inset ring-rose-200' : 'bg-white ring-1 ring-inset ring-slate-200')}>
                        <p className="font-mono font-semibold text-slate-900">{n}</p>
                        <p className="mt-1 break-all font-mono text-xs text-slate-700">
                          {p.secret ? (to === '' ? 'cleared' : 'set to a new value') : <>{fmt(p.value) || '(empty)'} <span className="text-slate-400">→</span> {fmt(to) || '(empty)'}</>}
                        </p>
                        {p.dangerous && (
                          <div className="mt-2 flex flex-col gap-2">
                            <p className="flex items-start gap-1.5 text-xs leading-5 text-rose-800"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {RISK[n] ?? MAIL_RISK}</p>
                            <Input
                              aria-label={`Type ${n} to confirm`}
                              value={typed[n] ?? ''}
                              onChange={(e) => setTyped((t) => ({ ...t, [n]: e.target.value }))}
                              placeholder={`Type ${n} to confirm`}
                              autoComplete="off"
                              className="max-w-xs font-mono text-[13px]"
                              error={typed[n] && typed[n] !== n ? 'Does not match' : undefined}
                            />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-700">
                <span className="font-semibold">{pendingNames.length}</span> unsaved change{pendingNames.length === 1 ? '' : 's'}
                {dangerousPending.length > 0 && <span className="text-rose-700"> · {dangerousPending.length} need{dangerousPending.length === 1 ? 's' : ''} confirmation</span>}
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => { setDraft({}); setResets(new Set()); setReviewing(false); setTyped({}); }}>Discard</Button>
                {!reviewing ? (
                  <Button onClick={() => setReviewing(true)}>Review changes</Button>
                ) : (
                  <Button onClick={onSave} disabled={!allTyped} loading={update.isPending} title={allTyped ? undefined : 'Type each dangerous parameter’s name to confirm'}>
                    <Save className="h-4 w-4" /> Save
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
