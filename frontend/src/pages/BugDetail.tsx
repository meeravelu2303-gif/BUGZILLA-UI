import { AlertCircle, ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useBug, useMeta, useProducts } from '../api/hooks';
import { AddCommentBox } from '../components/bugs/AddCommentBox';
import { AttachmentList } from '../components/bugs/AttachmentList';
import { CommentThread } from '../components/bugs/CommentThread';
import { MetadataSidebar } from '../components/bugs/MetadataSidebar';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { PriorityPill, SeverityPill, StatusPill } from '../components/ui/Pill';
import { Skeleton } from '../components/ui/Skeleton';

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

  return (
    <div className="mx-auto max-w-[1200px] px-8 py-8">
      <Link to="/bugs" className="focus-ring inline-flex items-center gap-1.5 rounded text-sm text-slate-600 hover:text-slate-700">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to bugs
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-sm text-slate-600">
            #{bug.id} · {bug.product} / {bug.component}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{bug.summary}</h1>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={bug.status} />
          <SeverityPill severity={bug.severity} />
          <PriorityPill priority={bug.priority} />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardBody>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{bug.description || 'No description provided.'}</p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Comments ({comments.filter((c) => c.count > 0).length})</CardTitle>
            </CardHeader>
            <CommentThread comments={comments} />
            <AddCommentBox bugId={bug.id} />
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Attachments ({attachments.length})</CardTitle>
            </CardHeader>
            <AttachmentList bugId={bug.id} attachments={attachments} />
          </Card>
        </div>

        <div>
          <MetadataSidebar bug={bug} meta={meta} product={product} />
        </div>
      </div>
    </div>
  );
}
