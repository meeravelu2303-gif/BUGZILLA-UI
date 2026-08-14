import { ExternalLink, Stethoscope } from 'lucide-react';
import { useMeta } from '../../api/hooks';
import { Card, CardBody } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';

const CHECKS = [
  'Cross-references between bugs (dependencies, duplicates, blockers)',
  'Group and product/component integrity',
  'Flags, attachments and keyword consistency',
  'User account and CC list integrity',
];

export function SanityCheck() {
  const { data: meta } = useMeta();

  return (
    <div className="mx-auto max-w-[800px] px-4 py-8 sm:px-8">
      <PageHeader
        title="Sanity Check"
        description="Bugzilla’s database consistency checker. It runs (and optionally repairs) directly against the database, so it stays a Bugzilla-native action rather than a REST call."
        crumbs={[{ label: 'Administration' }, { label: 'Sanity Check' }]}
      />

      <Card>
        <CardBody className="flex flex-col items-start gap-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Stethoscope className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">What it verifies</p>
            <ul className="mt-2 space-y-1.5">
              {CHECKS.map((c) => (
                <li key={c} className="flex items-start gap-2 text-sm text-slate-600">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                  {c}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-sm text-slate-600">
            A full sanity check can be slow on large instances and may make repair changes, so it runs in Bugzilla’s admin with its
            own confirmation — not silently over the API.
          </p>
          {meta?.bugzillaWebUrl && (
            <a
              href={`${meta.bugzillaWebUrl}/sanitycheck.cgi`}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring inline-flex items-center gap-2 rounded-lg bg-gradient-to-b from-brand-700 to-brand-800 px-4 py-2.5 text-sm font-semibold text-white shadow-glass transition-colors hover:from-brand-800 hover:to-brand-900"
            >
              <ExternalLink className="h-4 w-4" /> Run Sanity Check in Bugzilla
            </a>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
