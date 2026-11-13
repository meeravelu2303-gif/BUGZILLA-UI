import { type Request } from 'express';
import type { BugzillaClient } from '../clients/bugzilla.client';
import { closedStatuses } from './bugStatus.service';
import { isReportRevision } from './reportRevision.service';
import { forbidden, conflict } from '../helpers/errors.helper';

export const DUPLICATE_RESOLUTION = 'DUPLICATE';

export async function assertReassignable(
  client: BugzillaClient,
  ids: number[],
  targetStatus?: string,
  actor?: { email: string; canReassignAny: boolean },
): Promise<void> {
  const response = await client.get<{
    bugs: {
      id: number;
      status: string;
      is_open: boolean;
      assigned_to: string;
    }[];
  }>('/bug', {
    id: ids.join(','),
    include_fields: 'id,status,is_open,assigned_to',
    limit: 0,
  });

  if (actor && !actor.canReassignAny) {
    const me = actor.email.toLowerCase();
    const notMine = response.bugs.filter((bug) => (bug.assigned_to ?? '').toLowerCase() !== me);
    if (notMine.length > 0) {
      const listed = notMine
        .slice(0, 5)
        .map((item) => `#${item.id}`)
        .join(', ');
      const rest = notMine.length > 5 ? `, and ${notMine.length - 5} more` : '';
      const subject = notMine.length === 1 ? 'that bug is' : `${notMine.length} of the selected bugs are`;

      throw forbidden(
        `Cannot reassign - ${subject} assigned to someone else: ${listed}${rest}. ` +
          `Only the current assignee, a developer or a tester can hand a bug on.`,
      );
    }
  }

  const closed = response.bugs.filter((bug) => !bug.is_open);
  if (closed.length > 0) {
    const listed = closed
      .slice(0, 5)
      .map((item) => `#${item.id} (${item.status})`)
      .join(', ');
    const rest = closed.length > 5 ? `, and ${closed.length - 5} more` : '';
    const subject = closed.length === 1 ? 'that bug is' : `${closed.length} of the selected bugs are`;

    throw conflict(
      `Cannot reassign - ${subject} already closed: ${listed}${rest}. Reopen the bug before assigning it to someone else.`,
    );
  }

  if (targetStatus && (await closedStatuses(client)).has(targetStatus)) {
    throw conflict(
      `Cannot change the assignee while closing a bug - the assignee records who fixed it. ` +
        `Save the reassignment first, then set the status to ${targetStatus}.`,
    );
  }
}

export function appOriginOf(origin: string | undefined, referer: string | undefined): string | undefined {
  for (const candidate of [origin, referer]) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin;
    } catch {}
  }
  return undefined;
}

export function canDeleteAttachment(req: Request, creator: string): boolean {
  const user = req.sessionUser!;
  return user.permissions.canManageUsers || creator.toLowerCase() === user.email.toLowerCase();
}

export function canEditComment(req: Request, comment: { author: string; count: number; text: string }): boolean {
  return (
    comment.count > 0 &&
    comment.author.toLowerCase() === req.sessionUser!.email.toLowerCase() &&
    !isReportRevision(comment.text) &&
    !comment.text.includes('[soft-delete]')
  );
}

export const actorName = (req: Request) => {
  const sessionUser = req.sessionUser!;
  return sessionUser.realName ? `${sessionUser.realName} (${sessionUser.email})` : sessionUser.email;
};
