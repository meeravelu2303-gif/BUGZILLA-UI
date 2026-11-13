import type { BugzillaClient } from '../clients/bugzilla.client';
import { displayNameFor, resolveDisplayNames } from './displayNames.service';
import { subcomponentName } from './subcomponents.service';

/** A bug's activity: every recorded change (Bugzilla's Bug.history - the bugs_activity table), shaped. */
export type ChangeKind =
  'status' | 'resolution' | 'assignee' | 'placement' | 'priority' | 'people' | 'text' | 'link' | 'visibility' | 'other';

export interface ActivityChange {
  field: string;
  label: string;
  kind: ChangeKind;
  removed: string;
  added: string;
}

export interface ActivityEntry {
  when: string;
  who: string;
  whoName: string;
  changes: ActivityChange[];
}

export interface JourneyStep {
  status: string;
  resolution: string;
  when: string;
  who: string;
  whoName: string;
}

export interface BugActivity {
  created: { when: string; who: string; whoName: string };
  journey: JourneyStep[];
  entries: ActivityEntry[];
}

const FIELDS: Record<string, { label: string; kind: ChangeKind; people?: boolean }> = {
  bug_status: { label: 'Status', kind: 'status' },
  resolution: { label: 'Resolution', kind: 'resolution' },
  assigned_to: { label: 'Assignee', kind: 'assignee', people: true },
  qa_contact: { label: 'QA contact', kind: 'people', people: true },
  cc: { label: 'CC', kind: 'people', people: true },
  product: { label: 'Product', kind: 'placement' },
  component: { label: 'Component', kind: 'placement' },
  cf_subcomponent: { label: 'Sub-component', kind: 'placement' },
  version: { label: 'Version', kind: 'placement' },
  target_milestone: { label: 'Milestone', kind: 'placement' },
  bug_severity: { label: 'Severity', kind: 'priority' },
  priority: { label: 'Priority', kind: 'priority' },
  short_desc: { label: 'Summary', kind: 'text' },
  status_whiteboard: { label: 'Tags', kind: 'text' },
  keywords: { label: 'Keywords', kind: 'text' },
  bug_file_loc: { label: 'URL', kind: 'link' },
  dependson: { label: 'Depends on', kind: 'link' },
  blocked: { label: 'Blocks', kind: 'link' },
  see_also: { label: 'See also', kind: 'link' },
  dup_id: { label: 'Duplicate of', kind: 'link' },
  alias: { label: 'Alias', kind: 'text' },
  bug_group: { label: 'Visibility', kind: 'visibility' },
  op_sys: { label: 'OS', kind: 'other' },
  rep_platform: { label: 'Platform', kind: 'other' },
  deadline: { label: 'Deadline', kind: 'other' },
  estimated_time: { label: 'Estimate', kind: 'other' },
  remaining_time: { label: 'Remaining', kind: 'other' },
  work_time: { label: 'Hours worked', kind: 'other' },
  'attachments.isobsolete': { label: 'Attachment obsolete', kind: 'other' },
  'attachments.description': { label: 'Attachment name', kind: 'other' },
  'attachments.filename': { label: 'Attachment file', kind: 'other' },
  'attachments.mimetype': { label: 'Attachment type', kind: 'other' },
  'attachments.ispatch': { label: 'Attachment is patch', kind: 'other' },
  everconfirmed: { label: 'Confirmed', kind: 'other' },
  cclist_accessible: { label: 'CC can see', kind: 'visibility' },
  reporter_accessible: { label: 'Reporter can see', kind: 'visibility' },
};

