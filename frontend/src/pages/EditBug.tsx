import { AlertCircle, AlertTriangle, FileText, Paperclip, Pencil, RefreshCw, Save, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAssignableUsers, useBug, useMeta, useMe, useProducts, useUpdateBug, useUpdateReport } from '../api/hooks';
import { AttachmentList } from '../components/bugs/AttachmentList';
import { BugKindPicker, CurlField, LEVEL_DOT, MONO, Section, Segmented, TickGroup, UiPlatformPicker } from '../components/bugs/BugFormParts';
import { ClassificationPicker } from '../components/bugs/ClassificationPicker';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Input, RequiredMark, Select, Textarea } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../context/ToastContext';
import {
  BUG_BROWSERS,
  BUG_CATEGORIES,
  BUG_DEVICES,
  DEVICE_LABELS,
  HTTP_METHODS,
  NOT_GIVEN,
  PRIORITY_OPTIONS,
  SEVERITY_LEVELS,
  classificationOptions,
  curlTemplate,
  kindForProduct,
  stepsRequired,
  type BugKind,
  type SeverityLevel,
  type UiPlatform,
} from '../lib/bugTemplate';
import { lastListView } from '../lib/lastListView';
import { getField, parseReport, serializeReport, setField, syncCategoryLine, type ReportDoc, type Segment } from '../lib/reportDoc';
import { assigneeLabel } from '../lib/roles';
import { uploadAttachment } from '../lib/uploadAttachment';
import { useBugEditor } from '../lib/useBugEditor';
import { bugDisplayId, cn, formatBytes, subcomponentName } from '../lib/utils';
import type { BugDetailResponse, BugMeta, Product } from '../types';

/** Each attachment goes up as its own request, as raw bytes; Bugzilla's own cap is 50 MB a file. */
const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** The `[KP-…]` / `[MT-…]` tag at the start of a summary: kept as it is, so the bug still groups with its test. */
const TAG = /^\s*\[(?:KP|MT)-[^\]]+\]\s*/;

let pasteCount = 0;
const pastedStamp = () => `${new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')}-${++pasteCount}`;

// ------------------------------------------------------------ the report as form fields

/** The New bug form's report fields, read from (and written back into) the bug's report text. */
interface ReportForm {
  kind: BugKind;
  method: string;
  path: string;
  page: string;
  uiPlatform: UiPlatform;
  browsers: string[];
  devices: string[];
  classification: string;
  summary: string;
  preconditions: string;
  steps: string;
  expected: string;
  actual: string;
  whyItMatters: string;
  howToFix: string;
  curl: string;
  responseStatus: string;
  correlationId: string;
  responseBody: string;
  environment: string;
}

const SEG = {
  platform: /^platform$/i,
  browsers: /^browsers affected$/i,
  correlation: /^correlation id/i,
  response: /^response body/i,
  environment: /^environment$/i,
};
/** Sections that close a report: a section added by editing goes before them. */
const FOOTER = /^(owner|environment|run date|filed by|tested by|evidence attached)\b/i;

const segIndex = (doc: ReportDoc, re: RegExp) => doc.findIndex((s) => !s.meta && s.heading !== null && re.test(s.heading));
const segBody = (doc: ReportDoc, re: RegExp) => {
  const i = segIndex(doc, re);
  return i === -1 ? '' : doc[i].body;
};
const given = (s: string) => (s.trim() === NOT_GIVEN ? '' : s);

