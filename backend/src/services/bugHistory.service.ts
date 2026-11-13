import type { BugzillaClient } from '../clients/bugzilla.client';

interface HistoryResponse {
  bugs?: Array<{
    id?: number;
    history?: Array<{ changes?: Array<{ field_name?: string }> }>;
  }>;
}

export async function reassignedBugIds(client: BugzillaClient, ids: number[]): Promise<Set<number>> {
  const out = new Set<number>();
  if (ids.length === 0) return out;

  const response = await client.get<HistoryResponse>(`/bug/${ids[0]}/history`, { ids });

  for (const bug of response.bugs ?? []) {
    if (typeof bug.id !== 'number') continue;
    const changed = (bug.history ?? []).some((entry) =>
      (entry.changes ?? []).some((change) => change.field_name === 'assigned_to'),
    );
    if (changed) out.add(bug.id);
  }
  return out;
}
