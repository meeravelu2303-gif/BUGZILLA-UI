import type { BugzillaClient } from './bugzillaClient';

/**
 * Which of these bugs have genuinely had their assignee CHANGED since filing.
 *
 * The distinction this exists to draw: a bug whose assignee differs from its
 * component's default owner has not necessarily been reassigned. It may simply
 * have been FILED to that person - which is what 65 KPost Admin bugs turned out
 * to be. Only `bugs_activity` can tell the two apart, because only a real
 * change writes a row there.
 *
 * Call it with CANDIDATES, not the whole result set. A bug still sitting with
 * its component default cannot have been reassigned to anyone else and is not
 * worth a history lookup; narrowing first turns this from a question about
 * every open bug into one about a handful.
 */

interface HistoryResponse {
  bugs?: Array<{
    id?: number;
    history?: Array<{ changes?: Array<{ field_name?: string }> }>;
  }>;
}

export async function reassignedBugIds(client: BugzillaClient, ids: number[]): Promise<Set<number>> {
  const out = new Set<number>();
  if (ids.length === 0) return out;

  /*
   * One upstream call for the whole batch.
   *
   * `/bug/{id}/history` carries a single id in the path, but Bugzilla's REST
   * layer lets an explicit `ids` parameter override it (body beats path), and
   * the client's restToRpc mapping preserves that - so the path id is a
   * formality and every id travels in the parameter. Under mod_cgi each call
   * forks a Perl interpreter, so one batched request rather than N matters.
   */
  const resp = await client.get<HistoryResponse>(`/bug/${ids[0]}/history`, { ids });

  for (const bug of resp.bugs ?? []) {
    if (typeof bug.id !== 'number') continue;
    const changed = (bug.history ?? []).some((entry) =>
      (entry.changes ?? []).some((c) => c.field_name === 'assigned_to')
    );
    if (changed) out.add(bug.id);
  }
  return out;
}
