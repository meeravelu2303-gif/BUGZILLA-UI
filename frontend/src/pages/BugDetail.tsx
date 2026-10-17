import { AlertCircle, ArchiveRestore, ArrowLeft, ImagePlus, Layers, Pencil, Trash2, User } from 'lucide-react';
import { AttachmentUploader } from '../components/bugs/AttachmentUploader';
import { ReportEditor } from '../components/bugs/ReportEditor';
import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useBug, useMe, useMeta, useProducts, useRestoreBugs, useUpdateBug } from '../api/hooks';
import { DeleteBugsDialog } from '../components/bugs/DeleteBugsDialog';
import { Button } from '../components/ui/Button';
import { EditableSummary } from '../components/bugs/edit/EditableSummary';
import { SaveBar } from '../components/bugs/edit/SaveBar';
import { useToast } from '../context/ToastContext';
import { useBugEditor } from '../lib/useBugEditor';
import type { BugChanges, BugDetailResponse, BugMeta, Product } from '../types';
import { AddCommentBox } from '../components/bugs/AddCommentBox';
import { AttachmentList } from '../components/bugs/AttachmentList';
import { CommentThread } from '../components/bugs/CommentThread';
import { MetadataSidebar } from '../components/bugs/MetadataSidebar';
import { DescriptionReport } from '../components/bugs/DescriptionReport';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { CategoryPill, PriorityPill, SeverityPill, StatusPill } from '../components/ui/Pill';
import { Skeleton } from '../components/ui/Skeleton';
import { lastListLabel, lastListView } from '../lib/lastListView';
import { bugDisplayId, formatDateTime } from '../lib/utils';

export function BugDetail() {
  const { id } = useParams<{ id: string }>();
  const bugId = Number(id);
  const { data, isLoading, isError, error, refetch } = useBug(bugId);
  const { data: meta } = useMeta();
  const { data: productsData } = useProducts();
  const { data: me } = useMe();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1600px] animate-page-in px-4 py-6 sm:px-6 lg:px-8">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="mt-4 h-8 w-2/3" />
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          <Skeleton className="h-64" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    const message = error instanceof ApiError ? error.message : 'Something went wrong loading this bug.';
    return (
      <div className="mx-auto max-w-[1600px] animate-page-in px-4 py-6 sm:px-6 lg:px-8">
        <EmptyState icon={AlertCircle} title="Couldn't load this bug" description={message} />
      </div>
    );
  }

  return (
    <BugDetailView
      data={data}
      meta={meta}
      products={productsData?.products}
      currentUser={me?.user.email}
      canTriage={me?.user.permissions.canTriage ?? false}
      onReload={() => refetch()}
    />
  );
}

/** Bugzilla field names (as returned in `changes`) -> the labels this UI uses. */
const CHANGE_LABELS: Record<string, string> = {
  summary: 'Summary', status: 'Status', resolution: 'Resolution', priority: 'Priority', severity: 'Severity',
  product: 'Product', component: 'Component', version: 'Version', target_milestone: 'Milestone', op_sys: 'OS',
  platform: 'Platform', assigned_to: 'Assignee', qa_contact: 'QA contact', cc: 'CC', depends_on: 'Depends on',
  blocks: 'Blocks', see_also: 'See also', url: 'URL', alias: 'Alias', keywords: 'Keywords', groups: 'Visibility',
  deadline: 'Deadline', estimated_time: 'Estimate', remaining_time: 'Remaining', work_time: 'Hours worked',
  is_cc_accessible: 'CC access', is_creator_accessible: 'Reporter access', whiteboard: 'Whiteboard', dupe_of: 'Duplicate of',
  flagtypes: 'Flags',
};