function readForm(doc: ReportDoc, product: string): ReportForm {
  const endpoint = getField(doc, 'endpoint').trim();
  const api = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/\S*)/i.exec(endpoint);
  const platform = segBody(doc, SEG.platform);
  const hasUi = Boolean(platform) || segIndex(doc, SEG.browsers) !== -1;
  const kind: BugKind = api ? 'api' : hasUi ? 'ui' : kindForProduct(product);
  const mobile = /^mobile/i.test(platform);
  const devicePart = /-\s*(.+?)\.?$/.exec(platform)?.[1] ?? '';
  const response = segIndex(doc, SEG.response);
  return {
    kind,
    method: api?.[1].toUpperCase() ?? 'GET',
    path: api?.[2] ?? '',
    page: !api && endpoint !== '(not applicable)' ? endpoint : '',
    uiPlatform: mobile ? 'mobile' : 'web',
    browsers: segBody(doc, SEG.browsers)
      .replace(/\.$/, '')
      .split(/\s*,\s*/)
      .filter((b) => (BUG_BROWSERS as readonly string[]).includes(b)),
    devices: devicePart
      .split(/\s*,\s*/)
      .map((d) => BUG_DEVICES.find((k) => DEVICE_LABELS[k].toLowerCase() === d.toLowerCase()) ?? '')
      .filter(Boolean),
    classification: getField(doc, 'classification'),
    summary: getField(doc, 'summary'),
    preconditions: getField(doc, 'preconditions'),
    steps: given(getField(doc, 'steps')),
    expected: given(getField(doc, 'expected')),
    actual: given(getField(doc, 'actual')),
    whyItMatters: getField(doc, 'whyItMatters'),
    howToFix: getField(doc, 'howToFix'),
    curl: getField(doc, 'curl'),
    responseStatus: response === -1 ? '' : (/\(HTTP\s+(\d{3})\)/i.exec(doc[response].heading ?? '')?.[1] ?? ''),
    correlationId: segBody(doc, SEG.correlation),
    responseBody: getField(doc, 'responseBody'),
    environment: segBody(doc, SEG.environment),
  };
}

/** Sets a section found by `re` (adding it before the footer if missing); an empty value removes it. */
function setSeg(doc: ReportDoc, re: RegExp, heading: string, body: string, renameTo?: string): ReportDoc {
  const next = doc.map((s) => ({ ...s }));
  const i = segIndex(next, re);
  if (i !== -1) {
    next[i].body = body;
    if (renameTo) next[i].heading = renameTo;
    return next;
  }
  if (!body.trim()) return next;
  const segment: Segment = { heading: renameTo ?? heading, body, meta: false };
  const footer = next.findIndex((s) => !s.meta && s.heading !== null && FOOTER.test(s.heading));
  next.splice(footer === -1 ? next.length : footer, 0, segment);
  return next;
}

/**
 * The report text after the edits: only what the person changed is written,
 * everything else - and every section this form does not show - stays exactly
 * as it was.
 */
function writeForm(doc: ReportDoc, before: ReportForm, f: ReportForm): ReportDoc {
  let d = doc;
  const changed = (k: keyof ReportForm) => JSON.stringify(f[k]) !== JSON.stringify(before[k]);
  for (const k of ['classification', 'summary', 'preconditions', 'steps', 'expected', 'actual', 'whyItMatters', 'howToFix'] as const) {
    if (changed(k)) d = setField(d, k, f[k]);
  }
  const endpointOf = (x: ReportForm) => (x.kind === 'api' ? `${x.method} ${x.path.trim()}` : x.page.trim() || '(not applicable)');
  if (endpointOf(f) !== endpointOf(before)) d = setField(d, 'endpoint', endpointOf(f));

  const platformOf = (x: ReportForm) =>
    x.kind !== 'ui' ? '' : x.uiPlatform === 'mobile' ? `Mobile app${x.devices.length ? ` - ${x.devices.map((v) => DEVICE_LABELS[v] ?? v).join(', ')}` : ''}.` : 'Web app.';
  const browsersOf = (x: ReportForm) => (x.kind === 'ui' && x.uiPlatform === 'web' && x.browsers.length ? `${x.browsers.join(', ')}.` : '');
  if (platformOf(f) !== platformOf(before)) d = setSeg(d, SEG.platform, 'Platform', platformOf(f));
  if (browsersOf(f) !== browsersOf(before)) d = setSeg(d, SEG.browsers, 'Browsers affected', browsersOf(f));

  const api = f.kind === 'api';
  if (changed('curl') || (!api && before.curl)) d = setField(d, 'curl', api ? f.curl : '');
  if (changed('correlationId') || (!api && before.correlationId)) {
    d = setSeg(d, SEG.correlation, 'Correlation ID (search the application logs for it)', api ? f.correlationId.trim() : '');
  }
  if (changed('responseBody') || changed('responseStatus') || (!api && before.responseBody)) {
    d = setSeg(d, SEG.response, 'Response body', api ? f.responseBody.trim() : '', `Response body (HTTP ${f.responseStatus.trim() || '?'})`);
  }
  if (changed('environment')) d = setSeg(d, SEG.environment, 'Environment', f.environment.trim());
  return d;
}

