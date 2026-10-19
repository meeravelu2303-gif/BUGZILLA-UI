import { ArrowRightLeft, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { useTransferBug, useTransferOptions } from '../../api/hooks';
import { useToast } from '../../context/ToastContext';
import { bugDisplayId } from '../../lib/utils';
import { Button } from '../ui/Button';
import { RequiredMark, Select } from '../ui/Field';

/**
 * Hand a bug to another team's product - for someone who cannot open that
 * product themselves (backend lib/productTransfer.ts does the move).
 *
 * Says up front what will happen to visibility, because it is the surprising
 * part: the bug leaves this product, and the person keeps seeing it only
 * because they are added to its CC list.
 */
export function TransferBugDialog({ open, bugId, onClose, onTransferred }: { open: boolean; bugId: number; onClose: () => void; onTransferred: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const options = useTransferOptions(bugId, open);
  const transfer = useTransferBug(bugId);
  const { toast } = useToast();

  const [product, setProduct] = useState('');
  const [component, setComponent] = useState('');
  const [version, setVersion] = useState('');
  const [assignee, setAssignee] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ product?: string; component?: string; version?: string; reason?: string; form?: string }>({});

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setErrors({});
      dialog.showModal();
    } else if (!open && dialog.open) dialog.close();
  }, [open]);

  const targets = options.data?.targets ?? [];
  // One target (the usual case) is preselected - there is nothing to choose.
  useEffect(() => {
    if (targets.length === 1 && !product) setProduct(targets[0].product);
  }, [targets, product]);

  const target = useMemo(() => targets.find((t) => t.product === product), [targets, product]);
  const chosenComponent = target?.components.find((c) => c.name === component);

  function pickProduct(name: string) {
    setProduct(name);
    setErrors((s) => ({ ...s, product: undefined, form: undefined }));
    setComponent('');
    setAssignee('');
    const t = targets.find((x) => x.product === name);
    setVersion(t && t.versions.length === 1 ? t.versions[0] : '');
  }
  useEffect(() => {
    if (target && target.versions.length === 1) setVersion(target.versions[0]);
  }, [target]);

  async function submit() {
    const found: typeof errors = {};
    if (!product) found.product = 'Choose the team to send it to.';
    if (!component) found.component = 'Choose the component it belongs to there.';
    if (target && target.versions.length > 1 && !version) found.version = 'Choose a version.';
    if (reason.trim().length < 10) found.reason = 'Say why it belongs to that team - at least a short sentence.';
    setErrors(found);
    if (Object.keys(found).length) return;

    try {
      const res = await transfer.mutateAsync({
        product,
        component,
        version: version || undefined,
        assignee: assignee || undefined,
        reason: reason.trim(),
      });
      const who = target?.people.find((p) => p.email === res.assignee)?.name ?? res.assignee;
      toast({
        variant: 'success',
        title: `${bugDisplayId({ id: bugId })} transferred to ${res.product}`,
        description: `Assigned to ${who}. You are on the CC list, so you can still follow it.`,
      });
      setReason('');
      onTransferred();
      onClose();
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.message : 'Could not transfer the bug. Please try again.' });
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && !transfer.isPending && onClose()}
      aria-labelledby="transfer-title"
      className="w-[min(36rem,calc(100vw-2rem))] rounded-2xl border border-hairline bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/40 backdrop:backdrop-blur-[2px]"
    >
      <form
        method="dialog"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-4 p-6"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-600/15">
            <ArrowRightLeft className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 id="transfer-title" className="text-base font-semibold">
              Transfer {bugDisplayId({ id: bugId })} to another team
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              For a bug filed in the wrong product - e.g. a UI report whose cause is in the API. It moves to the other team's product
              and their developer is assigned. You are added to CC so you can still follow it; nothing else in their product becomes
              visible to you.
            </p>
          </div>
        </div>

        {options.isLoading && (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading teams…
          </p>
        )}
        {options.isError && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {options.error instanceof ApiError ? options.error.message : 'Could not load the teams this bug can go to.'}
          </p>
        )}
        {options.data && targets.length === 0 && (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            Bugs in {options.data.from.product} have no transfer route configured. Ask an administrator.
          </p>
        )}

        {targets.length > 0 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Send to" required value={product} onChange={(e) => pickProduct(e.target.value)} error={errors.product} placeholder={targets.length > 1 ? 'Choose a team' : undefined}>
                {targets.map((t) => (
                  <option key={t.product} value={t.product}>
                    {t.product}
                  </option>
                ))}
              </Select>
              <Select
                label="Component"
                required
                value={component}
                onChange={(e) => {
                  setComponent(e.target.value);
                  setAssignee('');
                  setErrors((s) => ({ ...s, component: undefined, form: undefined }));
                }}
                error={errors.component}
                disabled={!target}
                placeholder={target ? 'Choose a component' : 'Choose a team first'}
                hint={chosenComponent ? `Owner: ${chosenComponent.defaultAssigneeName}` : undefined}
              >
                {target?.components.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Assign to"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                disabled={!target}
                hint="Leave as the component owner unless you know who should take it."
              >
                <option value="">{chosenComponent ? `Component owner (${chosenComponent.defaultAssigneeName})` : 'Component owner'}</option>
                {target?.people.map((p) => (
                  <option key={p.email} value={p.email}>
                    {p.name}
                  </option>
                ))}
              </Select>
              {target && target.versions.length > 1 && (
                <Select
                  label="Version"
                  required
                  value={version}
                  onChange={(e) => {
                    setVersion(e.target.value);
                    setErrors((s) => ({ ...s, version: undefined }));
                  }}
                  error={errors.version}
                  placeholder="Choose a version"
                >
                  {target.versions.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </Select>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="transfer-reason" className="text-[13px] font-medium text-slate-700">
                Why it belongs to that team
                <RequiredMark />
              </label>
              <textarea
                id="transfer-reason"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (errors.reason) setErrors((s) => ({ ...s, reason: undefined }));
                }}
                rows={3}
                maxLength={2000}
                aria-required="true"
                aria-invalid={errors.reason ? true : undefined}
                placeholder="e.g. The inbox shows stale counts because GET /v2/kmail/inbox returns cached data - the UI renders what it is given."
                className={`focus-ring w-full resize-y rounded-xl border px-3 py-2 text-sm placeholder:text-slate-400 ${errors.reason ? 'border-rose-400 bg-rose-50/40' : 'border-hairline'}`}
              />
              {errors.reason ? (
                <p role="alert" className="text-xs font-medium text-rose-600">
                  {errors.reason}
                </p>
              ) : (
                <p className="text-xs text-slate-500">Posted as a comment under your name, so the receiving team knows why.</p>
              )}
            </div>
          </>
        )}

        {errors.form && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {errors.form}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={transfer.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={transfer.isPending} disabled={targets.length === 0}>
            {!transfer.isPending && <ArrowRightLeft className="h-4 w-4" />} Transfer
          </Button>
        </div>
      </form>
    </dialog>
  );
}
