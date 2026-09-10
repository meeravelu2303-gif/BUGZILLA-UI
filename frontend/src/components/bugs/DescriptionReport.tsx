import { Check, Copy, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { copyText } from '../../lib/clipboard';

/**
 * Renders the bench's structured defect description as clean, labelled sections instead of one
 * raw monospace dump: a metadata grid, the narrative, an Expected-vs-Actual contrast, and the
 * reproduction commands as copyable code blocks.
 *
 * The bench writes a stable, line-anchored format (`Classification:` … `Expected:` … `Actual:`
 * … `curl:` …). This parses by those anchors; if the shape is ever unrecognised it falls back
 * to the raw text, so a format change degrades gracefully rather than dropping content.
 */

interface Sections {
  meta: Array<{ label: string; value: string }>;
  summary: string;
  expected: string;
  actual: string;
  repro: string;
  curl: string;
}

const META_LINE: Record<string, string> = {
  'Classification:': 'Classification',
  'Category:': 'Category',
  'Representative endpoint:': 'Endpoint',
  'Endpoint:': 'Endpoint',
  'Module:': 'Module',
};

/** Ordered anchors that begin a multi-line block; text runs until the next anchor. */
const BLOCK_ANCHORS = ['Expected:', 'Actual:', 'Repro:', 'Reproduce with Playwright:', 'curl:', 'Owner:', 'Environment:', 'Run date:'];

function parse(raw: string): Sections | null {
  const lines = raw.replace(/\r/g, '').split('\n');
  const meta: Array<{ label: string; value: string }> = [];
  const summaryLines: string[] = [];
  const blocks: Record<string, string[]> = {};
  let current: string | null = null;
  let seenAnchor = false;

  for (const line of lines) {
    const metaKey = Object.keys(META_LINE).find((k) => line.startsWith(k));
    if (metaKey && !seenAnchor) {
      meta.push({ label: META_LINE[metaKey], value: line.slice(metaKey.length).trim() });
      continue;
    }
    const anchor = BLOCK_ANCHORS.find((a) => line.trim() === a || line.startsWith(a));
    if (anchor) {
      seenAnchor = true;
      current = anchor;
      blocks[anchor] = [];
      const inline = line.slice(line.indexOf(anchor) + anchor.length).trim();
      if (inline) blocks[anchor].push(inline);
      continue;
    }
    if (current) blocks[current].push(line);
    else if (seenAnchor) continue;
    else summaryLines.push(line);
  }

  const get = (a: string) => (blocks[a] ?? []).join('\n').trim();
  const sections: Sections = {
    meta,
    summary: summaryLines.join('\n').trim(),
    expected: get('Expected:'),
    actual: get('Actual:'),
    repro: get('Repro:') || get('Reproduce with Playwright:'),
    curl: get('curl:'),
  };

  // If we recognised essentially nothing, signal a fallback to raw.
  if (meta.length === 0 && !sections.expected && !sections.actual && !sections.curl) return null;
  return sections;
}

type CopyState = 'idle' | 'copied' | 'failed';

function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>();

  // Clear the reset timer on unmount. Navigating away from a bug within the
  // hold window would otherwise fire setState on a component that is gone.
  useEffect(() => () => clearTimeout(timer.current), []);

  async function onCopy() {
    /*
     * Awaited, and the result actually used. The old version fired the write
     * and reported "Copied" regardless - so on an insecure origin, where
     * `navigator.clipboard` does not exist at all, it claimed success while
     * copying nothing. See lib/clipboard.ts.
     */
    const ok = await copyText(text);
    setState(ok ? 'copied' : 'failed');
    clearTimeout(timer.current);
    // A failure needs longer on screen than a success: it asks the reader to do
    // something, rather than just confirming what already happened.
    timer.current = setTimeout(() => setState('idle'), ok ? 1500 : 5000);
  }

  const label =
    state === 'copied' ? 'Copied' : state === 'failed' ? 'Select the text and press Ctrl+C' : 'Copy';

  return (
    <button
      type="button"
      onClick={onCopy}
      // Announced, not just coloured - the label changes in place, so a screen
      // reader needs to be told the region updated.
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
      {/* Fixed viewport: long commands scroll inside the block instead of stretching the page. */}
      <pre className="max-h-80 max-w-full overflow-auto whitespace-pre bg-slate-900 p-4 font-mono text-[12.5px] leading-relaxed text-slate-100">
        {code}
      </pre>
    </div>
  );
}

export function DescriptionReport({ description }: { description: string }) {
  const parsed = parse(description);

  if (!parsed) {
    return (
      <pre className="max-w-full whitespace-pre-wrap break-all rounded-xl bg-slate-50 p-4 font-mono text-[12.5px] leading-relaxed text-slate-800 ring-1 ring-inset ring-slate-200">
        {description}
      </pre>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {parsed.meta.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-10 gap-y-5 rounded-xl bg-slate-50 p-5 ring-1 ring-inset ring-slate-200 sm:grid-cols-2">
          {parsed.meta.map((m) => (
            <div key={m.label} className="flex flex-col gap-1">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{m.label}</dt>
              <dd className="break-words font-mono text-[13.5px] text-slate-800">{m.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {parsed.summary && (
        <p className="text-[14.5px] leading-7 text-slate-700">{parsed.summary}</p>
      )}

      {(parsed.expected || parsed.actual) && (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
          {parsed.expected && (
            <div className="flex flex-col rounded-xl bg-emerald-50/70 p-5 ring-1 ring-inset ring-emerald-600/20">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Expected
              </p>
              {/* Fixed height: long values scroll inside; the panel never grows to swallow the page. */}
              <p className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-emerald-900">
                {parsed.expected}
              </p>
            </div>
          )}
          {parsed.actual && (
            <div className="flex flex-col rounded-xl bg-rose-50/70 p-5 ring-1 ring-inset ring-rose-600/20">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-700">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> Actual
              </p>
              <p className="max-h-56 overflow-y-auto whitespace-pre-wrap break-all text-[13.5px] leading-relaxed text-rose-900">
                {parsed.actual}
              </p>
            </div>
          )}
        </div>
      )}

      {(parsed.curl || parsed.repro) && (
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Reproduce</p>
          {parsed.curl && <CodeBlock title="curl" code={parsed.curl} />}
          {parsed.repro && <CodeBlock title="Playwright" code={parsed.repro} />}
        </div>
      )}
    </div>
  );
}
