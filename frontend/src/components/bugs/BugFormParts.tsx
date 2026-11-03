import { Check, Globe, MonitorSmartphone, Server, Smartphone, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import type { BugKind, SeverityLevel, UiPlatform } from '../../lib/bugTemplate';
import { cn } from '../../lib/utils';
import { Card } from '../ui/Card';
import { RequiredMark } from '../ui/Field';

/*
 * The building blocks of the New bug and Edit bug forms, so both look and ask
 * the same.
 */

/** Monospace text for endpoints, curl, response bodies. */
export const MONO = 'font-mono text-[0.8667rem] leading-relaxed';

export const LEVEL_DOT: Record<SeverityLevel, string> = {
  CRITICAL: 'bg-rose-500',
  HIGH: 'bg-orange-500',
  MEDIUM: 'bg-amber-400',
  LOW: 'bg-slate-400',
};

/** A small one-of-N toggle; a select would hide the options this form wants people to compare. */
export function Segmented<T extends string>({
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
 * A numbered step of the form.
 * Own header rather than CardHeader: that one is `justify-between`, and `cn` is plain clsx, so a
 * `justify-start` override does not win - it pushed the title to the far right of the card.
 */
export function Section({ step, title, subtitle, children }: { step: number; title: string; subtitle: string; children: ReactNode }) {
  return (
    <Card>
      <div className="flex items-center gap-3 border-b border-hairline px-6 py-4">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-semibold text-white shadow-sm ring-1 ring-inset ring-white/30">
          {step}
        </span>
        <div className="min-w-0">
          <h2 className="text-[1rem] font-semibold leading-5 text-slate-900">{title}</h2>
          <p className="text-xs leading-5 text-slate-600">{subtitle}</p>
        </div>
      </div>
      <div className="flex flex-col gap-5 px-6 py-5">{children}</div>
    </Card>
  );
}

const KIND_OPTIONS: { value: BugKind; title: string; detail: string; icon: typeof Server }[] = [
  { value: 'api', title: 'API bug', detail: 'A backend endpoint misbehaves - asks for endpoint, curl and response.', icon: Server },
  { value: 'ui', title: 'UI bug', detail: 'Something on a screen is wrong - asks for page and browsers.', icon: MonitorSmartphone },
];

/** API bug or UI bug: decides which fields the form asks for. */
export function BugKindPicker({ value, onChange, hint }: { value: BugKind; onChange: (v: BugKind) => void; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span id="bug-type-label" className="text-sm font-medium text-slate-700">
        Bug type
      </span>
      <div role="radiogroup" aria-labelledby="bug-type-label" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {KIND_OPTIONS.map((o) => {
          const active = value === o.value;
          const Icon = o.icon;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.value)}
              className={cn(
                'focus-ring group relative flex items-start gap-3 rounded-xl p-3.5 text-left transition-all',
                active ? 'bg-white shadow-sm ring-2 ring-brand-600' : 'bg-white/50 ring-1 ring-inset ring-slate-900/10 hover:bg-white/80 hover:ring-slate-900/20',
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
                  active ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white',
                )}
                aria-hidden
              >
                {active && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
            </button>
          );
        })}
      </div>
      {hint && <p className="text-xs text-slate-600">{hint}</p>}
    </div>
  );
}

/** Web app or mobile app: decides whether browsers or devices are asked for. */
export function UiPlatformPicker({ value, onChange }: { value: UiPlatform; onChange: (v: UiPlatform) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span id="ui-platform-label" className="text-sm font-medium text-slate-700">
        Where is it?
        <RequiredMark />
      </span>
      <div role="radiogroup" aria-labelledby="ui-platform-label" className="grid grid-cols-2 gap-1 rounded-xl bg-slate-900/[0.06] p-1 sm:max-w-sm">
        {(
          [
            ['web', 'Web', Globe, 'In a browser'],
            ['mobile', 'Mobile', Smartphone, 'In the mobile app'],
          ] as const
        ).map(([v, label, Icon, hint]) => {
          const on = value === v;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(v)}
              className={cn(
                'focus-ring flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-all',
                on ? 'bg-white font-semibold text-brand-800 shadow-sm ring-1 ring-slate-900/5' : 'font-medium text-slate-600 hover:bg-white/50',
              )}
            >
              <Icon className={cn('h-4 w-4 shrink-0', on ? 'text-brand-600' : 'text-slate-400')} aria-hidden />
              <span className="flex flex-col leading-tight">
                {label}
                <span className="text-2xs font-normal text-slate-500">{hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Tick-boxes as a segmented group: the browsers or devices a UI bug happens on. Required. */
export function TickGroup({
  id,
  label,
  options,
  selected,
  onToggle,
  error,
  hint,
}: {
  id: string;
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  error?: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col gap-1.5" data-field={id} data-invalid={error ? 'true' : undefined}>
      <span id={`${id}-label`} className="text-sm font-medium text-slate-700">
        {label}
        <RequiredMark />
      </span>
      <div role="group" aria-labelledby={`${id}-label`} className="grid grid-cols-2 gap-1 rounded-xl bg-slate-900/[0.06] p-1">
        {options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(o.value)}
              className={cn(
                'focus-ring flex items-center gap-2 rounded-lg px-2.5 py-[7px] text-sm transition-all',
                on ? 'bg-white font-semibold text-brand-800 shadow-sm ring-1 ring-slate-900/5' : 'font-medium text-slate-600 hover:bg-white/50',
              )}
            >
              <span
                className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', on ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white')}
                aria-hidden
              >
                {on && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              {o.label}
            </button>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="text-xs font-medium text-rose-600">
          {error}
        </p>
      ) : (
        <p className="text-xs text-slate-600">{hint}</p>
      )}
    </div>
  );
}

/** The curl box: a dark terminal-style textarea with "Generate from endpoint". Required for API bugs. */
export function CurlField({ value, onChange, onGenerate, error }: { value: string; onChange: (v: string) => void; onGenerate: () => void; error?: string }) {
  return (
    <div data-field="curl" data-invalid={error ? 'true' : undefined} className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">
          curl
          <RequiredMark />
        </span>
        <button
          type="button"
          onClick={onGenerate}
          className="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-600/10"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> Generate from endpoint
        </button>
      </div>
      {/* A raw textarea, not <Textarea>: its bg-white/80 would fight the dark terminal styling. */}
      <textarea
        aria-label="curl"
        aria-required="true"
        aria-invalid={error ? true : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        spellCheck={false}
        wrap="off"
        className={cn(
          MONO,
          'focus-ring w-full resize-y rounded-xl bg-slate-900 px-4 py-3 text-slate-100 placeholder:text-slate-500 ring-1 ring-inset',
          error ? 'ring-rose-400' : 'ring-slate-900/60',
        )}
        placeholder={"curl -X POST 'https://testingapi.kpostindia.com/v2/…' \\\n  -H 'Authorization: Bearer $KPOST_TOKEN' \\\n  -H 'Content-Type: application/json' \\\n  --data '{…}'"}
      />
      {error ? (
        <p role="alert" className="text-xs font-medium text-rose-600">
          {error}
        </p>
      ) : (
        <p className="text-xs text-slate-600">Keep the token as $KPOST_TOKEN - never paste a live one.</p>
      )}
    </div>
  );
}
