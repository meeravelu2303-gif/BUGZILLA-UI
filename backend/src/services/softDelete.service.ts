import type { BugzillaClient } from '../clients/bugzilla.client';
import { notFound, conflict } from '../helpers/errors.helper';

/** Soft delete, built from Bugzilla's own pieces (configured once by. */
export const DELETED_RESOLUTION = 'DELETED';
export const DELETED_GROUP = 'Deleted bugs';

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
  comments: { text: string; author: string; creationTime: string }[],
): DeletedInfo | null {
  for (const comment of [...comments].reverse()) {
    const match = MARKER.exec(comment.text);
    if (!match) continue;
    const reason = /^Reason: (.*)$/m.exec(comment.text)?.[1]?.trim() ?? '';
    return {
      deletedBy: comment.author,
      deletedAt: comment.creationTime,
      reason,
      previous: { status: match[1], resolution: match[2], dupeOf: match[3] ? Number(match[3]) : null },
    };
  }
  return null;
}

async function loadBugs(client: BugzillaClient, ids: number[]): Promise<StoredBug[]> {
  const response = await client.get<{ bugs: StoredBug[] }>('/bug', {
    id: ids.join(','),
    include_fields: 'id,status,is_open,resolution,dupe_of,groups',
    limit: 0,
  });
  const found = new Set(response.bugs.map((bug) => bug.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) {
    throw notFound(`Not found or not visible to you: ${missing.map((value) => `#${value}`).join(', ')}.`);
  }
  return response.bugs;
}

function named(bugs: { id: number }[]): string {
  const list = bugs
    .slice(0, 5)
    .map((bug) => `#${bug.id}`)
    .join(', ');
  return bugs.length > 5 ? `${list}, and ${bugs.length - 5} more` : list;
}

export async function softDeleteBugs(
  client: BugzillaClient,
  ids: number[],
  reason: string,
  actor: string,
): Promise<number> {
  const bugs = await loadBugs(client, ids);
  const already = bugs.filter((bug) => bug.resolution === DELETED_RESOLUTION);
  if (already.length) {
    throw conflict(
      `Already deleted: ${named(already)}. Deselect ${already.length === 1 ? 'it' : 'them'} and try again.`,
    );
  }

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
  readComments: (id: number) => Promise<{ text: string; author: string; creationTime: string }[]>,
): Promise<number> {
  const bugs = await loadBugs(client, ids);
  const notDeleted = bugs.filter((bug) => bug.resolution !== DELETED_RESOLUTION);
  if (notDeleted.length) {
    throw conflict(`Not deleted: ${named(notDeleted)}.`);
  }

  for (const bug of bugs) {
    const previous = deletedInfoFrom(await readComments(bug.id))?.previous ?? null;
    const comment = { body: `Restored by ${actor}.` };
    const groups = { remove: [DELETED_GROUP] };

    if (previous?.status === 'REOPENED') {
      await client.put(`/bug/${bug.id}`, { ids: [bug.id], status: 'REOPENED', groups, comment });
    } else if (
      !previous ||
      ['UNCONFIRMED', 'CONFIRMED', 'IN_PROGRESS', 'PENDING_APPROVAL', 'AWAITING_REQUIREMENT', 'IN_REVIEW'].includes(
        previous.status,
      )
    ) {
      const target = previous?.status === 'UNCONFIRMED' ? 'UNCONFIRMED' : OPEN_FALLBACK;
      await client.put(`/bug/${bug.id}`, { ids: [bug.id], status: target, groups, comment });
      if (previous?.status === 'IN_PROGRESS') {
        await client.put(`/bug/${bug.id}`, { ids: [bug.id], status: 'IN_PROGRESS' });
      }
      if (previous?.status === 'IN_REVIEW') {
        await client.put(`/bug/${bug.id}`, { ids: [bug.id], status: 'IN_PROGRESS' });
        await client.put(`/bug/${bug.id}`, {
          ids: [bug.id],
          status: 'IN_REVIEW',
          comment: {
            body: "Restored as In code review - it was waiting for the team lead's review before it was deleted.",
          },
        });
      }
      if (previous?.status === 'AWAITING_REQUIREMENT') {
        await client.put(`/bug/${bug.id}`, {
          ids: [bug.id],
          status: 'AWAITING_REQUIREMENT',
          comment: {
            body: 'Restored as Awaiting requirement - it was waiting for a requirement to be raised before it was deleted.',
          },
        });
      }
      if (previous?.status === 'PENDING_APPROVAL') {
        await client.put(`/bug/${bug.id}`, {
          ids: [bug.id],
          status: 'PENDING_APPROVAL',
          comment: {
            body: 'Restored as Pending approval - it was waiting on the project manager before it was deleted.',
          },
        });
      }
    } else {
      const resolution =
        previous.resolution && previous.resolution !== DELETED_RESOLUTION ? previous.resolution : 'FIXED';
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
