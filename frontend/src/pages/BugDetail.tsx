import { AlertCircle, ArrowLeft, Layers, User } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useBug, useMeta, useProducts } from '../api/hooks';
import { AddCommentBox } from '../components/bugs/AddCommentBox';
import { AttachmentList } from '../components/bugs/AttachmentList';
import { CommentThread } from '../components/bugs/CommentThread';
import { MetadataSidebar } from '../components/bugs/MetadataSidebar';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { CategoryPill, PriorityPill, SeverityPill, StatusPill, TierPill } from '../components/ui/Pill';
import { Skeleton } from '../components/ui/Skeleton';
import { bugDisplayId } from '../lib/utils';

export function BugDetail() {
  const { id } = useParams<{ id: string }>();
  const bugId = Number(id);
  const { data, isLoading, isError, error } = useBug(bugId);
  const { data: meta } = useMeta();
  const { data: productsData } = useProducts();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1200px] px-8 py-8">
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
      <div className="mx-auto max-w-[1200px] px-8 py-8">
        <EmptyState icon={AlertCircle} title="Couldn't load this bug" description={message} />
      </div>
    );
  }

  const { bug, comments, attachments } = data;
  const product = productsData?.products.find((p) => p.name === bug.product);
  const triage = bug.triage;
  const grouping = bug.grouping;
  const facts = bug.facts;

  return (
    <div className="mx-auto max-w-[1200px] px-8 py-8">
      <Link to="/bugs" className="focus-ring inline-flex items-center gap-1.5 rounded text-sm text-slate-600 hover:text-slate-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to bugs
      </Link>

      {/* Classification leads: what kind of defect this is, and how urgent. */}
      <div className="mt-4">
        <p className="font-mono text-sm text-slate-600" title={`Bug #${bug.id}`}>
          {bugDisplayId(bug)} · {bug.product} / {bug.component}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{bug.summary}</h1>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {triage && <SeverityPill severity={triage.severity} />}
          {triage && <PriorityPill priority={triage.priority} />}
          {triage && <CategoryPill category={triage.category} />}
          {triage && <TierPill tier={triage.tier} />}
          <StatusPill status={bug.status} />
          {triage?.classification && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-600/20">
              {triage.classification}
            </span>
          )}
        </div>

        {facts?.owner && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
            <User className="h-3.5 w-3.5" aria-hidden /> {facts.owner}
          </p>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
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

          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardBody>
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-800">
                {bug.description}
              </pre>
            </CardBody>
          </Card>

          {attachments.length > 0 && <AttachmentList bugId={bug.id} attachments={attachments} />}

          <Card>
            <CardHeader>
              <CardTitle>Comments</CardTitle>
            </CardHeader>
            <CardBody>
              <CommentThread comments={comments} />
              <AddCommentBox bugId={bug.id} />
            </CardBody>
          </Card>
        </div>

        <MetadataSidebar bug={bug} meta={meta} product={product} />
      </div>
    </div>
  );
}
