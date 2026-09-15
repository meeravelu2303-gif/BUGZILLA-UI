import { FileSpreadsheet } from 'lucide-react';
import { useState } from 'react';
import { buildQuery, downloadFile } from '../../api/client';
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
export function ExportButton({ params, count }: { params: BugQueryParams; count?: number }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

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

  const empty = count === 0;

  return (
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
  );
}