const API_ALIASES: Record<string, string> = {
  status: 'bug_status',
  severity: 'bug_severity',
  summary: 'short_desc',
  whiteboard: 'status_whiteboard',
  url: 'bug_file_loc',
  depends_on: 'dependson',
  blocks: 'blocked',
  dupe_of: 'dup_id',
  groups: 'bug_group',
  platform: 'rep_platform',
  is_confirmed: 'everconfirmed',
  is_cc_accessible: 'cclist_accessible',
  is_creator_accessible: 'reporter_accessible',
};
const canonical = (name: string) => API_ALIASES[name] ?? name;
const fieldInfo = (name: string) =>
  FIELDS[canonical(name)] ?? { label: name.replace(/^cf_/, '').replace(/_/g, ' '), kind: 'other' as ChangeKind };
const isPeople = (name: string) => Boolean(FIELDS[canonical(name)]?.people);

interface RawHistory {
  bugs?: {
    id: number;
    history?: {
      when: string;
      who: string;
      changes: { field_name: string; removed: string; added: string; attachment_id?: number }[];
    }[];
  }[];
}

/** Read on the CALLER's own session. */
export async function loadBugActivity(client: BugzillaClient, id: number): Promise<BugActivity> {
  const [historyResponse, bugResponse] = await Promise.all([
    client.get<RawHistory>(`/bug/${id}/history`),
    client.get<{ bugs: { creation_time: string; creator: string; status: string; resolution: string }[] }>(
      `/bug/${id}`,
      {
        include_fields: 'creation_time,creator,status,resolution',
      },
    ),
  ]);
  const bug = bugResponse.bugs[0];
  const history = (historyResponse.bugs?.[0]?.history ?? [])
    .slice()
    .sort((left, right) => left.when.localeCompare(right.when));

  const logins = new Set<string>([bug.creator]);
  for (const historyEntry of history) {
    logins.add(historyEntry.who);
    for (const change of historyEntry.changes) {
      if (!isPeople(change.field_name)) continue;
      for (const value of [change.removed, change.added])
        for (const login of value.split(/,\s*/)) if (login) logins.add(login);
    }
  }
  const names = await resolveDisplayNames(client, [...logins]).catch(() => new Map<string, string>());
  const nameOf = (login: string) => displayNameFor(names, login);
  const people = (value: string) => value.split(/,\s*/).filter(Boolean).map(nameOf).join(', ');

  const show = (field: string, value: string) => {
    if (isPeople(field)) return people(value);
    if (field === 'cf_subcomponent') return subcomponentName(value) || (value ? 'None' : '');
    return value;
  };

  const entries: ActivityEntry[] = history.map((item) => ({
    when: item.when,
    who: item.who,
    whoName: nameOf(item.who),
    changes: item.changes.map((change) => {
      const info = fieldInfo(change.field_name);
      return {
        field: canonical(change.field_name),
        label: change.attachment_id ? `${info.label} (attachment ${change.attachment_id})` : info.label,
        kind: info.kind,
        removed: show(change.field_name, change.removed),
        added: show(change.field_name, change.added),
      };
    }),
  }));

  const statusChanges = history.filter((item) =>
    item.changes.some((change) => canonical(change.field_name) === 'bug_status'),
  );
  const firstStatus =
    statusChanges[0]?.changes.find((change) => canonical(change.field_name) === 'bug_status')?.removed ?? bug.status;
  const journey: JourneyStep[] = [
    { status: firstStatus, resolution: '', when: bug.creation_time, who: bug.creator, whoName: nameOf(bug.creator) },
  ];
  let resolution = '';
  for (const historyEntry of history) {
    const resolutionChange = historyEntry.changes.find((change) => canonical(change.field_name) === 'resolution');
    if (resolutionChange) resolution = resolutionChange.added;
    const statusChange = historyEntry.changes.find((change) => canonical(change.field_name) === 'bug_status');
    if (statusChange)
      journey.push({
        status: statusChange.added,
        resolution,
        when: historyEntry.when,
        who: historyEntry.who,
        whoName: nameOf(historyEntry.who),
      });
  }

  return {
    created: { when: bug.creation_time, who: bug.creator, whoName: nameOf(bug.creator) },
    journey,
    entries: entries.reverse(),
  };
}