/** The New bug form's rules, for the fields this form shows. */
function validate(f: ReportForm, title: string, product: string, component: string, stepsNeeded: boolean) {
  const e: Record<string, string> = {};
  if (!product) e.product = 'Select a product.';
  if (!component) e.component = 'Select a component.';
  if (title.trim().length < 10) e.title = 'Describe the problem in at least 10 characters.';
  if (!f.classification.trim()) e.classification = 'Pick or type a classification, e.g. response.status-code.';
  if (f.summary.trim().length < 20) e.summary = 'Explain what goes wrong in a sentence or two.';
  if (stepsNeeded && !f.steps.trim()) e.steps = 'Critical and High severity bugs need the steps that reproduce them.';
  if (!f.environment.trim()) e.environment = 'Name the environment it was seen on.';
  if (f.kind === 'api') {
    if (!/^\/\S*$/.test(f.path.trim())) e.path = 'Enter the endpoint path, starting with "/" (e.g. /v2/kmail/inbox/).';
    if (!/^\s*curl\s/i.test(f.curl)) e.curl = 'Paste a curl command that reproduces it (Generate fills a starting one).';
    if (f.responseStatus.trim() && !/^[1-5]\d\d$/.test(f.responseStatus.trim())) e.responseStatus = 'A 3-digit HTTP status, e.g. 500.';
  } else if (f.uiPlatform === 'mobile') {
    if (f.devices.length === 0) e.devices = 'Tick Android, iOS or both.';
  } else if (f.browsers.length === 0) {
    e.browsers = 'Tick every browser you saw it in.';
  }
  return e;
}

const FIELD_LABELS: Record<string, string> = {
  product: 'Product',
  component: 'Component',
  path: 'Endpoint',
  browsers: 'Browsers affected',
  devices: 'Devices affected',
  title: 'Title',
  classification: 'Classification',
  summary: 'Summary',
  steps: 'Steps to reproduce',
  curl: 'curl',
  responseStatus: 'HTTP status',
  environment: 'Environment',
};

/** Scrolls to a field and puts the cursor in it, so fixing it is one keystroke away. */
function focusField(key: string) {
  const wrap = document.querySelector<HTMLElement>(`[data-field="${key}"]`);
  if (!wrap) return;
  wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
  wrap.querySelector<HTMLElement>('input:not([type=hidden]), textarea, select, button')?.focus({ preventScroll: true });
}

// ------------------------------------------------------------ page

/**
 * The whole bug in the New bug form: the same sections, fields and required
 * marks, filled in from the bug. One Save writes the fields (one Bugzilla
 * update), then the report (a new report revision - the old text stays in the
 * history), then uploads any new files.
 */
export function EditBug() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, error } = useBug(Number(id));
  const { data: meta } = useMeta();
  const { data: productsData } = useProducts();
  const { data: me } = useMe();

  const shell = (body: React.ReactNode) => <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 lg:px-8">{body}</div>;
  if (isLoading) {
    return shell(
      <>
        <Skeleton className="h-8 w-1/3" />
        <div className="mt-6 flex flex-col gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-96" />
        </div>
      </>
    );
  }
  if (isError || !data) {
    return shell(<EmptyState icon={AlertCircle} title="Couldn't load this bug" description={error instanceof ApiError ? error.message : 'Something went wrong loading this bug.'} />);
  }
  if (data.bug.isDeleted) {
    return shell(<EmptyState icon={AlertCircle} title="This bug is deleted" description="Restore it from the bug page before editing it." />);
  }
  return <EditBugForm data={data} meta={meta} products={productsData?.products} canTriage={me?.user.permissions.canTriage ?? false} />;
}

