import type { BugzillaClient } from './bugzillaClient';
import { AppError } from './errors';

/**
 * Soft delete, built from Bugzilla's own pieces (configured once by
 * ops/bugzilla/setup-soft-delete.pl):
 *
 *   - resolution DELETED closes the bug, with the reason in a comment;
 *   - the "Deleted bugs" group hides it. A bug in several groups is visible only
 *     to people in all of them, and only testers and admins are in this one, so
 *     it disappears for everyone else while staying intact and restorable.
 *
 * Nothing is removed from the database, the history records who deleted it and
 * why, and Bugzilla itself refuses the group change to anyone outside the group.
 */
export const DELETED_RESOLUTION = 'DELETED';
export const DELETED_GROUP = 'Deleted bugs';

/**
 * Written into the deletion comment so Restore can return the bug to exactly
 * where it was - a FIXED bug comes back FIXED, an in-progress one in progress -
 * rather than everything being reopened as CONFIRMED.
 */
const MARKER = /\[soft-delete\] previous status=(\w+) resolution=(\w*) dupe_of=(\d*)/;

export interface DeletedInfo {
  deletedBy: string;
  deletedAt: string;
  reason: string;
  previous: { status: string; resolution: string; dupeOf: number | null } | null;
}

interface StoredBug {
  id: number;
  status: string;
  is_open: boolean;
  resolution: string;
  dupe_of?: number | null;
  groups?: string[];
}

const OPEN_FALLBACK = 'CONFIRMED';

/** Reads the latest deletion comment of a bug, newest first. */
export function deletedInfoFrom(
  comments: { text: string; author: string; creationTime: string }[]
): DeletedInfo | null {
  for (const c of [...comments].reverse()) {
    const m = MARKER.exec(c.text);
    if (!m) continue;
    const reason = /^Reason: (.*)$/m.exec(c.text)?.[1]?.trim() ?? '';
    return {
      deletedBy: c.author,
      deletedAt: c.creationTime,
      reason,
      previous: { status: m[1], resolution: m[2], dupeOf: m[3] ? Number(m[3]) : null },
    };
  }
  return null;
}

async function loadBugs(client: BugzillaClient, ids: number[]): Promise<StoredBug[]> {
  const resp = await client.get<{ bugs: StoredBug[] }>('/bug', {
    id: ids.join(','),
    include_fields: 'id,status,is_open,resolution,dupe_of,groups',
    limit: 0,
  });
  const found = new Set(resp.bugs.map((b) => b.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) {
    throw new AppError(404, 'NOT_FOUND', `Not found or not visible to you: ${missing.map((d) => `#${d}`).join(', ')}.`);
  }
  return resp.bugs;
}

function named(bugs: { id: number }[]): string {
  const list = bugs.slice(0, 5).map((b) => `#${b.id}`).join(', ');
  return bugs.length > 5 ? `${list}, and ${bugs.length - 5} more` : list;
}

export async function softDeleteBugs(client: BugzillaClient, ids: number[], reason: string, actor: string): Promise<number> {
  const bugs = await loadBugs(client, ids);
  const already = bugs.filter((b) => b.resolution === DELETED_RESOLUTION);
  if (already.length) {
    throw new AppError(409, 'CONFLICT', `Already deleted: ${named(already)}. Deselect ${already.length === 1 ? 'it' : 'them'} and try again.`);
  }

  /*
   * One update per bug, because each comment records THAT bug's previous state.
   * Open bugs move to RESOLVED; closed ones keep their status (VERIFIED cannot
   * go back to RESOLVED in this workflow) and only the resolution changes.
   */
  for (const bug of bugs) {
    const body =
      `Deleted by ${actor}.\nReason: ${reason}\n\n` +
      `[soft-delete] previous status=${bug.status} resolution=${bug.resolution ?? ''} dupe_of=${bug.dupe_of ?? ''}`;
    await client.put(`/bug/${bug.id}`, {
      ids: [bug.id],
      ...(bug.is_open ? { status: 'RESOLVED' } : {}),
      resolution: DELETED_RESOLUTION,
      groups: { add: [DELETED_GROUP] },
      comment: { body },
    });
  }
  return bugs.length;
}

export async function restoreBugs(
  client: BugzillaClient,
  ids: number[],
  actor: string,
  readComments: (id: number) => Promise<{ text: string; author: string; creationTime: string }[]>
): Promise<number> {
  const bugs = await loadBugs(client, ids);
  const notDeleted = bugs.filter((b) => b.resolution !== DELETED_RESOLUTION);
  if (notDeleted.length) {
    throw new AppError(409, 'CONFLICT', `Not deleted: ${named(notDeleted)}.`);
  }

  for (const bug of bugs) {
    const previous = deletedInfoFrom(await readComments(bug.id))?.previous ?? null;
    const comment = { body: `Restored by ${actor}.` };
    const groups = { remove: [DELETED_GROUP] };

    if (previous?.status === 'REOPENED') {
      // RESOLVED -> REOPENED is allowed directly (it needs a comment, which this carries).
      await client.put(`/bug/${bug.id}`, { ids: [bug.id], status: 'REOPENED', groups, comment });
    } else if (!previous || ['UNCONFIRMED', 'CONFIRMED', 'IN_PROGRESS', 'PENDING_APPROVAL', 'AWAITING_REQUIREMENT', 'IN_REVIEW'].includes(previous.status)) {
      // Reopen. RESOLVED cannot jump straight to IN_PROGRESS in this workflow,
      // so an in-progress bug comes back via CONFIRMED in a second step.
      const target = previous?.status === 'UNCONFIRMED' ? 'UNCONFIRMED' : OPEN_FALLBACK;
      await client.put(`/bug/${bug.id}`, { ids: [bug.id], status: target, groups, comment });
      if (previous?.status === 'IN_PROGRESS') {
        await client.put(`/bug/${bug.id}`, { ids: [bug.id], status: 'IN_PROGRESS' });
      }
      // Back to waiting on the project manager - that move needs a comment in this workflow.
      // Back into review: via IN_PROGRESS (CONFIRMED -> IN_PROGRESS -> IN_REVIEW is the allowed path).
      if (previous?.status === 'IN_REVIEW') {
        await client.put(`/bug/${bug.id}`, { ids: [bug.id], status: 'IN_PROGRESS' });
        await client.put(`/bug/${bug.id}`, {
          ids: [bug.id],
          status: 'IN_REVIEW',
          comment: { body: "Restored as In code review - it was waiting for the team lead's review before it was deleted." },
        });
      }
      if (previous?.status === 'AWAITING_REQUIREMENT') {
        await client.put(`/bug/${bug.id}`, {
          ids: [bug.id],
          status: 'AWAITING_REQUIREMENT',
          comment: { body: 'Restored as Awaiting requirement - it was waiting for a requirement to be raised before it was deleted.' },
        });
      }
      if (previous?.status === 'PENDING_APPROVAL') {
        await client.put(`/bug/${bug.id}`, {
          ids: [bug.id],
          status: 'PENDING_APPROVAL',
          comment: { body: 'Restored as Pending approval - it was waiting on the project manager before it was deleted.' },
        });
      }
    } else {
      // It was closed before deletion: put its old resolution back, status untouched.
      const resolution = previous.resolution && previous.resolution !== DELETED_RESOLUTION ? previous.resolution : 'FIXED';
      await client.put(`/bug/${bug.id}`, {
        ids: [bug.id],
        resolution,
        ...(resolution === 'DUPLICATE' && previous.dupeOf ? { dupe_of: previous.dupeOf } : {}),
        groups,
        comment,
      });
    }
  }
  return bugs.length;
}
