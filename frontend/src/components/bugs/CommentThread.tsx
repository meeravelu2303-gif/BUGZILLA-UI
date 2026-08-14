import type { Comment } from '../../types';
import { formatDateTime } from '../../lib/utils';
import { Avatar } from '../ui/Avatar';

export function CommentThread({ comments }: { comments: Comment[] }) {
  const followUps = comments.filter((c) => c.count > 0);

  if (followUps.length === 0) {
    return <p className="px-5 py-6 text-center text-sm text-slate-600">No comments yet. Be the first to add one.</p>;
  }

  return (
    <ol className="flex flex-col gap-4 px-5 py-4">
      {followUps.map((comment) => (
        <li key={comment.id} className="flex gap-3">
          <Avatar name={comment.author} size="md" />
          <div className="min-w-0 flex-1 rounded-xl border border-white/50 bg-white/50">
            <div className="flex items-center justify-between gap-3 border-b border-white/40 bg-white/40 px-4 py-2 rounded-t-xl">
              <span className="text-sm font-medium text-slate-900">{comment.author}</span>
              <time dateTime={comment.creationTime} className="text-xs text-slate-600">
                {formatDateTime(comment.creationTime)}
              </time>
            </div>
            <p className="whitespace-pre-wrap px-4 py-3 text-sm text-slate-700">{comment.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
