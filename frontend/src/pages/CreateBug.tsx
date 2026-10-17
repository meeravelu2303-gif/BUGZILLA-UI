import { Check, Eye, FilePlus2, FileText, MonitorSmartphone, Paperclip, Plus, Server, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAssignableUsers, useCreateBug, useMe, useProducts } from '../api/hooks';
import { ClassificationPicker } from '../components/bugs/ClassificationPicker';
import { DescriptionReport } from '../components/bugs/DescriptionReport';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { Input, Select, Textarea } from '../components/ui/Field';
import { useToast } from '../context/ToastContext';
import {
  BUG_BROWSERS,
  BUG_CATEGORIES,
  classificationOptions,
  DEFAULT_ENVIRONMENT,
  HTTP_METHODS,
  SEVERITY_LEVELS,
  buildDescription,
  buildSummary,
  buildWhiteboard,
  curlTemplate,
  kindForProduct,
  mintTag,
  runDateNow,
  validateReport,
  type BugKind,
  type BugReportInput,
  type SeverityLevel,
} from '../lib/bugTemplate';
import { uploadAttachment } from '../lib/uploadAttachment';
import { cn } from '../lib/utils';

/** Each attachment goes up as its own request, as raw bytes; Bugzilla's own cap is 50 MB a file. */
const MAX_FILE_BYTES = 50 * 1024 * 1024;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** A small one-of-N toggle; a select would hide the options this form wants people to compare. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; dot?: string }[];
  onChange: (v: T) => void;
  hint?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-slate-900/[0.06] p-1">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.value)}
              className={cn(
                'focus-ring flex items-center justify-center gap-1.5 rounded-lg px-3 py-[7px] text-sm transition-all',
                active ? 'bg-white font-semibold text-brand-800 shadow-sm ring-1 ring-slate-900/5' : 'font-medium text-slate-600 hover:bg-white/50 hover:text-slate-900',
              )}
            >
              {o.dot && <span className={cn('h-2 w-2 rounded-full', o.dot)} aria-hidden />}
              {o.label}
            </button>
          );
        })}
      </div>
      {hint && <p className="text-xs leading-5 text-slate-600">{hint}</p>}
    </div>
  );
}

/*
 * Own header rather than CardHeader: that one is `justify-between`, and `cn` is plain clsx, so a
 * `justify-start` override does not win - it pushed the title to the far right of the card.
 */
function Section({ step, title, subtitle, children }: { step: number; title: string; subtitle: string; children: ReactNode }) {
  return (
    <Card>
      <div className="flex items-center gap-3 border-b border-slate-900/[0.06] px-6 py-4">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-semibold text-white shadow-sm ring-1 ring-inset ring-white/30">
          {step}
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-5 text-slate-900">{title}</h2>
          <p className="text-xs leading-5 text-slate-600">{subtitle}</p>
        </div>
      </div>
      <div className="flex flex-col gap-5 px-6 py-5">{children}</div>
    </Card>
  );
}

const BUG_KIND_OPTIONS: { value: BugKind; title: string; detail: string; icon: typeof Server }[] = [
  { value: 'api', title: 'API bug', detail: 'A backend endpoint misbehaves - asks for endpoint, curl and response.', icon: Server },
  { value: 'ui', title: 'UI bug', detail: 'Something on a screen is wrong - asks for page and browsers.', icon: MonitorSmartphone },
];

const LEVEL_DOT: Record<SeverityLevel, string> = {
  CRITICAL: 'bg-rose-500',
  HIGH: 'bg-orange-500',
  MEDIUM: 'bg-amber-400',
  LOW: 'bg-slate-400',
};

const MONO = 'font-mono text-[13px] leading-relaxed';

