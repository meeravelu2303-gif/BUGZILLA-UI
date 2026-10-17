import { FileArchive, FileSpreadsheet, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, buildQuery } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import type { BugQueryParams } from '../../lib/useBugFilters';
import { Button } from '../ui/Button';

/**
 * "Export to Excel" and "Evidence pack (.zip)" for any bug list.
 *
 * `params` must be the SAME filters and sort the table is showing - scope
 * included (My Bugs' tab, Advanced Search's assignee) - minus pagination. The
 * server then exports every matching bug, not just the page on screen.
 *
 * Both are built on the server as background jobs: this polls the job, shows a
 * real progress bar (phase, count, overall %), and Cancel stops the build on the
 * server before its next Bugzilla call. When the file is ready the browser
 * downloads it with its size known, so its own download bar shows the transfer.
 */
type Kind = 'xlsx' | 'zip';

interface JobStatus {
  kind: Kind;
  status: 'preparing' | 'ready' | 'failed' | 'cancelled';
  phase: string;
  done: number;
  total: number;
  percent: number;
  rows: number | null;
  sizeBytes: number | null;
  error: string | null;
}

interface RunState {
  jobId: string | null;
  status: JobStatus | null;
  startedAt: number;
}

const START_PATH: Record<Kind, string> = { xlsx: '/bugs/export/jobs', zip: '/bugs/export-pack/jobs' };
const LABEL: Record<Kind, string> = { xlsx: 'Excel export', zip: 'Evidence pack' };
const POLL_MS: Record<Kind, number> = { xlsx: 700, zip: 1500 };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function elapsed(since: number): string {
  const s = Math.max(0, Math.round((Date.now() - since) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

function useExportJob(kind: Kind, params: BugQueryParams) {
  const { toast } = useToast();
  const [run, setRun] = useState<RunState | null>(null);
  const cancelled = useRef(false);
  const active = useRef<string | null>(null);
  const [, forceTick] = useState(0);

  // Re-render once a second so "elapsed" keeps counting between polls.
  useEffect(() => {
    if (!run) return;
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [run]);

  // Leaving the page mid-build cancels it on the server instead of finishing a file nobody collects.
  useEffect(
    () => () => {
      if (active.current) void api.delete(`/bugs/export-pack/jobs/${active.current}`).catch(() => undefined);
    },
    []
  );

  const start = useCallback(async () => {
    cancelled.current = false;
    const startedAt = Date.now();
    setRun({ jobId: null, status: null, startedAt });
    try {
      const { jobId } = await api.post<{ jobId: string }>(`${START_PATH[kind]}${buildQuery(params)}`);
      active.current = jobId;
      setRun({ jobId, status: null, startedAt });

      for (;;) {
        await sleep(POLL_MS[kind]);
        if (cancelled.current) return;
        const job = await api.get<JobStatus>(`/bugs/export-pack/jobs/${jobId}`);
        if (cancelled.current) return;
        setRun({ jobId, status: job, startedAt });

        if (job.status === 'cancelled') return;
        if (job.status === 'failed') throw new Error(job.error ?? `The ${LABEL[kind].toLowerCase()} could not be built.`);
        if (job.status !== 'ready') continue;

        active.current = null;
        const link = document.createElement('a');
        link.href = `/api/bugs/export-pack/jobs/${jobId}/download`;
        link.download = '';
        document.body.appendChild(link);
        link.click();
        link.remove();
        const size = job.sizeBytes ? `${(job.sizeBytes / 1024 / 1024).toFixed(job.sizeBytes > 10 * 1024 * 1024 ? 0 : 1)} MB` : '';
        toast({
          variant: 'success',
          title: kind === 'xlsx' ? `Exported ${job.rows ?? job.total} bug${(job.rows ?? job.total) === 1 ? '' : 's'}` : 'Evidence pack ready - downloading',
          description: [size, `built in ${elapsed(startedAt)}`].filter(Boolean).join(' · '),
        });
        return;
      }
    } catch (err) {
      if (!cancelled.current) {
        toast({
          variant: 'error',
          title: `${LABEL[kind]} failed`,
          description: err instanceof ApiError || err instanceof Error ? err.message : 'Please try again.',
        });
      }
    } finally {
      active.current = null;
      setRun(null);
    }
  }, [kind, params, toast]);

  const cancel = useCallback(async () => {
    cancelled.current = true;
    const jobId = active.current;
    active.current = null;
    setRun(null);
    if (jobId) await api.delete(`/bugs/export-pack/jobs/${jobId}`).catch(() => undefined);
    toast({ variant: 'info', title: `${LABEL[kind]} cancelled`, description: 'Nothing was downloaded.' });
  }, [kind, toast]);

  return { run, start, cancel };
}

function ProgressPanel({ kind, run, onCancel }: { kind: Kind; run: RunState; onCancel: () => void }) {
  const s = run.status;
  const percent = s?.percent ?? 0;
  const indeterminate = !s || (s.percent === 0 && s.total === 0);
  const tone = kind === 'xlsx' ? 'bg-emerald-600' : 'bg-sky-600';

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute right-0 top-full z-30 mt-2 w-80 glass-raised rounded-2xl p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Loader2 className="h-4 w-4 animate-spin text-slate-500" aria-hidden />
            {kind === 'xlsx' ? 'Exporting to Excel' : 'Building evidence pack'}
          </p>
          <p className="mt-1 truncate text-xs text-slate-600" title={s?.phase}>
            {s?.phase ?? 'Starting…'}
            {s && s.total > 0 && s.status === 'preparing' && (
              <span className="tabular-nums"> · {s.done.toLocaleString()} of {s.total.toLocaleString()}</span>
            )}
          </p>
        </div>
        <span className="shrink-0 text-lg font-semibold tabular-nums text-slate-900">{indeterminate ? '' : `${percent}%`}</span>
      </div>

      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200/80"
        role="progressbar"
        aria-label={`${LABEL[kind]} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : percent}
      >
        {indeterminate ? (
          <div className={`h-full w-1/3 animate-indeterminate rounded-full ${tone} opacity-70`} />
        ) : (
          <div className={`h-full rounded-full ${tone} transition-[width] duration-500 ease-out`} style={{ width: `${Math.max(2, percent)}%` }} />
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs tabular-nums text-slate-500">Elapsed {elapsed(run.startedAt)}</span>
        <Button size="sm" variant="secondary" onClick={onCancel}>
          <X className="h-3.5 w-3.5" /> Cancel
        </Button>
      </div>
    </div>
  );
}

export function ExportButton({ params, count }: { params: BugQueryParams; count?: number }) {
  const sheet = useExportJob('xlsx', params);
  const pack = useExportJob('zip', params);
  const empty = count === 0;
  const running = sheet.run ?? pack.run;
  const runningKind: Kind | null = sheet.run ? 'xlsx' : pack.run ? 'zip' : null;

  // Escape cancels whichever export is running.
  useEffect(() => {
    if (!runningKind) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') void (runningKind === 'xlsx' ? sheet.cancel() : pack.cancel());
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [runningKind, sheet, pack]);

  const pct = (k: Kind) => {
    const r = k === 'xlsx' ? sheet.run : pack.run;
    return r?.status && r.status.percent > 0 ? ` ${r.status.percent}%` : '…';
  };

  return (
    <div className="relative flex items-center gap-2">
      <Button
        variant="secondary"
        onClick={sheet.start}
        // Nothing to export is a disabled control, not a download of an empty sheet.
        disabled={empty || running !== null}
        title={empty ? 'No bugs match these filters' : 'Download every bug matching these filters as an Excel file'}
      >
        {sheet.run ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileSpreadsheet className="h-4 w-4 text-emerald-600" aria-hidden />}
        {sheet.run ? `Exporting${pct('xlsx')}` : 'Export to Excel'}
      </Button>
      <Button
        variant="secondary"
        onClick={pack.start}
        disabled={empty || running !== null}
        title={empty ? 'No bugs match these filters' : 'Download a .zip: the Excel plus every screenshot, video and evidence file, one folder per bug'}
      >
        {pack.run ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileArchive className="h-4 w-4 text-sky-600" aria-hidden />}
        {pack.run ? `Packing${pct('zip')}` : 'Evidence pack (.zip)'}
      </Button>

      {running && runningKind && (
        <ProgressPanel kind={runningKind} run={running} onCancel={() => void (runningKind === 'xlsx' ? sheet.cancel() : pack.cancel())} />
      )}
    </div>
  );
}
