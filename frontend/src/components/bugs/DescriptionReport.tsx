import { Check, ChevronRight, Copy, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { copyText } from '../../lib/clipboard';
import { Linkify } from '../ui/Linkify';

interface Sections {
  meta: Array<{ label: string; value: string }>;
  summary: string;
  whatThisMeans: string;
  whyItMatters: string;
  howToFix: string;
  expected: string;
  actual: string;
  repro: string;
  curl: string;
  preconditions: string;
  steps: string;
  responseBody: string;
  responseLabel: string;
}

const META_LINE: Record<string, string> = {
  'Classification:': 'Classification',
  'Category:': 'Category',
  'Representative endpoint:': 'Endpoint',
  'Endpoint:': 'Endpoint',
  'Module:': 'Module',
  'Severity:': 'Severity / Priority',
};

const BLOCK_ANCHORS = [
  'Summary:',
  'Preconditions:',
  'What this means:',
  'Why it matters:',
  'How to fix:',
  'Expected:',
  'Actual:',
  'Response body',
  'Steps to reproduce:',
  'Repro:',
  'Reproduce with Playwright:',
  'curl:',
  'Browsers affected:',
  'Correlation ID',
  'Owner:',
  'Environment:',
  'Run date:',
  'Filed by:',
  'Tested by:',
  'Evidence attached:',
];

export function parse(raw: string): Sections | null {
  const lines = raw.replace(/\r/g, '').split('\n');
  const meta: Array<{ label: string; value: string }> = [];
  const summaryLines: string[] = [];
  const blocks: Record<string, string[]> = {};
  let current: string | null = null;
  let seenAnchor = false;
  let responseLabel = '';

  for (const line of lines) {
    const metaKey = Object.keys(META_LINE).find((k) => line.startsWith(k));
    if (metaKey && !seenAnchor) {
      meta.push({ label: META_LINE[metaKey], value: line.slice(metaKey.length).trim() });
      continue;
    }
    const anchor = BLOCK_ANCHORS.find((blockAnchor) => line.trim() === blockAnchor || line.startsWith(blockAnchor));
    if (anchor) {
      seenAnchor = true;
      current = anchor;
      blocks[anchor] = [];
      let inline = line.slice(line.indexOf(anchor) + anchor.length).trim();
      if (!anchor.endsWith(':')) {
        if (anchor === 'Response body') responseLabel = /\((HTTP [^)]*)\)/.exec(inline)?.[1] ?? '';
        inline = inline.includes(':') ? inline.slice(inline.indexOf(':') + 1).trim() : '';
      }
      if (inline) blocks[anchor].push(inline);
      continue;
    }
    if (current) blocks[current].push(line);
    else if (seenAnchor) continue;
    else summaryLines.push(line);
  }

  const get = (value: string) => (blocks[value] ?? []).join('\n').trim();
  const sections: Sections = {
    meta,
    summary: [summaryLines.join('\n').trim(), get('Summary:')].filter(Boolean).join('\n\n'),
    whatThisMeans: get('What this means:'),
    whyItMatters: get('Why it matters:'),
    howToFix: get('How to fix:'),
    expected: get('Expected:'),
    actual: get('Actual:'),
    repro: get('Repro:') || get('Reproduce with Playwright:'),
    curl: get('curl:'),
    preconditions: get('Preconditions:'),
    steps: get('Steps to reproduce:'),
    responseBody: get('Response body'),
    responseLabel,
  };

  if (meta.length === 0 && !sections.expected && !sections.actual && !sections.curl) return null;
  return sections;
}

type CopyState = 'idle' | 'copied' | 'failed';

