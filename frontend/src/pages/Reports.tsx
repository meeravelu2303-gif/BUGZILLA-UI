import { AlertTriangle, Bug as BugIcon, CheckCircle2, CircleDot } from 'lucide-react';
import { useBugs } from '../api/hooks';
import { BarListChart, type BarListItem } from '../components/dashboard/BarListChart';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { Skeleton } from '../components/ui/Skeleton';
import { STATUS_TONE, SEVERITY_TONE } from '../components/ui/Pill';
import type { Bug } from '../types';
import type { Tone } from '../components/ui/Pill';

const SAMPLE_SIZE = 200;
const ACCENT: Tone[] = ['blue', 'violet', 'emerald', 'amber', 'sky', 'orange', 'rose', 'slate'];

function topCounts(bugs: Bug[], pick: (b: Bug) => string, tone?: (label: string, i: number) => Tone, limit = 8): BarListItem[] {
  const counts: Record<string, number> = {};
  for (const b of bugs) {
    const key = pick(b) || '—';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value], i) => ({ label, value, tone: tone ? tone(label, i) : ACCENT[i % ACCENT.length] }));
}

function ChartCard({ title, items, loading }: { title: string; items: BarListItem[]; loading: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardBody>
        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-2 w-full" />
            ))}
          </div>
        ) : (
          <BarListChart title="" items={items} />
        )}
      </CardBody>
    </Card>
  );
}

export function Reports() {
  const { data, isLoading } = useBugs({ limit: SAMPLE_SIZE, offset: 0, sortBy: 'last_change_time', sortDir: 'desc' });
  const bugs = data?.bugs ?? [];

  const total = bugs.length;
  const open = bugs.filter((b) => b.isOpen).length;
  const resolved = total - open;
  const critical = bugs.filter((b) => b.severity === 'blocker' || b.severity === 'critical').length;

  const byStatus = topCounts(bugs, (b) => b.status.replace('_', ' '), (label) => STATUS_TONE[label.replace(' ', '_')] ?? 'slate');
  const bySeverity = topCounts(bugs, (b) => b.severity, (label) => SEVERITY_TONE[label] ?? 'slate');
  const byPriority = topCounts(bugs, (b) => b.priority);
  const byProduct = topCounts(bugs, (b) => b.product);
  const byComponent = topCounts(bugs, (b) => b.component);
  const byAssignee = topCounts(bugs, (b) => b.assignedTo?.name ?? 'Unassigned');

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8">
      <PageHeader
        title="Reports & Charts"
        description={`Live breakdowns computed from the ${SAMPLE_SIZE} most recently changed bugs.`}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[84px] rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={BugIcon} label="Sampled bugs" value={total} tone="brand" />
          <StatCard icon={CircleDot} label="Open" value={open} tone="amber" />
          <StatCard icon={CheckCircle2} label="Resolved" value={resolved} tone="emerald" />
          <StatCard icon={AlertTriangle} label="Blocker / Critical" value={critical} tone="rose" />
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="By status" items={byStatus} loading={isLoading} />
        <ChartCard title="By severity" items={bySeverity} loading={isLoading} />
        <ChartCard title="By priority" items={byPriority} loading={isLoading} />
        <ChartCard title="By product" items={byProduct} loading={isLoading} />
        <ChartCard title="Top components" items={byComponent} loading={isLoading} />
        <ChartCard title="Top assignees" items={byAssignee} loading={isLoading} />
      </div>
    </div>
  );
}
