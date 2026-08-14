import { UserCheck, PencilLine, Eye } from 'lucide-react';
import { useState } from 'react';
import { useBugs, useMe } from '../api/hooks';
import { BugTable } from '../components/bugs/BugTable';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import type { ListBugsParams } from '../types';
import { cn } from '../lib/utils';

type TabId = 'assigned' | 'reported' | 'cc';

const TABS: { id: TabId; label: string; icon: typeof UserCheck }[] = [
  { id: 'assigned', label: 'Assigned to me', icon: UserCheck },
  { id: 'reported', label: 'Reported by me', icon: PencilLine },
  { id: 'cc', label: "I'm on CC", icon: Eye },
];

export function MyBugs() {
  const { data: me } = useMe();
  const email = me?.user.email ?? '';
  const [tab, setTab] = useState<TabId>('assigned');
  const [sortBy, setSortBy] = useState('last_change_time');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const base: ListBugsParams = { limit: 100, offset: 0, sortBy, sortDir };
  const query: ListBugsParams =
    tab === 'assigned'
      ? { ...base, assignedTo: email }
      : tab === 'reported'
        ? { ...base, creator: email }
        : { ...base, cc: email };

  const { data, isLoading, isFetching } = useBugs(query);

  function onSort(key: string) {
    if (sortBy === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(key);
      setSortDir('asc');
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8">
      <PageHeader title="My Bugs" description="Everything that lands on your desk — assigned, reported, or watched." />

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'focus-ring inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors',
              tab === t.id
                ? 'bg-gradient-to-b from-brand-700 to-brand-800 text-white shadow-glass'
                : 'glass-surface text-slate-600 hover:text-slate-900'
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
            {tab === t.id && data && (
              <span className="rounded-full bg-white/25 px-1.5 text-xs tabular-nums">{data.bugs.length}</span>
            )}
          </button>
        ))}
      </div>

      <Card>
        <div className={isFetching && !isLoading ? 'opacity-60 transition-opacity' : ''}>
          <BugTable bugs={data?.bugs ?? []} isLoading={isLoading} sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
        </div>
      </Card>
    </div>
  );
}