export function CreateBug() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: productsData, isLoading: productsLoading } = useProducts();
  const { data: me } = useMe();
  const createBug = useCreateBug();

  // Minted once, so the summary in the preview is the summary that gets filed.
  const [tag] = useState(mintTag);
  const [product, setProduct] = useState('');
  const [component, setComponent] = useState('');
  const [version, setVersion] = useState('');
  const [kind, setKind] = useState<BugKind>('api');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string>('Functional');
  const [level, setLevel] = useState<SeverityLevel>('HIGH');
  const [classification, setClassification] = useState('');
  const [method, setMethod] = useState<string>('POST');
  const [path, setPath] = useState('');
  const [page, setPage] = useState('');
  const [browsers, setBrowsers] = useState<string[]>(['chromium']);
  const [summary, setSummary] = useState('');
  const [whyItMatters, setWhyItMatters] = useState('');
  const [howToFix, setHowToFix] = useState('');
  const [preconditions, setPreconditions] = useState('');
  const [steps, setSteps] = useState('');
  const [expected, setExpected] = useState('');
  const [actual, setActual] = useState('');
  const [responseStatus, setResponseStatus] = useState('');
  const [responseBody, setResponseBody] = useState('');
  const [curl, setCurl] = useState('');
  const [correlationId, setCorrelationId] = useState('');
  const [environment, setEnvironment] = useState(DEFAULT_ENVIRONMENT.api);
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [rawPreview, setRawPreview] = useState(false);
  const [runDate, setRunDate] = useState(runDateNow);

  // The run date in the preview follows the clock; the filed one is stamped again at submit.
  useEffect(() => {
    const t = setInterval(() => setRunDate(runDateNow()), 30_000);
    return () => clearInterval(t);
  }, []);

  const products = productsData?.products ?? [];
  const selectedProduct = useMemo(() => products.find((p) => p.name === product), [products, product]);
  const { data: assignable } = useAssignableUsers(product || undefined);

  const ownerEmail = selectedProduct?.components.find((c) => c.name === component)?.defaultAssignee ?? '';
  const ownerName = assignable?.users.find((u) => u.email === ownerEmail)?.name ?? '';

  function onSelectProduct(name: string) {
    setProduct(name);
    const p = products.find((x) => x.name === name);
    setComponent(p?.components[0]?.name ?? '');
    setVersion(p?.versions.includes('unspecified') ? 'unspecified' : (p?.versions[0] ?? ''));
    if (name) changeKind(kindForProduct(name));
  }

  function changeKind(next: BugKind) {
    setKind(next);
    // Swap the environment only while it is still the other kind's default - never over an edit.
    setEnvironment((env) => (Object.values(DEFAULT_ENVIRONMENT).includes(env) || !env.trim() ? DEFAULT_ENVIRONMENT[next] : env));
  }

  function toggleBrowser(b: string) {
    setBrowsers((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...BUG_BROWSERS.filter((x) => x === b || prev.includes(x))]));
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    const tooBig = incoming.filter((f) => f.size > MAX_FILE_BYTES);
    setFileError(tooBig.length ? `${tooBig.map((f) => f.name).join(', ')} exceed${tooBig.length === 1 ? 's' : ''} the 50 MB limit.` : '');
    setFiles((prev) => [...prev, ...incoming.filter((f) => f.size <= MAX_FILE_BYTES && !prev.some((p) => p.name === f.name))]);
  }

  const report: BugReportInput = {
    kind,
    tag,
    product,
    component,
    title,
    category,
    level,
    classification,
    method,
    path,
    page,
    browsers,
    summary,
    whyItMatters,
    howToFix,
    preconditions,
    steps,
    expected,
    actual,
    responseStatus,
    responseBody,
    curl,
    correlationId,
    environment,
    ownerName,
    ownerEmail: ownerEmail || 'component default assignee',
    filedByName: me?.user.realName ?? '',
    filedByEmail: me?.user.email ?? '',
    evidence: files.map((f) => f.name),
    runDate,
  };

  const allErrors = validateReport(report);
  const errors = showErrors ? allErrors : {};
  const errorCount = Object.keys(allErrors).length;
  const composedSummary = buildSummary(report);
  const whiteboard = buildWhiteboard(report);
  const description = buildDescription(report);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setShowErrors(true);
    if (errorCount > 0) {
      document.querySelector('[data-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const final = { ...report, runDate: runDateNow() };
    const levelFields = SEVERITY_LEVELS[level];
    let bugId: number;
    try {
      const result = await createBug.mutateAsync({
        product,
        component,
        summary: buildSummary(final),
        description: buildDescription(final),
        whiteboard: buildWhiteboard(final),
        version: version || undefined,
        // The bench always files with All/All - the browser lives in the whiteboard tag instead.
        opSys: 'All',
        platform: 'All',
        severity: levelFields.severity,
        priority: levelFields.priority,
      });
      bugId = result.bug.id;
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not create the bug. Please try again.');
      return;
    }

    // The bug exists from here on: an upload failure is reported, never a reason to lose the bug.
    const failed: string[] = [];
    for (const file of files) {
      setUploading(file.name);
      try {
        await uploadAttachment(bugId, file, { summary: `Evidence: ${file.name}` });
      } catch {
        failed.push(file.name);
      }
    }
    setUploading(null);

    if (failed.length) {
      toast({
        variant: 'error',
        title: `Bug #${bugId} filed, but ${failed.length} attachment${failed.length === 1 ? '' : 's'} failed`,
        description: `${failed.join(', ')} - attach ${failed.length === 1 ? 'it' : 'them'} from the bug page.`,
      });
    } else {
      toast({ variant: 'success', title: `Bug #${bugId} filed`, description: buildSummary(final) });
    }
    navigate(`/bugs/${bugId}`);
  }

  const busy = createBug.isPending || uploading !== null;
  const invalid = (k: keyof BugReportInput) => (errors[k] ? 'true' : undefined);

  return (
    <div className="mx-auto max-w-[1400px] animate-page-in px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        icon={FilePlus2}
        title="New bug"
        description="Uses the same structure as test-bench bugs, so every ticket reads the same way."
        actions={
          <span className="inline-flex h-9 items-center gap-2 rounded-full bg-white/70 px-3.5 font-mono text-xs font-semibold text-slate-700 shadow-card ring-1 ring-inset ring-white/80 backdrop-blur-xl">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500 shadow-[0_0_0_3px_rgb(58_178_204_/_0.25)]" aria-hidden />
            {tag}
          </span>
        }
      />

      <form onSubmit={onSubmit} noValidate autoComplete="off" className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Section step={1} title="Where" subtitle="Product and module. The module's maintainer is assigned automatically.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div data-invalid={invalid('product')}>
                <Select
                  label="Product"
                  placeholder={productsLoading ? 'Loading…' : 'Select a product'}
                  value={product}
                  onChange={(e) => onSelectProduct(e.target.value)}
                  error={errors.product}
                  required
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div data-invalid={invalid('component')}>
                <Select
                  label="Component (module)"
                  placeholder={product ? 'Select a component' : 'Select a product first'}
                  value={component}
                  onChange={(e) => setComponent(e.target.value)}
                  error={errors.component}
                  disabled={!selectedProduct}
                  hint={ownerEmail ? `Assigned to ${ownerName || ownerEmail}` : undefined}
                  required
                >
                  {selectedProduct?.components.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span id="bug-type-label" className="text-sm font-medium text-slate-700">
                Bug type
              </span>
              <div role="radiogroup" aria-labelledby="bug-type-label" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {BUG_KIND_OPTIONS.map((o) => {
                  const active = kind === o.value;
                  const Icon = o.icon;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => changeKind(o.value)}
                      className={cn(
                        'focus-ring group relative flex items-start gap-3 rounded-xl p-3.5 text-left transition-all',
                        active
                          ? 'bg-white shadow-sm ring-2 ring-brand-600'
                          : 'bg-white/50 ring-1 ring-inset ring-slate-900/10 hover:bg-white/80 hover:ring-slate-900/20',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors',
                          active ? 'bg-brand-600 text-white' : 'bg-slate-900/[0.06] text-slate-500 group-hover:text-slate-700',
                        )}
                        aria-hidden
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block text-sm font-semibold', active ? 'text-slate-900' : 'text-slate-700')}>{o.title}</span>
                        <span className="mt-0.5 block text-xs leading-5 text-slate-600">{o.detail}</span>
                      </span>
                      <span
                        className={cn(
                          'mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors',
                          active ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white',
                        )}
                        aria-hidden
                      >
                        {active && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-slate-600">Set from the product - change it if this bug is the other kind.</p>
            </div>
            <div className="grid grid-cols-1 empty:hidden gap-4 sm:grid-cols-2">
              {/*
                Bugzilla requires a version on every bug, but each product here has exactly one
                ("unspecified", or "5.0" for KMail API) - so it is chosen automatically and the
                field only appears for a product that actually has several to pick from.
              */}
              {selectedProduct && selectedProduct.versions.length > 1 && (
                <Select label="Version" value={version} onChange={(e) => setVersion(e.target.value)}>
                  {selectedProduct.versions.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          </Section>

          <Section step={2} title="The defect" subtitle="How it is titled, tagged and prioritised - the same fields the bench sets.">
            {kind === 'api' ? (
              <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3" data-invalid={invalid('path')}>
                <Select label="Method" value={method} onChange={(e) => setMethod(e.target.value)}>
                  {HTTP_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
                <Input
                  id="new-bug-endpoint" autoComplete="off" label="Endpoint"
                  value={path}
                  onChange={(e) => setPath(e.target.value.trim())}
                  placeholder="/v2/kmail/inboxMails/"
                  className={MONO}
                  error={errors.path}
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input id="new-bug-page" autoComplete="off" label="Page / screen" value={page} onChange={(e) => setPage(e.target.value)} placeholder="/kmail/inbox or Write Mail" hint="Where in the app it happens." />
                <div className="flex flex-col gap-1.5" data-invalid={invalid('browsers')}>
                  <span id="browsers-label" className="text-sm font-medium text-slate-700">
                    Browsers affected
                  </span>
                  <div role="group" aria-labelledby="browsers-label" className="grid grid-cols-2 gap-1 rounded-xl bg-slate-900/[0.06] p-1">
                    {BUG_BROWSERS.map((b) => {
                      const on = browsers.includes(b);
                      return (
                        <button
                          key={b}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleBrowser(b)}
                          className={cn(
                            'focus-ring flex items-center gap-2 rounded-lg px-2.5 py-[7px] text-sm transition-all',
                            on ? 'bg-white font-semibold text-brand-800 shadow-sm ring-1 ring-slate-900/5' : 'font-medium text-slate-600 hover:bg-white/50',
                          )}
                        >
                          <span
                            className={cn(
                              'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                              on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white',
                            )}
                            aria-hidden
                          >
                            {on && <Check className="h-3 w-3" strokeWidth={3} />}
                          </span>
                          {b}
                        </button>
                      );
                    })}
                  </div>
                  {errors.browsers ? (
                    <p className="text-xs text-rose-600">{errors.browsers}</p>
                  ) : (
                    <p className="text-xs text-slate-600">Tick every browser it happens in.</p>
                  )}
                </div>
              </div>
            )}

            <div data-invalid={invalid('title')}>
              <Input
                id="new-bug-title" autoComplete="off" label="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                error={errors.title}
                placeholder={
                  kind === 'api'
                    ? 'returns HTTP 500 instead of 400 when the subject is empty'
                    : 'Write Mail: Send button stays disabled after adding a recipient'
                }
                hint={`Filed as: ${composedSummary}`}
                maxLength={240}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
                {BUG_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
              <div data-invalid={invalid('classification')}>
                <ClassificationPicker
                  id="new-bug-classification"
                  label="Classification"
                  value={classification}
                  onChange={setClassification}
                  options={classificationOptions(kind)}
                  placeholder={kind === 'api' ? 'response.status-code' : 'ui.content'}
                  error={errors.classification}
                  hint={`Search all ${classificationOptions(kind).length} values the bench uses, so it groups with matching bugs.`}
                />
              </div>
            </div>

            <Segmented
              label="Severity"
              value={level}
              onChange={setLevel}
              options={(Object.keys(SEVERITY_LEVELS) as SeverityLevel[]).map((l) => ({
                value: l,
                label: l[0] + l.slice(1).toLowerCase(),
                dot: LEVEL_DOT[l],
              }))}
              hint={
                <>
                  <span className="font-medium text-slate-800">
                    severity {SEVERITY_LEVELS[level].severity} · priority {SEVERITY_LEVELS[level].priority}
                  </span>{' '}
                  - {SEVERITY_LEVELS[level].hint}.
                </>
              }
            />
          </Section>

          <Section step={3} title="Report" subtitle="What a developer needs to understand and reproduce it without asking.">
            <div data-invalid={invalid('summary')}>
              <Textarea
                id="new-bug-summary" autoComplete="off" label="Summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                error={errors.summary}
                rows={3}
                placeholder="In plain words: what you did, what went wrong, and who it affects."
              />
            </div>
            <Input
              id="new-bug-preconditions" autoComplete="off" label="Preconditions"
              value={preconditions}
              onChange={(e) => setPreconditions(e.target.value)}
              placeholder={
                kind === 'api'
                  ? 'A valid, authenticated test account calling the endpoint below with a live session token.'
                  : `Signed in with a valid test account, on the ${component || '…'} screen.`
              }
              hint="Leave blank to use the standard wording shown."
            />
            <div data-invalid={invalid('steps')}>
              <Textarea
                id="new-bug-steps" autoComplete="off" label="Steps to reproduce"
                value={steps}
                onChange={(e) => setSteps(e.target.value)}
                error={errors.steps}
                rows={4}
                className={MONO}
                placeholder={'Log in as a test user\nOpen KMail → Inbox\nClick "Mark all as read"'}
                hint="One step per line - they are numbered automatically."
              />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div data-invalid={invalid('expected')}>
                <Textarea
                  id="new-bug-expected" autoComplete="off" label="Expected"
                  value={expected}
                  onChange={(e) => setExpected(e.target.value)}
                  error={errors.expected}
                  rows={4}
                  className={MONO}
                  placeholder={kind === 'api' ? 'empty subject → 400\nbody: {"status":"error","message":…}' : 'All unread mails are marked as read.'}
                />
              </div>
              <div data-invalid={invalid('actual')}>
                <Textarea
                  id="new-bug-actual" autoComplete="off" label="Actual"
                  value={actual}
                  onChange={(e) => setActual(e.target.value)}
                  error={errors.actual}
                  rows={4}
                  className={MONO}
                  placeholder={kind === 'api' ? 'empty subject → 500' : 'Nothing happens; the unread count stays the same.'}
                />
              </div>
            </div>
            <details className="group rounded-xl bg-white/40 ring-1 ring-inset ring-white/60">
              <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium text-slate-700">
                Developer notes <span className="font-normal text-slate-500">(optional) - why it matters, how to fix</span>
              </summary>
              <div className="flex flex-col gap-4 px-4 pb-4">
                <Textarea id="new-bug-why" autoComplete="off" label="Why it matters" value={whyItMatters} onChange={(e) => setWhyItMatters(e.target.value)} rows={2} placeholder="User or business impact." />
                <Textarea id="new-bug-fix" autoComplete="off" label="How to fix" value={howToFix} onChange={(e) => setHowToFix(e.target.value)} rows={2} placeholder="A suggested fix, if you know one." />
              </div>
            </details>
          </Section>

          {kind === 'api' && (
            <Section step={4} title="Reproduce" subtitle="A runnable command and the response it returned.">
              <div data-invalid={invalid('curl')} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">curl</span>
                  <button
                    type="button"
                    onClick={() => setCurl(curlTemplate(method, path))}
                    className="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-600/10"
                  >
                    <Sparkles className="h-3.5 w-3.5" aria-hidden /> Generate from endpoint
                  </button>
                </div>
                {/* A raw textarea, not <Textarea>: its bg-white/80 would fight the dark terminal styling. */}
                <textarea
                  aria-label="curl"
                  value={curl}
                  onChange={(e) => setCurl(e.target.value)}
                  rows={5}
                  spellCheck={false}
                  wrap="off"
                  className={cn(
                    MONO,
                    'focus-ring w-full resize-y rounded-xl bg-slate-900 px-4 py-3 text-slate-100 placeholder:text-slate-500 ring-1 ring-inset',
                    errors.curl ? 'ring-rose-400' : 'ring-slate-900/60',
                  )}
                  placeholder={"curl -X POST 'https://testingapi.kpostindia.com/v2/…' \\\n  -H 'Authorization: Bearer $KPOST_TOKEN' \\\n  -H 'Content-Type: application/json' \\\n  --data '{…}'"}
                />
                {errors.curl ? (
                  <p className="text-xs text-rose-600">{errors.curl}</p>
                ) : (
                  <p className="text-xs text-slate-600">Keep the token as $KPOST_TOKEN - never paste a live one.</p>
                )}
              </div>
              <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
                <div data-invalid={invalid('responseStatus')}>
                  <Input
                    id="new-bug-http-status" autoComplete="off" label="HTTP status"
                    value={responseStatus}
                    onChange={(e) => setResponseStatus(e.target.value.trim())}
                    inputMode="numeric"
                    maxLength={3}
                    placeholder="500"
                    error={errors.responseStatus}
                  />
                </div>
                <Input id="new-bug-correlation-id" autoComplete="off" label="Correlation ID" value={correlationId} onChange={(e) => setCorrelationId(e.target.value)} placeholder="Optional - from the X-Correlation-ID header" className={MONO} />
              </div>
              <Textarea
                id="new-bug-response-body" autoComplete="off" label="Response body"
                value={responseBody}
                onChange={(e) => setResponseBody(e.target.value)}
                rows={3}
                spellCheck={false}
                className={MONO}
                placeholder='{"message":"Unable to fetch messages","status":"error","statusCode":500}'
              />
            </Section>
          )}

          <Section step={kind === 'api' ? 5 : 4} title="Context & evidence" subtitle="Where it was seen, and the proof - screenshots, videos, logs.">
            <div data-invalid={invalid('environment')}>
              <Input id="new-bug-environment" autoComplete="off" label="Environment" value={environment} onChange={(e) => setEnvironment(e.target.value)} error={errors.environment} />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-slate-700">Evidence</span>
              <label className="focus-within:ring-brand-600 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 bg-white/50 px-4 py-5 text-center text-sm text-slate-600 transition-colors hover:border-brand-500 hover:bg-white/70">
                <Paperclip className="h-4 w-4 text-slate-500" aria-hidden />
                <span>
                  <span className="font-medium text-brand-700">Choose files</span> - screenshot, video, HAR or log
                </span>
                <span className="text-xs text-slate-500">Up to 50 MB each</span>
                <input
                  type="file"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
              {fileError && <p className="text-xs text-rose-600">{fileError}</p>}
              {files.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                  {files.map((f) => (
                    <li key={f.name} className="flex items-center justify-between gap-3 rounded-lg bg-white/70 px-3 py-2 text-sm ring-1 ring-inset ring-white/60">
                      <span className="flex min-w-0 items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                        <span className="truncate text-slate-800">{f.name}</span>
                        <span className="shrink-0 text-xs text-slate-500">{formatBytes(f.size)}</span>
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${f.name}`}
                        onClick={() => setFiles((prev) => prev.filter((p) => p !== f))}
                        className="focus-ring rounded p-0.5 text-slate-500 hover:text-rose-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Section>

          {submitError && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
              {submitError}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3">
            {showErrors && errorCount > 0 && (
              <p className="mr-auto text-sm text-rose-600">
                {errorCount} field{errorCount === 1 ? '' : 's'} still need{errorCount === 1 ? 's' : ''} attention.
              </p>
            )}
            <Button type="button" variant="secondary" onClick={() => navigate(-1)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              {!busy && <Plus className="h-4 w-4" />}
              {uploading ? `Attaching ${uploading}…` : createBug.isPending ? 'Filing…' : 'File bug'}
            </Button>
          </div>
        </div>

        {/* What will be filed, rendered the way the bug page will show it. */}
        <aside className="min-w-0 xl:sticky xl:top-20">
          <Card>
            <div className="flex items-center justify-between gap-3 border-b border-slate-900/[0.06] px-6 py-4">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-brand-700" aria-hidden />
                <h2 className="text-[15px] font-semibold text-slate-900">Preview</h2>
              </div>
              <div role="tablist" aria-label="Preview format" className="grid grid-cols-2 gap-0.5 rounded-lg bg-slate-900/[0.06] p-0.5 text-xs">
                {(['Report', 'Raw text'] as const).map((m) => {
                  const active = (m === 'Raw text') === rawPreview;
                  return (
                    <button
                      key={m}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setRawPreview(m === 'Raw text')}
                      className={cn('focus-ring rounded-md px-2.5 py-1 font-medium', active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex max-h-[calc(100vh-12rem)] flex-col gap-4 overflow-y-auto px-6 py-5">
              <div className="flex flex-col gap-2.5">
                <p className="break-words text-[15px] font-semibold leading-snug text-slate-900">
                  {title.trim() ? (
                    composedSummary
                  ) : (
                    <>
                      <span className="font-mono">[{tag}]</span> <span className="font-normal italic text-slate-400">Your title appears here</span>
                    </>
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-0.5 font-medium text-slate-800 ring-1 ring-inset ring-slate-900/10">
                    <span className={cn('h-1.5 w-1.5 rounded-full', LEVEL_DOT[level])} aria-hidden />
                    {SEVERITY_LEVELS[level].severity} · {SEVERITY_LEVELS[level].priority}
                  </span>
                  <span className="rounded-md bg-white px-2 py-0.5 font-medium text-slate-800 ring-1 ring-inset ring-slate-900/10">{category}</span>
                  {product && <span className="rounded-md bg-white px-2 py-0.5 font-medium text-slate-800 ring-1 ring-inset ring-slate-900/10">{product}{component ? ` / ${component}` : ''}</span>}
                </div>
                <p className="font-mono text-[11px] text-slate-500">whiteboard {whiteboard}</p>
              </div>
              <div className="border-t border-slate-900/[0.06]" />
              {!product || !title.trim() ? (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/40 px-6 py-10 text-center">
                  <FileText className="h-6 w-6 text-slate-400" aria-hidden />
                  <p className="text-sm font-medium text-slate-700">The filed bug will appear here</p>
                  <p className="max-w-xs text-xs leading-5 text-slate-500">Choose a product and give it a title - the report builds itself as you fill in the form.</p>
                </div>
              ) : rawPreview ? (
                <pre className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 font-mono text-[12px] leading-relaxed text-slate-800 ring-1 ring-inset ring-slate-200">
                  {description}
                </pre>
              ) : (
                <div className="text-sm">
                  <DescriptionReport description={description} />
                </div>
              )}
            </div>
          </Card>
        </aside>
      </form>
    </div>
  );
}