function EditBugForm({ data, meta, products, canTriage }: { data: BugDetailResponse; meta?: BugMeta; products?: Product[]; canTriage: boolean }) {
  const { bug, attachments } = data;
  const navigate = useNavigate();
  const { toast } = useToast();
  const editor = useBugEditor(bug, meta, products, canTriage);
  const { draft, set } = editor;
  const updateBug = useUpdateBug(bug.id);
  const updateReport = useUpdateReport(bug.id);

  // ---- title: the tag stays, only the words after it are edited
  const tag = (TAG.exec(bug.summary)?.[0] ?? '').trim();
  const title = draft.summary.replace(TAG, '');
  const setTitle = (next: string) => set('summary', tag ? `${tag} ${next}` : next);

  // ---- report fields, read once from the report as the page opened
  const originalText = bug.description ?? '';
  const originalDoc = useMemo(() => parseReport(originalText), [originalText]);
  const [initialForm] = useState(() => readForm(originalDoc, bug.product));
  const [form, setForm] = useState<ReportForm>(initialForm);
  const put = <K extends keyof ReportForm>(key: K, value: ReportForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const toggle = (key: 'browsers' | 'devices', v: string) =>
    setForm((f) => ({ ...f, [key]: f[key].includes(v) ? f[key].filter((x) => x !== v) : [...f[key], v] }));
  const originalCategory = bug.triage?.category ?? 'Unclassified';
  const [category, setCategory] = useState<string>(originalCategory);
  const baseRevisions = useRef<number | undefined>(bug.reportHistory?.revisions ?? 0);

  // ---- severity / priority, as on New bug
  const levelOf = (severity: string) => (Object.keys(SEVERITY_LEVELS) as SeverityLevel[]).find((l) => SEVERITY_LEVELS[l].severity === severity);
  const level = levelOf(draft.severity);
  const stepsNeeded = level ? stepsRequired(level) : draft.severity === 'blocker';
  const severityOptions = [
    ...(Object.keys(SEVERITY_LEVELS) as SeverityLevel[]).map((l) => ({ value: SEVERITY_LEVELS[l].severity as string, label: l[0] + l.slice(1).toLowerCase(), dot: LEVEL_DOT[l] })),
    ...(level ? [] : [{ value: draft.severity, label: draft.severity[0]?.toUpperCase() + draft.severity.slice(1) }]),
  ];
  const priorityOptions = [
    ...PRIORITY_OPTIONS.map((p) => ({ value: p.value as string, label: p.label as string })),
    ...(PRIORITY_OPTIONS.some((p) => p.value === draft.priority) ? [] : [{ value: draft.priority, label: draft.priority }]),
  ];

  // ---- the report text Save would write
  const doc = useMemo(() => {
    let d = writeForm(originalDoc, initialForm, form);
    if (category !== originalCategory) d = syncCategoryLine(d, category);
    if (editor.isDirty('severity') || editor.isDirty('priority')) {
      d = d.map((s) => (s.meta && s.heading?.toLowerCase() === 'severity' ? { ...s, body: `${draft.severity} / Priority: ${draft.priority}` } : s));
    }
    if (editor.isDirty('component')) d = d.map((s) => (s.meta && s.heading?.toLowerCase() === 'module' ? { ...s, body: draft.component } : s));
    return d;
  }, [originalDoc, initialForm, form, category, originalCategory, editor, draft.severity, draft.priority, draft.component]);
  const text = serializeReport(doc);
  const reportChanged = text.trim() !== serializeReport(originalDoc).trim();
  const categoryChanged = category !== originalCategory;

  // ---- new evidence, uploaded after the save
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    const incoming = Array.from(list);
    const tooBig = incoming.filter((f) => f.size > MAX_FILE_BYTES);
    setFileError(tooBig.length ? `${tooBig.map((f) => f.name).join(', ')} ${tooBig.length === 1 ? 'is' : 'are'} over 50 MB.` : '');
    setFiles((prev) => [...prev, ...incoming.filter((f) => f.size <= MAX_FILE_BYTES && !prev.some((p) => p.name === f.name && p.size === f.size))]);
  }
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const pasted = Array.from(e.clipboardData?.files ?? []);
      if (!pasted.length) return;
      e.preventDefault();
      addFiles(
        pasted.map((f) => {
          const image = /^image\.(png|jpe?g|gif|webp)$/i.exec(f.name);
          return image ? new File([f], `screenshot-${pastedStamp()}.${image[1].toLowerCase()}`, { type: f.type }) : f;
        })
      );
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  // ---- options
  const product = products?.find((p) => p.name === draft.product);
  const component = product?.components.find((c) => c.name === draft.component);
  const subOptions = (component?.subcomponents ?? []).filter((sc) => sc.isActive || sc.value === draft.subcomponent);
  const { data: assignable } = useAssignableUsers(draft.product || undefined);
  const ownerSet = new Set((assignable?.owners ?? []).map((e) => e.toLowerCase()));
  const ownerUsers = (assignable?.users ?? []).filter((u) => ownerSet.has(u.email.toLowerCase()));
  const otherUsers = (assignable?.users ?? []).filter((u) => !ownerSet.has(u.email.toLowerCase()));
  const assigneeKnown = (assignable?.users ?? []).some((u) => u.email.toLowerCase() === draft.assignedTo.toLowerCase());

  // ---- validation, shown after the first Save, as on New bug
  const [showErrors, setShowErrors] = useState(false);
  const allErrors = validate(form, title, draft.product, draft.component, stepsNeeded);
  const errors = showErrors ? allErrors : {};
  const missingKeys = Object.keys(FIELD_LABELS).filter((k) => allErrors[k]);
  const invalid = (k: string) => (errors[k] ? 'true' : undefined);

  const fieldsChanged = editor.dirty.length > 0;
  const dirty = fieldsChanged || reportChanged || categoryChanged || files.length > 0;
  const [conflict, setConflict] = useState<null | 'fields' | 'report'>(null);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Leaving with unsaved edits asks first (reload / closing the tab).
  useEffect(() => {
    if (!dirty || saving) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, saving]);

  async function onSubmit(e?: FormEvent) {
    e?.preventDefault();
    setSubmitError(null);
    setShowErrors(true);
    if (missingKeys.length) {
      toast({
        variant: 'error',
        title: `${missingKeys.length} required field${missingKeys.length === 1 ? '' : 's'} need${missingKeys.length === 1 ? 's' : ''} attention`,
        description: missingKeys.map((k) => FIELD_LABELS[k]).join(', '),
      });
      focusField(missingKeys[0]);
      return;
    }
    const otherErrors = Object.values(editor.errors).filter(Boolean) as string[];
    if (otherErrors.length) return setSubmitError(otherErrors.join(' '));
    if (!dirty) return navigate(`/bugs/${bug.id}`);

    setSaving(true);
    const done: string[] = [];
    try {
      // Fields first: the report save adds a comment, which would make this
      // update's "last changed" check see a change that is our own.
      if (fieldsChanged) {
        try {
          await updateBug.mutateAsync(editor.buildPayload());
          editor.markSaved();
          done.push('details');
        } catch (err) {
          if (err instanceof ApiError && err.code === 'CONFLICT' && err.details?.reason === 'MID_AIR_COLLISION') {
            setConflict('fields');
            return;
          }
          throw err;
        }
      }
      if (reportChanged || categoryChanged) {
        try {
          await updateReport.mutateAsync({
            text,
            ...(categoryChanged ? { category } : {}),
            ...(baseRevisions.current !== undefined ? { baseRevisions: baseRevisions.current } : {}),
          });
          done.push('report');
        } catch (err) {
          if (err instanceof ApiError && err.code === 'CONFLICT' && err.details?.reason === 'MID_AIR_COLLISION') {
            setConflict('report');
            return;
          }
          throw err;
        }
      }
      const failed: string[] = [];
      for (const file of files) {
        setUploading(file.name);
        try {
          await uploadAttachment(bug.id, file, { summary: `Evidence: ${file.name}` });
        } catch {
          failed.push(file.name);
        }
      }
      setUploading(null);
      const attached = files.length - failed.length;
      if (attached) done.push(`${attached} file${attached === 1 ? '' : 's'}`);
      if (failed.length) {
        setFiles((prev) => prev.filter((f) => failed.includes(f.name)));
        toast({ variant: 'error', title: `${failed.length} file${failed.length === 1 ? '' : 's'} could not be attached`, description: `${failed.join(', ')} - try again.` });
        return;
      }
      toast({ variant: 'success', title: `${bugDisplayId(bug)} updated`, description: `Saved: ${done.join(', ')}.` });
      // Back to the list the reader came from, as after any save on the bug page.
      navigate(lastListView());
    } catch (err) {
      setSubmitError(`${done.length ? `Saved ${done.join(' and ')}, but then: ` : ''}${err instanceof ApiError ? err.message : 'Could not save. Please try again.'}`);
    } finally {
      setSaving(false);
      setUploading(null);
    }
  }

  return (
    <div className="mx-auto max-w-[96rem] animate-page-in px-4 py-6 sm:px-6 lg:px-8 2xl:px-10">
      <PageHeader
        back={{ to: `/bugs/${bug.id}`, label: `Back to ${bugDisplayId(bug)}` }}
        icon={Pencil}
        title={`Edit ${bugDisplayId(bug)}`}
        description="The same form as New bug, filled in. The old report is kept in the bug's history."
      />

      <form onSubmit={onSubmit} noValidate autoComplete="off" className="flex min-w-0 flex-col gap-6">
        <p className="-mb-2 text-xs text-slate-600">
          Fields marked <RequiredMark /> are required.
        </p>

        <Section step={1} title="Where" subtitle="Product, module, and who picks it up.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div data-field="product" data-invalid={invalid('product')}>
              <Select label="Product" value={draft.product} onChange={(e) => set('product', e.target.value)} error={errors.product} required>
                {withCurrent((products ?? []).map((p) => p.name), draft.product).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </div>
            <div data-field="component" data-invalid={invalid('component')}>
              <Select
                label="Component (module)"
                placeholder="Select a component"
                value={draft.component}
                onChange={(e) => set('component', e.target.value)}
                error={errors.component ?? editor.errors.component}
                required
              >
                {withCurrent(product?.components.filter((c) => c.isActive !== false).map((c) => c.name) ?? [], draft.component).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </div>
            {(subOptions.length > 0 || draft.subcomponent) && (
              <Select label="Sub-component" value={draft.subcomponent} onChange={(e) => set('subcomponent', e.target.value)} hint={`Narrows the bug within ${draft.component}. Optional.`}>
                <option value="">None</option>
                {subOptions.map((sc) => (
                  <option key={sc.id} value={sc.value}>
                    {sc.name}
                  </option>
                ))}
                {draft.subcomponent && !subOptions.some((sc) => sc.value === draft.subcomponent) && (
                  <option value={draft.subcomponent}>{subcomponentName(draft.subcomponent)}</option>
                )}
              </Select>
            )}
            <Select
              label="Assign to"
              value={draft.assignedTo}
              onChange={(e) => set('assignedTo', e.target.value)}
              disabled={editor.lockAssignee}
              hint={editor.lockAssignee ? `${bug.status} bugs keep their assignee - reopen it to hand it on.` : undefined}
            >
              {!assigneeKnown && draft.assignedTo && <option value={draft.assignedTo}>{bug.assignedTo?.name || draft.assignedTo}</option>}
              {ownerUsers.length > 0 && (
                <optgroup label={`Owns ${draft.product}`}>
                  {ownerUsers.map((u) => (
                    <option key={u.email} value={u.email}>
                      {assigneeLabel(u)}
                    </option>
                  ))}
                </optgroup>
              )}
              {otherUsers.length > 0 && (
                <optgroup label="Other engineers">
                  {otherUsers.map((u) => (
                    <option key={u.email} value={u.email}>
                      {assigneeLabel(u)}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
          </div>
          <BugKindPicker value={form.kind} onChange={(v) => put('kind', v)} hint="Change it if this bug is the other kind." />
          {product && (product.versions.length > 1 || editor.errors.version) && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label="Version" placeholder="Select a version" value={draft.version} onChange={(e) => set('version', e.target.value)} error={editor.errors.version}>
                {withCurrent(product.versions, draft.version).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </Section>

        <Section step={2} title="The defect" subtitle="How it is titled, tagged and prioritised - the same fields the bench sets.">
          {form.kind === 'api' ? (
            <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3" data-field="path" data-invalid={invalid('path')}>
              <Select label="Method" value={form.method} onChange={(e) => put('method', e.target.value)}>
                {withCurrent([...HTTP_METHODS], form.method).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
              <Input label="Endpoint" required value={form.path} onChange={(e) => put('path', e.target.value.trim())} placeholder="/v2/kmail/inboxMails/" className={MONO} error={errors.path} />
            </div>
          ) : (
            <>
              <UiPlatformPicker value={form.uiPlatform} onChange={(v) => put('uiPlatform', v)} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label={form.uiPlatform === 'mobile' ? 'Screen' : 'Page / screen'}
                  value={form.page}
                  onChange={(e) => put('page', e.target.value)}
                  placeholder={form.uiPlatform === 'mobile' ? 'Inbox, Write Mail, Settings…' : '/kmail/inbox or Write Mail'}
                  hint="Where in the app it happens."
                />
                {form.uiPlatform === 'mobile' ? (
                  <TickGroup
                    id="devices"
                    label="Devices affected"
                    options={BUG_DEVICES.map((d) => ({ value: d, label: DEVICE_LABELS[d] }))}
                    selected={form.devices}
                    onToggle={(v) => toggle('devices', v)}
                    error={errors.devices}
                    hint="Tick every device platform it happens on."
                  />
                ) : (
                  <TickGroup
                    id="browsers"
                    label="Browsers affected"
                    options={BUG_BROWSERS.map((b) => ({ value: b, label: b }))}
                    selected={form.browsers}
                    onToggle={(v) => toggle('browsers', v)}
                    error={errors.browsers}
                    hint="Tick every browser it happens in."
                  />
                )}
              </div>
            </>
          )}

          <div data-field="title" data-invalid={invalid('title')}>
            <Input
              label="Title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              error={errors.title ?? editor.errors.summary}
              hint={tag ? `Saved as: ${tag} ${title.trim()}` : undefined}
              maxLength={240}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {withCurrent([...BUG_CATEGORIES], category).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <div data-field="classification" data-invalid={invalid('classification')}>
              <ClassificationPicker
                id="edit-bug-classification"
                label="Classification"
                required
                value={form.classification}
                onChange={(v) => put('classification', v)}
                options={classificationOptions(form.kind)}
                placeholder={form.kind === 'api' ? 'response.status-code' : 'ui.content'}
                error={errors.classification}
              />
            </div>
          </div>

          <Segmented
            label="Severity"
            value={draft.severity}
            onChange={(v) => set('severity', v)}
            options={severityOptions}
            hint={level ? `${SEVERITY_LEVELS[level].hint}.` : undefined}
          />
          <Segmented
            label="Priority"
            value={draft.priority}
            onChange={(v) => set('priority', v)}
            options={priorityOptions}
            hint={PRIORITY_OPTIONS.find((p) => p.value === draft.priority)?.hint}
          />
        </Section>

        <Section step={3} title="Report" subtitle="What a developer needs to understand and reproduce it without asking.">
          <div data-field="summary" data-invalid={invalid('summary')}>
            <Textarea
              label="Summary"
              required
              value={form.summary}
              onChange={(e) => put('summary', e.target.value)}
              error={errors.summary}
              rows={3}
              placeholder="In plain words: what you did, what went wrong, and who it affects."
            />
          </div>
          <Textarea label="Preconditions" value={form.preconditions} onChange={(e) => put('preconditions', e.target.value)} rows={2} placeholder="What has to be true first - account, data, settings." />
          <div data-field="steps" data-invalid={invalid('steps')}>
            <Textarea
              label="Steps to reproduce"
              required={stepsNeeded}
              value={form.steps}
              onChange={(e) => put('steps', e.target.value)}
              error={errors.steps}
              rows={4}
              placeholder={'1. Sign in as …\n2. Open …\n3. Click …'}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Textarea label="Expected" value={form.expected} onChange={(e) => put('expected', e.target.value)} rows={3} />
            <Textarea label="Actual" value={form.actual} onChange={(e) => put('actual', e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Textarea label="Why it matters" value={form.whyItMatters} onChange={(e) => put('whyItMatters', e.target.value)} rows={2} placeholder="User or business impact." />
            <Textarea label="How to fix" value={form.howToFix} onChange={(e) => put('howToFix', e.target.value)} rows={2} placeholder="A suggested fix, if you know one." />
          </div>
        </Section>

        {form.kind === 'api' && (
          <Section step={4} title="Reproduce" subtitle="A runnable command and the response it returned.">
            <CurlField value={form.curl} onChange={(v) => put('curl', v)} onGenerate={() => put('curl', curlTemplate(form.method, form.path))} error={errors.curl} />
            <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
              <div data-field="responseStatus" data-invalid={invalid('responseStatus')}>
                <Input label="HTTP status" value={form.responseStatus} onChange={(e) => put('responseStatus', e.target.value.trim())} inputMode="numeric" maxLength={3} placeholder="500" error={errors.responseStatus} />
              </div>
              <Input label="Correlation ID" value={form.correlationId} onChange={(e) => put('correlationId', e.target.value)} placeholder="Optional - from the X-Correlation-ID header" className={MONO} />
            </div>
            <Textarea
              label="Response body"
              value={form.responseBody}
              onChange={(e) => put('responseBody', e.target.value)}
              rows={3}
              spellCheck={false}
              className={MONO}
              placeholder='{"message":"Unable to fetch messages","status":"error","statusCode":500}'
            />
          </Section>
        )}

        <Section step={form.kind === 'api' ? 5 : 4} title="Context & evidence" subtitle="Where it was seen, and the proof - screenshots, videos, logs.">
          <div data-field="environment" data-invalid={invalid('environment')}>
            <Input label="Environment" required value={form.environment} onChange={(e) => put('environment', e.target.value)} error={errors.environment} />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-700">Evidence</span>
            {attachments.length > 0 && (
              <div className="overflow-hidden rounded-xl ring-1 ring-inset ring-hairline">
                <AttachmentList bugId={bug.id} attachments={attachments} privateAllowed={meta?.features.privateComments} />
              </div>
            )}
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              className={cn(
                'focus-within:ring-brand-600 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-4 py-5 text-center text-sm text-slate-600 transition-colors hover:border-brand-500 hover:bg-white/70',
                dragging ? 'border-brand-500 bg-brand-50' : 'border-line bg-white/50'
              )}
            >
              <Paperclip className="h-4 w-4 text-slate-500" aria-hidden />
              <span>
                <span className="font-medium text-brand-700">Choose files</span>, drop them here, or paste with{' '}
                <kbd className="rounded border border-slate-300 bg-white px-1 font-mono text-xs text-slate-700">Ctrl</kbd>+
                <kbd className="rounded border border-slate-300 bg-white px-1 font-mono text-xs text-slate-700">V</kbd>
              </span>
              <span className="text-xs text-slate-500">Screenshot, video, HAR or log - up to 50 MB each</span>
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
                    <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((prev) => prev.filter((p) => p !== f))} className="focus-ring rounded p-0.5 text-slate-500 hover:text-rose-600">
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>

        {conflict && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            <p className="min-w-0 flex-1">
              <span className="font-semibold">Someone else changed this bug while you were editing.</span>{' '}
              {conflict === 'report'
                ? 'Your details were saved. Saving again replaces their report - theirs stays in the history.'
                : 'Your edits are still here. Open the bug in a new tab to see their change, then save again.'}
            </p>
            {conflict === 'report' && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  baseRevisions.current = undefined;
                  setConflict(null);
                  void onSubmit();
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Save anyway
              </Button>
            )}
          </div>
        )}

        {submitError && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
            {submitError}
          </p>
        )}

        {/* Sticky, so Save is always in reach on a long bug. */}
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-3 rounded-xl bg-white/85 px-4 py-3 shadow-card ring-1 ring-inset ring-white/80 backdrop-blur-xl">
          {showErrors && missingKeys.length > 0 && (
            <div role="alert" className="mr-auto flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-rose-700">
              <span className="font-medium">
                {missingKeys.length} required field{missingKeys.length === 1 ? '' : 's'} missing:
              </span>
              {missingKeys.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => focusField(k)}
                  className="focus-ring rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-100"
                >
                  {FIELD_LABELS[k]}
                </button>
              ))}
            </div>
          )}
          <Button type="button" variant="secondary" onClick={() => navigate(`/bugs/${bug.id}`)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} disabled={!dirty}>
            {!saving && <Save className="h-4 w-4" />}
            {uploading ? `Attaching ${uploading}…` : dirty ? 'Save changes' : 'No changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}

/** The options, plus the current value if it is no longer among them, so a select never shows blank. */
function withCurrent(options: string[], current: string): string[] {
  return current && !options.includes(current) ? [current, ...options] : options;
}
