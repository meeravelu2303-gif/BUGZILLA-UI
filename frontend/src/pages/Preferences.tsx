import { Mail, KeyRound, Bookmark, ShieldCheck, SlidersHorizontal, User } from 'lucide-react';
import { useState } from 'react';
import { useMe, useMeta } from '../api/hooks';
import { EmbeddedNative } from '../components/layout/EmbeddedNative';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { PREFERENCE_TABS } from '../lib/nav';
import { cn, initials } from '../lib/utils';

const TAB_ICON: Record<string, typeof Mail> = {
  settings: SlidersHorizontal,
  email: Mail,
  'saved-searches': Bookmark,
  apikey: KeyRound,
  permissions: ShieldCheck,
};

export function Preferences() {
  const { data: me } = useMe();
  const { data: meta } = useMeta();
  const user = me?.user;
  const [tab, setTab] = useState<string | null>(null);

  const active = PREFERENCE_TABS.find((t) => t.tab === tab) ?? null;

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-8">
      <PageHeader title="Preferences" description="Your account, notifications, saved searches and API keys." />

      <Card className="mb-6">
        <CardBody className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-100 text-lg font-semibold text-brand-800">
            {initials(user?.realName || user?.email || '?')}
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <User className="h-4 w-4 text-slate-400" />
              {user?.realName || '—'}
            </p>
            <p className="truncate text-sm text-slate-600">{user?.email}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {user?.permissions.canManageUsers && (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                  Can manage users
                </span>
              )}
              {user?.permissions.canManageProducts && (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                  Can manage products
                </span>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bugzilla preference sections</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PREFERENCE_TABS.map((t) => {
              const Icon = TAB_ICON[t.tab] ?? SlidersHorizontal;
              return (
                <button
                  key={t.tab}
                  onClick={() => setTab(t.tab)}
                  className={cn(
                    'focus-ring flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors',
                    tab === t.tab
                      ? 'border-brand-400 bg-brand-50/60 ring-1 ring-inset ring-brand-500/30'
                      : 'border-white/60 bg-white/60 hover:bg-white/90'
                  )}
                >
                  <Icon className="h-5 w-5 text-brand-600" />
                  <span className="text-sm font-semibold text-slate-900">{t.title}</span>
                  <span className="text-xs text-slate-600">{t.blurb}</span>
                </button>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {active && meta?.bugzillaWebUrl && (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">{active.title}</h2>
          <EmbeddedNative
            src={`${meta.bugzillaWebUrl}/userprefs.cgi?tab=${active.tab}`}
            title={active.title}
            blurb={active.blurb}
          />
        </div>
      )}
    </div>
  );
}