function describeChanges(changes: BugChanges): string {
  const parts = Object.entries(changes).map(([field, c]) => {
    const label = CHANGE_LABELS[field] ?? field.replace(/_/g, ' ');
    const short = (s: string) => (s.length > 28 ? `${s.slice(0, 27)}…` : s);
    if (c.added && c.removed) return `${label}: ${short(c.removed)} → ${short(c.added)}`;
    if (c.added) return `${label}: +${short(c.added)}`;
    return `${label}: −${short(c.removed)}`;
  });
  return parts.length > 4 ? `${parts.slice(0, 4).join(' · ')} · and ${parts.length - 4} more` : parts.join(' · ');
}

function BugDetailView({
  data,
  meta,
  products,
  currentUser,
  canTriage,
  onReload,
}: {
  data: BugDetailResponse;
  meta?: BugMeta;
  products?: Product[];
  currentUser?: string;
  canTriage: boolean;
  onReload: () => Promise<unknown>;
}) {
  const { bug, comments, attachments } = data;
  const editor = useBugEditor(bug, meta, products, canTriage);
  const updateBug = useUpdateBug(bug.id);
  const restore = useRestoreBugs();
  const { toast } = useToast();
  const [conflict, setConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingReport, setEditingReport] = useState(false);
  const [addingFiles, setAddingFiles] = useState(false);
  const isDeleted = Boolean(bug.isDeleted);

  async function onRestore() {
    try {
      await restore.mutateAsync({ ids: [bug.id] });
      toast({ variant: 'success', title: `Restored ${bugDisplayId(bug)}`, description: 'It is back in every list, as it was before deletion.' });
    } catch (err) {
      toast({ variant: 'error', title: 'Could not restore', description: err instanceof ApiError ? err.message : 'Please try again.' });
    }
  }

  const onSave = useCallback(async () => {
    try {
      const { changes } = await updateBug.mutateAsync(editor.buildPayload());
      editor.markSaved();
      setConflict(false);
      const count = Object.keys(changes).length;
      toast({
        variant: 'success',
        title: count ? 'Bug updated' : 'Saved',
        description: count ? describeChanges(changes) : 'Bugzilla already had these values - nothing changed.',
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CONFLICT' && err.details?.reason === 'MID_AIR_COLLISION') {
        setConflict(true);
        return;
      }
      toast({ variant: 'error', title: 'Update failed', description: err instanceof ApiError ? err.message : 'Please try again.' });
    }
  }, [editor, updateBug, toast]);

  async function reloadLatest() {
    await onReload();
    setConflict(false);
    toast({ variant: 'info', title: 'Loaded the latest version', description: 'Your edits were kept. Review them, then save.' });
  }

  // Read once per render, before any navigation away, so the link always points at the list the
  // reader actually arrived from.
  const backTo = lastListView();
  const backLabel = lastListLabel();
  const triage = bug.triage;
  const grouping = bug.grouping;
  const facts = bug.facts;

  return (
    <div className="mx-auto max-w-[1600px] animate-page-in overflow-x-clip px-4 py-6 sm:px-6 lg:px-8">
      {/* Returns to the list the reader came from, filters, sort and page intact. Resolved at
          render rather than held in state: this page is reached from BugList, MyBugs, Advanced
          Search and the dashboard matrix, and a plain `/bugs` discarded the filtering that found
          the bug in the first place. Falls back to `/bugs` on a deep link or a fresh tab. */}
      <Link to={backTo} className="focus-ring inline-flex items-center gap-1.5 rounded text-sm font-medium text-slate-500 transition-colors hover:text-slate-800">
        <ArrowLeft className="h-3.5 w-3.5" /> {backLabel}
      </Link>

      {isDeleted && (
        <div role="status" className="mt-4 flex flex-wrap items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-900">
          <Trash2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">This bug is deleted.</p>
            <p className="mt-0.5 text-rose-800">
              {bug.deleted ? (
                <>
                  Deleted by {bug.deleted.deletedBy} on {formatDateTime(bug.deleted.deletedAt)}
                  {bug.deleted.reason && <> - “{bug.deleted.reason}”</>}. Only testers and admins can see it.
                </>
              ) : (
                'Only testers and admins can see it.'
              )}{' '}
              It can't be edited until it is restored.
            </p>
          </div>
          {canTriage && (
            <Button size="sm" variant="secondary" onClick={onRestore} loading={restore.isPending}>
              <ArchiveRestore className="h-3.5 w-3.5" /> Restore
            </Button>
          )}
        </div>
      )}

      {/* Classification leads: what kind of defect this is, and how urgent. An elevated hero
          so the id, title and the severity/category pills read as one clear header. */}
      <header className="glass-surface relative mt-4 overflow-hidden rounded-2xl p-6">
        <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-500 via-ueducate-accent to-brand-700" />
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="rounded-md bg-slate-900/[0.04] px-2 py-0.5 font-mono font-semibold text-slate-700 ring-1 ring-inset ring-slate-900/10" title={`Bug #${bug.id}`}>
            {bugDisplayId(bug)}
          </span>
          <span className="text-slate-400">·</span>
          <span className="font-medium text-slate-600">{bug.product}</span>
          <span className="text-slate-400">/</span>
          <span className="font-medium text-slate-600">{bug.component}</span>
          {canTriage && !isDeleted && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="focus-ring ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-700"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
            </button>
          )}
        </div>

        <EditableSummary editor={editor} readOnly={isDeleted} />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {triage && <SeverityPill severity={triage.severity} />}
          {triage && <PriorityPill priority={triage.priority} />}
          {triage && <CategoryPill category={triage.category} />}
          <StatusPill status={bug.status} />
          {triage?.classification && (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-600/20">
              {triage.classification}
            </span>
          )}
        </div>

        {facts?.owner && (
          <p className="mt-4 flex items-center gap-1.5 border-t border-slate-200/70 pt-3 text-xs text-slate-500">
            <User className="h-3.5 w-3.5" aria-hidden /> {facts.owner}
          </p>
        )}
      </header>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          {/*
           * The blast radius. This is what makes one grouped ticket worth more
           * than the many per-endpoint tickets it replaces, so it sits above the
           * reproduction detail rather than buried under it.
           */}
          {grouping?.isGrouped && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <span className="inline-flex items-center gap-2">
                    <Layers className="h-4 w-4" aria-hidden />
                    Affected scope
                  </span>
                </CardTitle>
              </CardHeader>
              <CardBody>
                <div className="mb-4 flex flex-wrap gap-6">
                  <div>
                    <p className="text-2xl font-semibold tabular-nums text-slate-900">{grouping.occurrences ?? '—'}</p>
                    <p className="text-xs text-slate-600">test cases observed this defect</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold tabular-nums text-slate-900">{grouping.endpointCount ?? '—'}</p>
                    <p className="text-xs text-slate-600">endpoints affected</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/40 text-xs uppercase tracking-wide text-slate-600">
                        <th scope="col" className="py-2 pr-3 font-medium">Method</th>
                        <th scope="col" className="py-2 pr-3 font-medium">Endpoint</th>
                        <th scope="col" className="py-2 pr-3 font-medium">Module</th>
                        <th scope="col" className="py-2 text-right font-medium">Occurrences</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grouping.affectedEndpoints.map((e) => (
                        <tr key={`${e.method} ${e.path}`} className="border-b border-white/25 last:border-0">
                          <td className="py-2 pr-3 font-mono text-xs font-semibold text-slate-900">{e.method}</td>
                          <td className="max-w-0 truncate py-2 pr-3 font-mono text-xs text-slate-700" title={e.path}>
                            {e.path}
                          </td>
                          <td className="py-2 pr-3 text-xs text-slate-600">{e.module}</td>
                          <td className="py-2 text-right font-mono text-xs tabular-nums text-slate-700">{e.occurrences}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {grouping.truncated && (
                  <p className="mt-3 text-xs text-slate-600">
                    Showing {grouping.affectedEndpoints.length} of {grouping.endpointCount}. The full list is in the attached
                    reproduction text.
                  </p>
                )}
              </CardBody>
            </Card>
          )}

          <Card className={editingReport ? 'ring-2 ring-brand-500/40' : undefined}>
            <CardHeader>
              <div className="min-w-0">
                <CardTitle>{editingReport ? 'Edit bug report' : 'Description'}</CardTitle>
                {!editingReport && bug.reportHistory && bug.reportHistory.revisions > 0 && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    Edited by {bug.reportHistory.lastEditedBy}
                    {bug.reportHistory.lastEditedAt && <> · {formatDateTime(bug.reportHistory.lastEditedAt)}</>}
                    {bug.reportHistory.revisions > 1 && <> · {bug.reportHistory.revisions} revisions</>} - earlier versions are in the comments.
                  </p>
                )}
              </div>
              {!editingReport && !isDeleted && (
                <Button size="sm" variant="secondary" onClick={() => setEditingReport(true)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit report
                </Button>
              )}
            </CardHeader>
            <CardBody>
              {editingReport ? (
                <ReportEditor bug={bug} onClose={() => setEditingReport(false)} />
              ) : (
                <DescriptionReport description={bug.description ?? ''} />
              )}
            </CardBody>
          </Card>

          {/* Always shown: a bug filed without proof is exactly the one that needs a way to add it. */}
          <Card>
            <CardHeader>
              <CardTitle>
                Attachments{attachments.length > 0 && ` (${attachments.length})`}
              </CardTitle>
              {!isDeleted && attachments.length > 0 && !addingFiles && (
                <Button size="sm" variant="secondary" onClick={() => setAddingFiles(true)}>
                  <ImagePlus className="h-3.5 w-3.5" /> Add files
                </Button>
              )}
            </CardHeader>
            {attachments.length > 0 && (
              <AttachmentList bugId={bug.id} attachments={attachments} privateAllowed={meta?.features.privateComments} />
            )}
            {!isDeleted && (attachments.length === 0 || addingFiles) && (
              <CardBody className={attachments.length > 0 ? 'border-t border-white/30' : undefined}>
                {attachments.length === 0 && (
                  <p className="mb-3 text-sm text-slate-600">No screenshots or videos yet. Add the proof a developer needs to see the problem.</p>
                )}
                <AttachmentUploader
                  bugId={bug.id}
                  maxBytes={(meta?.features.maxAttachmentKb ?? 51200) * 1024}
                  compact={attachments.length > 0}
                  onClose={attachments.length > 0 ? () => setAddingFiles(false) : undefined}
                />
              </CardBody>
            )}
            {isDeleted && attachments.length === 0 && <CardBody className="text-sm text-slate-500">No attachments.</CardBody>}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Comments</CardTitle>
            </CardHeader>
            <CardBody className="px-0 py-0">
              <CommentThread bugId={bug.id} comments={comments} tagsEnabled={meta?.features.commentTags} />
              <AddCommentBox bugId={bug.id} />
            </CardBody>
          </Card>
        </div>

        {/* A disabled fieldset turns every control inside read-only in one place. */}
        <fieldset disabled={isDeleted} className="min-w-0">
          <MetadataSidebar bug={bug} meta={meta} editor={editor} products={products} currentUser={currentUser} />
        </fieldset>
      </div>

      <DeleteBugsDialog open={confirmDelete} ids={[bug.id]} onClose={() => setConfirmDelete(false)} />

      {/* Room for the floating save bar, so it never covers the last comment. */}
      {(editor.dirty.length > 0 || conflict) && <div className="h-28" aria-hidden />}

      {!isDeleted && (
        <SaveBar
          editor={editor}
          saving={updateBug.isPending}
          conflict={conflict}
          onSave={onSave}
          onReloadLatest={reloadLatest}
          privateComments={Boolean(meta?.features.privateComments)}
        />
      )}
    </div>
  );
}
