import { FileArchive, FileSpreadsheet } from 'lucide-react';
import { useState } from 'react';
import { api, buildQuery, downloadFile } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import type { BugQueryParams } from '../../lib/useBugFilters';
import { Button } from '../ui/Button';

/**
 * "Export to Excel" for any bug list.
 *
 * `params` must be the SAME filters and sort the table is showing - scope
 * included (My Bugs' tab, Advanced Search's assignee) - minus pagination. The
 * server then exports every matching bug, not just the page on screen.
 */
interface PackProgress {
  phase: string;
  done: number;
  total: number;
}

interface PackStatus extends PackProgress {
  status: 'preparing' | 'ready' | 'failed';
  sizeBytes: number | null;
  error: string | null;
}

export function ExportButton({ params, count }: { params: BugQueryParams; count?: number }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [pack, setPack] = useState<PackProgress | null>(null);

  async function onExport() {
    setBusy(true);
    try {
      const { blob, filename, rows } = await downloadFile(`/bugs/export${buildQuery(params)}`);

      /*
       * An object URL plus a synthetic click is what actually saves the file.
       * The anchor is attached before clicking because Firefox ignores clicks
       * on detached elements, and the URL is revoked on the next tick - revoking
       * synchronously can cancel the download before the browser has read it.
       */
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename ?? 'bugs.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);

      const n = rows ?? count;
      toast({
        variant: 'success',
        title: n === undefined ? 'Export ready' : `Exported ${n} bug${n === 1 ? '' : 's'}`,
        description: filename ?? undefined,
      });
    } catch (err) {
      toast({
        variant: 'error',
        title: 'Export failed',
        description: err instanceof Error ? err.message : 'The spreadsheet could not be created.',
      });
    } finally {
      setBusy(false);
    }
  }

  /*
   * The evidence pack (Excel + every screenshot, video and evidence file, one folder per bug) can be
   * hundreds of MB, so it is NOT fetched into memory like the sheet: a plain link lets the browser
   * stream it straight to disk. The session cookie rides along because /api is same-origin.
   */
  /*
   * The evidence pack is built on the server first (it collects every screenshot, video and evidence
   * file from Bugzilla), so this shows that progress live on the button. Once it is ready, the browser
   * downloads the finished file - with its size known, so the browser's own download bar shows % and
   * time left. Streaming it straight out meant minutes of nothing and then no percentage.
   */
  async function onEvidencePack() {
    setPack({ phase: 'Starting', done: 0, total: 0 });
    try {
      const { jobId } = await api.post<{ jobId: string }>(`/bugs/export-pack/jobs${buildQuery(params)}`);
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const job = await api.get<PackStatus>(`/bugs/export-pack/jobs/${jobId}`);
        if (job.status === 'failed') throw new Error(job.error ?? 'The evidence pack could not be built.');
        setPack({ phase: job.phase, done: job.done, total: job.total });
        if (job.status !== 'ready') continue;

        const link = document.createElement('a');
        link.href = `/api/bugs/export-pack/jobs/${jobId}/download`;
        link.download = '';
        document.body.appendChild(link);
        link.click();
        link.remove();
        toast({
          variant: 'success',
          title: 'Evidence pack ready - downloading',
          description: job.sizeBytes
            ? `${(job.sizeBytes / 1024 / 1024).toFixed(0)} MB. Your browser's download bar shows the progress.`
            : "Your browser's download bar shows the progress.",
        });
        return;
      }
    } catch (err) {
      toast({
        variant: 'error',
        title: 'Evidence pack failed',
        description: err instanceof Error ? err.message : 'The evidence pack could not be built.',
      });
    } finally {
      setPack(null);
    }
  }

  const empty = count === 0;

  return (
    <>
      <Button
        variant="secondary"
        onClick={onExport}
        loading={busy}
        // Nothing to export is a disabled control, not a download of an empty sheet.
        disabled={empty}
        title={empty ? 'No bugs match these filters' : 'Download every bug matching these filters as an Excel file'}
      >
        {!busy && <FileSpreadsheet className="h-4 w-4 text-emerald-600" aria-hidden />}
        {busy ? 'Preparing…' : 'Export to Excel'}
      </Button>
      <Button
        variant="secondary"
        onClick={onEvidencePack}
        loading={pack !== null && pack.total === 0}
        disabled={empty || pack !== null}
        title={
          empty
            ? 'No bugs match these filters'
            : 'Download a .zip: the Excel plus every screenshot, video and evidence file, one folder per bug'
        }
      >
        {pack === null ? (
          <>
            <FileArchive className="h-4 w-4 text-sky-600" aria-hidden />
            Evidence pack (.zip)
          </>
        ) : (
          <span className="flex items-center gap-2" aria-live="polite">
            <span>{pack.total > 0 ? `${pack.phase}: ${pack.done} of ${pack.total}` : `${pack.phase}…`}</span>
            {pack.total > 0 && (
              <span className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200" aria-hidden>
                <span
                  className="block h-full rounded-full bg-sky-600 transition-all"
                  style={{ width: `${Math.round((pack.done / pack.total) * 100)}%` }}
                />
              </span>
            )}
          </span>
        )}
      </Button>
    </>
  );
}
