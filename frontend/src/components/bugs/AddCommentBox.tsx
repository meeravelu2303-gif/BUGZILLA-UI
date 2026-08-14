import { Send } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import { useAddComment } from '../../api/hooks';
import { useToast } from '../../context/ToastContext';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Field';

export function AddCommentBox({ bugId }: { bugId: number }) {
  const [text, setText] = useState('');
  const addComment = useAddComment(bugId);
  const { toast } = useToast();

  async function onSubmit() {
    if (!text.trim()) return;
    try {
      await addComment.mutateAsync({ comment: text.trim() });
      setText('');
      toast({ variant: 'success', title: 'Comment added' });
    } catch (err) {
      toast({
        variant: 'error',
        title: 'Could not add comment',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  }

  return (
    <div className="border-t border-white/30 px-5 py-4">
      <Textarea
        aria-label="Add a comment"
        placeholder="Leave a comment…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
      />
      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={onSubmit} loading={addComment.isPending} disabled={!text.trim()}>
          <Send className="h-3.5 w-3.5" /> Comment
        </Button>
      </div>
    </div>
  );
}
