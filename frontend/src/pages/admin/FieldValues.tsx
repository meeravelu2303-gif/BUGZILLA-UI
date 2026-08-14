import { ExternalLink, Tags } from 'lucide-react';
import { useMeta } from '../../api/hooks';
import { Card, CardBody, CardHeader, CardTitle } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { Pill, PRIORITY_TONE_MAP, SEVERITY_TONE, STATUS_TONE } from '../../components/ui/Pill';
import type { Tone } from '../../components/ui/Pill';
import type { BugMeta } from '../../types';

interface FieldGroup {
  key: string;
  title: string;
  cgiField: string;
  values: (m: BugMeta) => string[];
  tone?: (value: string) => Tone;
}

const FIELDS: FieldGroup[] = [
  { key: 'status', title: 'Status', cgiField: 'bug_status', values: (m) => m.statuses, tone: (v) => STATUS_TONE[v] ?? 'slate' },
  { key: 'resolution', title: 'Resolution', cgiField: 'resolution', values: (m) => m.resolutions },
  { key: 'severity', title: 'Severity', cgiField: 'bug_severity', values: (m) => m.severities, tone: (v) => SEVERITY_TONE[v] ?? 'slate' },
  { key: 'priority', title: 'Priority', cgiField: 'priority', values: (m) => m.priorities, tone: (v) => PRIORITY_TONE_MAP[v] ?? 'slate' },
  { key: 'op_sys', title: 'Operating System', cgiField: 'op_sys', values: (m) => m.opSystems },
  { key: 'platform', title: 'Platform', cgiField: 'rep_platform', values: (m) => m.platforms },
];

export function FieldValues() {
  const { data: meta, isLoading } = useMeta();
  const webUrl = meta?.bugzillaWebUrl;

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-8">
      <PageHeader
        title="Field Values"
        description="The allowed values for each core bug field on this instance. Adding or removing values is done in Bugzilla."
        crumbs={[{ label: 'Administration' }, { label: 'Field Values' }]}
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {FIELDS.map((field) => {
          const values = meta ? field.values(meta) : [];
          return (
            <Card key={field.key}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Tags className="h-4 w-4 text-brand-600" />
                  {field.title}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">{values.length}</span>
                </CardTitle>
                {webUrl && (
                  <a
                    href={`${webUrl}/editvalues.cgi?field=${field.cgiField}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-white/70"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Edit
                  </a>
                )}
              </CardHeader>
              <CardBody>
                {isLoading ? (
                  <p className="text-sm text-slate-500">Loading…</p>
                ) : values.length === 0 ? (
                  <p className="text-sm text-slate-500">No values.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {values.map((v) => (
                      <Pill key={v} tone={field.tone ? field.tone(v) : 'slate'}>
                        {v.replace('_', ' ')}
                      </Pill>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