function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  async function onCopy() {
    const ok = await copyText(text);
    setState(ok ? 'copied' : 'failed');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), ok ? 1500 : 5000);
  }

  const label = state === 'copied' ? 'Copied' : state === 'failed' ? 'Select the text and press Ctrl+C' : 'Copy';

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-live="polite"
      title={state === 'failed' ? 'Your browser blocks clipboard access on this page' : undefined}
      className={`focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-white/5 ${
        state === 'failed' ? 'text-amber-300 hover:text-amber-200' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {state === 'copied' ? (
        <Check className="h-3.5 w-3.5" aria-hidden />
      ) : state === 'failed' ? (
        <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden />
      )}
      {label}
    </button>
  );
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-slate-900/60">
      <div className="flex items-center justify-between border-b border-white/10 bg-slate-800 px-3 py-1.5">
        <span className="font-mono text-xs font-medium text-slate-300">{title}</span>
        <CopyButton text={code} />
      </div>
      <pre className="max-h-80 max-w-full overflow-auto whitespace-pre bg-slate-900 p-4 font-mono text-[0.8333rem] leading-relaxed text-slate-100">
        {code}
      </pre>
    </div>
  );
}

export function DescriptionReport({ description }: { description: string }) {
  const parsed = parse(description);

  if (!parsed) {
    return (
      <pre className="max-w-full whitespace-pre-wrap rounded-xl bg-slate-50 p-4 font-mono text-[0.8333rem] leading-relaxed text-slate-800 ring-1 ring-inset ring-slate-200 [overflow-wrap:anywhere]">
        <Linkify text={description} />
      </pre>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {parsed.meta.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-10 gap-y-5 rounded-xl bg-slate-50 p-5 ring-1 ring-inset ring-slate-200 sm:grid-cols-2">
          {parsed.meta.map((meta) => (
            <div key={meta.label} className="flex flex-col gap-1">
              <dt className="text-[0.7333rem] font-semibold uppercase tracking-wider text-slate-500">{meta.label}</dt>
              <dd className="break-words font-mono text-[0.9rem] text-slate-800">{meta.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {parsed.summary && <p className="text-[0.9667rem] leading-7 text-slate-700">{parsed.summary}</p>}

      {parsed.preconditions && (
        <p className="text-[0.9rem] leading-6 text-slate-600">
          <span className="font-semibold text-slate-800">Preconditions. </span>
          {parsed.preconditions}
        </p>
      )}

      {(parsed.whatThisMeans || parsed.whyItMatters || parsed.howToFix) && (
        <div className="flex flex-col gap-3 rounded-xl bg-sky-50/70 p-5 ring-1 ring-inset ring-sky-600/20">
          <p className="text-[0.7333rem] font-semibold uppercase tracking-wide text-sky-700">For the developer</p>
          {parsed.whatThisMeans && (
            <p className="text-[0.9333rem] leading-7 text-slate-700">
              <span className="font-semibold text-slate-900">What this means. </span>
              {parsed.whatThisMeans}
            </p>
          )}
          {parsed.whyItMatters && (
            <p className="text-[0.9333rem] leading-7 text-slate-700">
              <span className="font-semibold text-slate-900">Why it matters. </span>
              {parsed.whyItMatters}
            </p>
          )}
          {parsed.howToFix && (
            <p className="rounded-lg bg-white/80 p-3 text-[0.9333rem] leading-7 text-slate-800 ring-1 ring-inset ring-sky-600/20">
              <span className="font-semibold text-sky-800">How to fix. </span>
              {parsed.howToFix}
            </p>
          )}
        </div>
      )}

      {(parsed.expected || parsed.actual) && (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
          {parsed.expected && (
            <div className="flex flex-col rounded-xl bg-emerald-50/70 p-5 ring-1 ring-inset ring-emerald-600/20">
              <p className="mb-2 flex items-center gap-1.5 text-[0.7333rem] font-semibold uppercase tracking-wide text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Expected
              </p>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[0.8667rem] leading-relaxed text-emerald-900">
                <Linkify text={parsed.expected} />
              </pre>
            </div>
          )}
          {parsed.actual && (
            <div className="flex flex-col rounded-xl bg-rose-50/70 p-5 ring-1 ring-inset ring-rose-600/20">
              <p className="mb-2 flex items-center gap-1.5 text-[0.7333rem] font-semibold uppercase tracking-wide text-rose-700">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> Actual
              </p>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[0.8667rem] leading-relaxed text-rose-900">
                <Linkify text={parsed.actual} />
              </pre>
            </div>
          )}
        </div>
      )}

      {parsed.steps.trim() === '(not given)' ? (
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-600/20">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          <span>
            <strong className="font-semibold">No steps given.</strong> The reporter did not list how to reproduce this.
            If it cannot be reproduced from the summary, ask them in a comment.
          </span>
        </div>
      ) : (
        parsed.steps && (
          <div className="flex flex-col gap-2">
            <p className="text-[0.7333rem] font-semibold uppercase tracking-wide text-slate-500">Steps to reproduce</p>
            <pre className="whitespace-pre-wrap break-words rounded-xl bg-white/70 p-4 font-sans text-[0.9333rem] leading-7 text-slate-800 ring-1 ring-inset ring-slate-200">
              <Linkify text={parsed.steps} />
            </pre>
          </div>
        )
      )}

      {(parsed.curl || parsed.repro || parsed.responseBody) && (
        <div className="flex flex-col gap-3">
          <p className="text-[0.7333rem] font-semibold uppercase tracking-wide text-slate-500">Reproduce</p>
          {parsed.curl && <CodeBlock title="curl" code={parsed.curl} />}
          {parsed.responseBody && (
            <CodeBlock
              title={parsed.responseLabel ? `Response body (${parsed.responseLabel})` : 'Response body'}
              code={parsed.responseBody}
            />
          )}
          {parsed.repro && <CodeBlock title="Playwright" code={parsed.repro} />}
        </div>
      )}

      <details className="group rounded-xl border border-hairline bg-white">
        <summary className="focus-ring flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-900">
          <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" aria-hidden />
          Full original description
        </summary>
        <pre className="max-w-full whitespace-pre-wrap border-t border-hairline px-4 py-3.5 font-mono text-[0.8333rem] leading-relaxed text-slate-700 [overflow-wrap:anywhere]">
          <Linkify text={description} />
        </pre>
      </details>
    </div>
  );
}
