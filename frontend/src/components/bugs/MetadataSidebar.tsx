import { Boxes, CircleDot, Clock, Flag, Gauge, GitBranch, RotateCcw, ShieldCheck, Tag, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { subcomponentName } from '../../lib/utils';
import { useAssignableUsers } from '../../api/hooks';
import type { Bug, BugMeta, Product } from '../../types';
import { parseBugRef, type BugEditor, type DraftKey } from '../../lib/useBugEditor';
import { bugDisplayId, formatDateTime } from '../../lib/utils';
import { Avatar } from '../ui/Avatar';
import { Card } from '../ui/Card';
import { BrowserPills, MobilePill } from '../ui/Pill';
import { Input, Select } from '../ui/Field';
import { ChipInput } from './edit/ChipInput';
import { Changed, EditSection } from './edit/EditSection';

const SECTION_FIELDS: Record<string, DraftKey[]> = {
  status: ['status', 'resolution', 'dupeOf'],
  classification: ['priority', 'severity'],
  placement: ['product', 'component', 'subcomponent', 'version', 'targetMilestone', 'opSys', 'platform'],
  people: ['assignedTo', 'resetAssignedTo', 'qaContact', 'resetQaContact', 'cc'],
  relations: ['dependsOn', 'blocks', 'seeAlso', 'url'],
  time: ['estimatedTime', 'remainingTime', 'workTime', 'deadline'],
  visibility: ['groups', 'isCcAccessible', 'isCreatorAccessible'],
  labels: ['alias', 'keywords', 'whiteboard'],
  flags: ['flags'],
};

/** Options for a <select>, always including the current value so a set field never renders blank. */
function withCurrent(options: string[], current: string): string[] {
  return current && !options.includes(current) ? [current, ...options] : options;
}

const FLAG_STATUS: Record<string, string> = { '+': 'Granted (+)', '-': 'Denied (-)', '?': 'Requested (?)', X: 'Clear' };

export function MetadataSidebar({
  bug,
  meta,
  editor,
  products,
  currentUser,
  saveBar,
}: {
  /** The save / discard section, shown under "Created" while there are unsaved changes. */
  saveBar?: ReactNode;
  bug: Bug;
  meta?: BugMeta;
  editor: BugEditor;
  products?: Product[];
  currentUser?: string;
}) {
  const { draft, baseline, set } = editor;
  const features = meta?.features;
  const { data: assignable } = useAssignableUsers(draft.product);
  const people = assignable?.users ?? [];
  const changesIn = (section: string) => SECTION_FIELDS[section].filter((k) => editor.isDirty(k)).length;
  const err = editor.errors;
  const product = editor.draftProduct;
  const nameFor = (email: string) =>
    bug.ccDetail.find((u) => u.email === email)?.name ?? people.find((u) => u.email === email)?.name ?? email;

  const me = currentUser ?? '';
  const iAmCc = me !== '' && draft.cc.some((e) => e.toLowerCase() === me.toLowerCase());
  const productNames = withCurrent((products ?? []).map((p) => p.name), baseline.product);
  const time = bug.timeTracking;
  const workLogged = Number(draft.workTime) || 0;
  const actual = (time?.actualTime ?? 0) + (editor.errors.workTime ? 0 : workLogged);
  const remaining = Number(draft.remainingTime) || 0;
  const progress = actual + remaining > 0 ? Math.round((actual / (actual + remaining)) * 100) : 0;

  return (
    <Card className="self-start lg:sticky lg:top-[5rem] lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
      <div className="flex items-center justify-between border-b border-white/40 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Details</h2>
        <span className="text-xs text-slate-500" title={formatDateTime(bug.lastChangeTime)}>
          Updated {formatDateTime(bug.lastChangeTime)}
        </span>
      </div>

      {/* ---- Status ---- */}
      <EditSection id="status" title="Status" icon={CircleDot} changes={changesIn('status')} summary={draft.status.replace('_', ' ')}>
        <Changed when={editor.isDirty('status')}>
          <Select
            label="Status"
            value={draft.status}
            onChange={(e) => set('status', e.target.value)}
            error={editor.errors.status}
            hint={
              editor.allowedStatuses.length <= 1
                ? 'No other status is allowed from here by the workflow.'
                : !bug.isOpen && !editor.allowedStatuses.includes('REOPENED') && editor.draft.status === bug.status
                  ? 'Still broken? Ask a tester to reopen it.'
                  : undefined
            }
          >
            {withCurrent(editor.allowedStatuses, draft.status).map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
                {s === baseline.status ? ' (current)' : ''}
              </option>
            ))}
          </Select>
        </Changed>

        {editor.needsResolution && (
          <Changed when={editor.isDirty('resolution')}>
            <Select
              label="Resolution"
              placeholder="Choose…"
              value={draft.resolution}
              onChange={(e) => set('resolution', e.target.value)}
              error={err.resolution}
            >
              {(meta?.resolutions ?? [draft.resolution]).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Changed>
        )}

        {editor.isDuplicate && (
          <Changed when={editor.isDirty('dupeOf')}>
            <Input
              label="Duplicate of"
              value={draft.dupeOf}
              onChange={(e) => set('dupeOf', e.target.value)}
              placeholder="e.g. 806 or KPA-806"
              inputMode="numeric"
              error={err.dupeOf}
              hint="The bug this one duplicates."
            />
          </Changed>
        )}
      </EditSection>

      {/* ---- Priority & severity ---- */}
      <EditSection
        id="classification"
        title="Priority & severity"
        icon={Gauge}
        changes={changesIn('classification')}
        summary={`${draft.priority} · ${draft.severity}`}
      >
        <div className="grid grid-cols-2 gap-3">
          <Changed when={editor.isDirty('priority')}>
            <Select label="Priority" value={draft.priority} onChange={(e) => set('priority', e.target.value)}>
              {withCurrent(meta?.priorities ?? [], draft.priority).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Changed>
          <Changed when={editor.isDirty('severity')}>
            <Select label="Severity" value={draft.severity} onChange={(e) => set('severity', e.target.value)}>
              {withCurrent(meta?.severities ?? [], draft.severity).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Changed>
        </div>
      </EditSection>

      {/* ---- Product & placement ---- */}
      <EditSection id="placement" title="Product & component" icon={Boxes} changes={changesIn('placement')} summary={`${draft.product} / ${draft.component || '—'}${draft.subcomponent ? ` / ${subcomponentName(draft.subcomponent)}` : ''}`}>
        <Changed when={editor.isDirty('product')}>
          <Select
            label="Product"
            value={draft.product}
            onChange={(e) => set('product', e.target.value)}
            hint={editor.isDirty('product') ? 'Moving products: pick the component and version it belongs to there. Visibility follows the new product.' : undefined}
          >
            {productNames.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Changed>
        <Changed when={editor.isDirty('component')}>
          <Select
            label="Component"
            placeholder={draft.component ? undefined : 'Choose…'}
            value={draft.component}
            onChange={(e) => set('component', e.target.value)}
            error={err.component}
          >
            {withCurrent(product?.components.map((c) => c.name) ?? [], draft.component).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Changed>
        {/* Sub-component: the chosen component's live ones, plus the saved one if it has since been deactivated. */}
        {(() => {
          const subs = product?.components.find((c) => c.name === draft.component)?.subcomponents ?? [];
          const offered = subs.filter((sc) => sc.isActive || sc.value === draft.subcomponent);
          if (offered.length === 0 && !draft.subcomponent) return null;
          return (
            <Changed when={editor.isDirty('subcomponent')}>
              <Select
                label="Sub-component"
                value={draft.subcomponent}
                onChange={(e) => set('subcomponent', e.target.value)}
                hint={editor.isDirty('component') ? 'Cleared because the component changed. Pick one from the new component, or leave it empty.' : undefined}
              >
                <option value="">None</option>
                {offered.map((sc) => (
                  <option key={sc.id} value={sc.value}>
                    {sc.name}
                    {sc.isActive ? '' : ' (inactive)'}
                  </option>
                ))}
                {draft.subcomponent && !offered.some((sc) => sc.value === draft.subcomponent) && (
                  <option value={draft.subcomponent}>{subcomponentName(draft.subcomponent)}</option>
                )}
              </Select>
            </Changed>
          );
        })()}
        <div className="grid grid-cols-2 gap-3">
          <Changed when={editor.isDirty('version')}>
            <Select
              label="Version"
              placeholder={draft.version ? undefined : 'Choose…'}
              value={draft.version}
              onChange={(e) => set('version', e.target.value)}
              error={err.version}
            >
              {withCurrent(product?.versions ?? [], draft.version).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          </Changed>
          {features?.targetMilestone ? (
            <Changed when={editor.isDirty('targetMilestone')}>
              <Select label="Milestone" value={draft.targetMilestone} onChange={(e) => set('targetMilestone', e.target.value)}>
                {withCurrent(product?.milestones ?? [], draft.targetMilestone).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </Changed>
          ) : (
            <div />
          )}
          <Changed when={editor.isDirty('opSys')}>
            <Select label="OS" value={draft.opSys} onChange={(e) => set('opSys', e.target.value)}>
              {withCurrent(meta?.opSystems ?? [], draft.opSys).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          </Changed>
          <Changed when={editor.isDirty('platform')}>
            <Select label="Platform" value={draft.platform} onChange={(e) => set('platform', e.target.value)}>
              {withCurrent(meta?.platforms ?? [], draft.platform).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Changed>
        </div>
      </EditSection>

      {/* ---- People ---- */}
      <EditSection
        id="people"
        title="People"
        icon={Users}
        changes={changesIn('people')}
        summary={bug.assignedTo?.name ?? 'Unassigned'}
      >
        <Changed when={editor.isDirty('assignedTo') || editor.isDirty('resetAssignedTo')}>
          <Select
            label="Assignee"
            value={draft.resetAssignedTo ? '__default__' : draft.assignedTo}
            onChange={(e) =>
              e.target.value === '__default__' ? set('resetAssignedTo', true) : set('assignedTo', e.target.value)
            }
            disabled={editor.lockAssignee}
            hint={
              editor.isClosed
                ? "Closed bugs can't be reassigned — reopen it to change the assignee."
                : editor.needsResolution
                  ? 'Save the reassignment before closing — the assignee records who fixed it.'
                  : draft.resetAssignedTo
                    ? `Goes back to ${draft.component || 'the component'}'s default assignee on save.`
                    : undefined
            }
          >
            {(() => {
              const options = [...people];
              if (draft.assignedTo && !options.some((u) => u.email === draft.assignedTo)) {
                options.unshift({ email: draft.assignedTo, name: bug.assignedTo?.email === draft.assignedTo ? bug.assignedTo.name : draft.assignedTo });
              }
              return [
                ...options.map((u) => (
                  <option key={u.email} value={u.email} title={u.email}>
                    {u.name}
                  </option>
                )),
                <option key="__default__" value="__default__">
                  ↺ Component default assignee
                </option>,
              ];
            })()}
          </Select>
        </Changed>

        {features?.qaContact && (
          <Changed when={editor.isDirty('qaContact') || editor.isDirty('resetQaContact')}>
            <Select
              label="QA contact"
              value={draft.resetQaContact ? '__default__' : draft.qaContact}
              onChange={(e) => (e.target.value === '__default__' ? set('resetQaContact', true) : set('qaContact', e.target.value))}
            >
              <option value="">Nobody</option>
              {withCurrent(people.map((u) => u.email), draft.qaContact)
                .filter(Boolean)
                .map((email) => (
                  <option key={email} value={email}>
                    {people.find((u) => u.email === email)?.name ?? bug.qaContact?.name ?? email}
                  </option>
                ))}
              <option value="__default__">↺ Component default QA contact</option>
            </Select>
          </Changed>
        )}

        <Changed when={editor.isDirty('cc')}>
          <ChipInput<string>
            label={`CC${draft.cc.length ? ` (${draft.cc.length})` : ''}`}
            values={draft.cc}
            baseline={baseline.cc}
            onChange={(v) => set('cc', v)}
            parse={(raw) =>
              /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? { value: raw.toLowerCase() } : { error: `"${raw}" is not an email address.` }
            }
            renderLabel={(email) => <span title={email}>{nameFor(email)}</span>}
            placeholder="Add by email…"
            suggestions={people.map((u) => ({ value: u.email, label: u.name }))}
            emptyText="Nobody is CC'd."
          />
          {me && (
            <button
              type="button"
              onClick={() => set('cc', iAmCc ? draft.cc.filter((e) => e.toLowerCase() !== me.toLowerCase()) : [...draft.cc, me])}
              className="focus-ring mt-1.5 rounded text-xs font-medium text-brand-700 hover:underline"
            >
              {iAmCc ? 'Remove me from CC' : 'Add me to CC'}
            </button>
          )}
        </Changed>

        <dl className="flex items-center justify-between text-sm">
          <dt className="text-slate-600">Reporter</dt>
          <dd className="flex items-center gap-2 font-medium text-slate-900" title={bug.creator?.email}>
            <Avatar name={bug.creator?.name ?? '?'} />
            {bug.creator?.name ?? 'Unknown'}
          </dd>
        </dl>
      </EditSection>

      {/* ---- Relationships ---- */}
      <EditSection
        id="relations"
        title="Relationships"
        icon={GitBranch}
        changes={changesIn('relations')}
        defaultOpen={bug.dependsOn.length + bug.blocks.length + bug.seeAlso.length > 0 || Boolean(bug.url)}
        summary={
          bug.dependsOn.length + bug.blocks.length > 0 ? `${bug.dependsOn.length} deps · ${bug.blocks.length} blocks` : 'None'
        }
      >
        {(['dependsOn', 'blocks'] as const).map((key) => (
          <Changed key={key} when={editor.isDirty(key)}>
            <ChipInput<number>
              label={key === 'dependsOn' ? 'Depends on' : 'Blocks'}
              values={draft[key]}
              baseline={baseline[key]}
              onChange={(v) => set(key, v)}
              parse={(raw) => {
                const id = parseBugRef(raw);
                if (id === null) return { error: `"${raw}" is not a bug number. Try 806 or KPA-806.` };
                if (id === bug.id) return { error: 'A bug cannot depend on itself.' };
                const other = key === 'dependsOn' ? draft.blocks : draft.dependsOn;
                if (other.includes(id)) return { error: `${bugDisplayId({ id })} is already in ${key === 'dependsOn' ? 'Blocks' : 'Depends on'}.` };
                return { value: id };
              }}
              renderLabel={(id) => bugDisplayId({ id })}
              hrefFor={(id) => `/bugs/${id}`}
              placeholder="Bug number, e.g. 806"
              hint={key === 'dependsOn' ? 'Bugs that must be fixed before this one.' : 'Bugs waiting on this one.'}
            />
          </Changed>
        ))}

        {features?.seeAlso !== false && (
          <Changed when={editor.isDirty('seeAlso')}>
            <ChipInput<string>
              label="See also"
              values={draft.seeAlso}
              baseline={baseline.seeAlso}
              onChange={(v) => set('seeAlso', v)}
              parse={(raw) => (/^https?:\/\/\S+$/i.test(raw) ? { value: raw } : { error: 'Paste a full link starting with http:// or https://.' })}
              renderLabel={(url) => url.replace(/^https?:\/\//, '')}
              hrefFor={(url) => url}
              placeholder="https://…"
              hint="Links to related tickets in other trackers."
            />
          </Changed>
        )}

        <Changed when={editor.isDirty('url')}>
          <Input
            label="URL"
            type="url"
            value={draft.url}
            onChange={(e) => set('url', e.target.value)}
            placeholder="https://… where the bug can be seen"
            error={editor.isDirty('url') ? err.url : undefined}
          />
        </Changed>
      </EditSection>

      {/* ---- Time tracking ---- */}
      {time && (
        <EditSection
          id="time"
          title="Time tracking"
          icon={Clock}
          changes={changesIn('time')}
          defaultOpen={time.estimatedTime + time.actualTime + time.remainingTime > 0 || Boolean(time.deadline)}
          summary={time.deadline ? `Due ${time.deadline.slice(0, 10)}` : `${time.actualTime}h logged`}
        >
          <div className="grid grid-cols-2 gap-3">
            <Changed when={editor.isDirty('estimatedTime')}>
              <Input
                label="Estimate (h)"
                inputMode="decimal"
                value={draft.estimatedTime}
                onChange={(e) => set('estimatedTime', e.target.value)}
                error={err.estimatedTime}
              />
            </Changed>
            <Changed when={editor.isDirty('remainingTime')}>
              <Input
                label="Remaining (h)"
                inputMode="decimal"
                value={draft.remainingTime}
                onChange={(e) => set('remainingTime', e.target.value)}
                error={err.remainingTime}
              />
            </Changed>
          </div>
          <Changed when={editor.isDirty('workTime')}>
            <Input
              label="Log hours worked"
              inputMode="decimal"
              value={draft.workTime}
              onChange={(e) => set('workTime', e.target.value)}
              placeholder="e.g. 1.5"
              error={err.workTime}
              hint="Added to the total and recorded in the comment history."
            />
          </Changed>
          <div>
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>
                <span className="font-semibold tabular-nums text-slate-900">{actual}h</span> worked
              </span>
              <span className="tabular-nums">{progress}% done</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200/80" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Work completed">
              <div className="h-full rounded-full bg-brand-600 transition-[width]" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <Changed when={editor.isDirty('deadline')}>
            <Input label="Deadline" type="date" value={draft.deadline} onChange={(e) => set('deadline', e.target.value)} />
            {draft.deadline && (
              <button type="button" onClick={() => set('deadline', '')} className="focus-ring mt-1 rounded text-xs font-medium text-slate-500 hover:text-rose-600">
                Clear deadline
              </button>
            )}
          </Changed>
        </EditSection>
      )}

      {/* ---- Visibility ---- */}
      <EditSection
        id="visibility"
        title="Visibility"
        icon={ShieldCheck}
        changes={changesIn('visibility')}
        defaultOpen={false}
        summary={draft.groups.length ? `${draft.groups.length} group${draft.groups.length > 1 ? 's' : ''}` : 'Everyone'}
      >
        <Changed when={editor.isDirty('groups')}>
          <fieldset>
            <legend className="text-sm font-medium text-slate-700">Only these groups can see this bug</legend>
            <div className="mt-2 flex flex-col gap-2">
              {(bug.availableGroups ?? bug.groups).map((g) => (
                <label key={g} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={draft.groups.includes(g)}
                    onChange={(e) => set('groups', e.target.checked ? [...draft.groups, g] : draft.groups.filter((x) => x !== g))}
                    className="rounded border-line text-brand-700 focus:ring-brand-600"
                  />
                  {g}
                </label>
              ))}
              {(bug.availableGroups ?? bug.groups).length === 0 && <p className="text-xs text-slate-500">No restricting group exists for this product.</p>}
            </div>
            <p className="mt-2 text-xs text-slate-600">
              {draft.groups.length === 0 ? 'Unrestricted - anyone who can sign in can see it.' : 'Members of a ticked group can see it, plus the people below.'}
            </p>
          </fieldset>
        </Changed>
        <div className="flex flex-col gap-2">
          {(
            [
              ['isCreatorAccessible', 'The reporter can always see it'],
              ['isCcAccessible', 'People on CC can always see it'],
            ] as const
          ).map(([key, text]) => (
            <Changed key={key} when={editor.isDirty(key)}>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={draft[key]}
                  onChange={(e) => set(key, e.target.checked)}
                  className="rounded border-line text-brand-700 focus:ring-brand-600"
                />
                {text}
              </label>
            </Changed>
          ))}
        </div>
      </EditSection>

      {/* ---- Labels ---- */}
      <EditSection
        id="labels"
        title="Labels"
        icon={Tag}
        changes={changesIn('labels')}
        defaultOpen={false}
        summary={draft.alias[0] ?? (draft.keywords.length ? `${draft.keywords.length} keywords` : undefined)}
      >
        <Changed when={editor.isDirty('alias')}>
          <ChipInput<string>
            label="Alias"
            values={draft.alias}
            baseline={baseline.alias}
            onChange={(v) => set('alias', v)}
            parse={(raw) =>
              /^\d+$/.test(raw)
                ? { error: 'An alias cannot be only digits - it would read as a bug number.' }
                : raw.length > 40
                  ? { error: 'Keep an alias under 40 characters.' }
                  : { value: raw }
            }
            placeholder="e.g. login-timeout"
            hint="A memorable name; it replaces the KPA number as this bug's label."
          />
        </Changed>
        {(meta?.keywords.length ?? 0) > 0 && (
          <Changed when={editor.isDirty('keywords')}>
            <ChipInput<string>
              label="Keywords"
              values={draft.keywords}
              baseline={baseline.keywords}
              onChange={(v) => set('keywords', v)}
              parse={(raw) => {
                const match = meta!.keywords.find((k) => k.toLowerCase() === raw.toLowerCase());
                return match ? { value: match } : { error: `"${raw}" is not a keyword on this Bugzilla.` };
              }}
              suggestions={meta!.keywords.map((k) => ({ value: k, label: k }))}
              placeholder="Add keyword…"
            />
          </Changed>
        )}
        <Changed when={editor.isDirty('whiteboard')}>
          <Input
            label="Whiteboard"
            value={draft.whiteboard}
            onChange={(e) => set('whiteboard', e.target.value)}
            hint="Holds the [cat:…], [platform:…], [browser:…] and [device:…] tags used for classification."
            className="font-mono text-xs"
          />
        </Changed>
        {bug.triage?.uiPlatform === 'Mobile' ? (
          <div className="flex items-start justify-between gap-3 text-sm">
            <span className="shrink-0 pt-0.5 text-slate-600">Platform</span>
            <MobilePill devices={bug.triage.devices} />
          </div>
        ) : (
          bug.triage?.browsers &&
          bug.triage.browsers.length > 0 && (
            <div className="flex items-start justify-between gap-3 text-sm">
              <span className="shrink-0 pt-0.5 text-slate-600">{bug.triage.uiPlatform === 'Web' ? 'Web · Browser' : 'Browser'}</span>
              <BrowserPills browsers={bug.triage.browsers} className="justify-end" />
            </div>
          )
        )}
      </EditSection>

      {/* ---- Flags (only when the bug carries any) ---- */}
      {bug.flags.length > 0 && (
        <EditSection id="flags" title="Flags" icon={Flag} changes={changesIn('flags')}>
          {bug.flags.map((f) => (
            <Changed key={f.id} when={draft.flags[f.id] !== baseline.flags[f.id]}>
              <Select
                label={f.name}
                value={draft.flags[f.id]}
                onChange={(e) => set('flags', { ...draft.flags, [f.id]: e.target.value })}
                hint={[f.setter && `Set by ${f.setter}`, f.requestee && `asked of ${f.requestee}`].filter(Boolean).join(', ') || undefined}
              >
                {Object.entries(FLAG_STATUS).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </Select>
            </Changed>
          ))}
        </EditSection>
      )}

      <dl className="flex flex-col gap-2 px-5 py-4 text-xs text-slate-600">
        <div className="flex justify-between">
          <dt>Created</dt>
          <dd className="font-medium text-slate-800">{formatDateTime(bug.creationTime)}</dd>
        </div>
        {!saveBar && editor.dirty.length > 0 && (
          <button
            type="button"
            onClick={editor.reset}
            className="focus-ring mt-1 inline-flex items-center gap-1 self-start rounded font-medium text-slate-500 hover:text-slate-800"
          >
            <RotateCcw className="h-3 w-3" aria-hidden /> Discard all changes
          </button>
        )}
      </dl>
      {saveBar}
    </Card>
  );
}
