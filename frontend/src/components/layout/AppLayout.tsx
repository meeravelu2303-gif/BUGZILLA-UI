import { Bug, ExternalLink, LayoutDashboard, ListChecks, LogOut, Plus, ShieldCheck, Users as UsersIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useLogout, useMe, useMeta } from '../../api/hooks';
import { cn, initials } from '../../lib/utils';
import { UEducateLogo } from '../brand/UEducateLogo';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/bugs', label: 'Bugs', icon: ListChecks, end: false },
];

const ADVANCED_ADMIN_LINKS = [
  { path: 'editusers.cgi', label: 'Users & groups' },
  { path: 'editgroups.cgi', label: 'Group definitions' },
  { path: 'editproducts.cgi', label: 'Products (full)' },
  { path: 'editcomponents.cgi', label: 'Components (full)' },
  { path: 'editvalues.cgi', label: 'Field values' },
  { path: 'editworkflow.cgi', label: 'Status workflow' },
];

function navLinkClasses({ isActive }: { isActive: boolean }): string {
  return cn(
    'focus-ring flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive ? 'bg-white/70 text-brand-700 shadow-sm' : 'text-slate-600 hover:bg-white/50 hover:text-slate-900'
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { data } = useMe();
  const { data: meta } = useMeta();
  const logout = useLogout();
  const user = data?.user;
  const permissions = user?.permissions;
  const hasAnyAdminAccess = Boolean(permissions?.canManageUsers || permissions?.canManageProducts);

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 flex w-64 flex-col border-r border-white/30 bg-white/60 backdrop-blur-xl">
        <div className="flex flex-col gap-2 border-b border-white/30 px-5 py-4">
          <UEducateLogo height={30} />
          <div className="flex items-center gap-2 pl-0.5">
            <Bug className="h-3.5 w-3.5 text-brand-700" />
            <span className="text-sm font-semibold tracking-tight text-ueducate-ink">Bugzilla</span>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClasses}>
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}

          {permissions?.canManageUsers && (
            <NavLink to="/admin/users" className={navLinkClasses}>
              <UsersIcon className="h-4 w-4" />
              Users
            </NavLink>
          )}

          {permissions?.canManageProducts && (
            <NavLink to="/admin/products" className={navLinkClasses}>
              <ShieldCheck className="h-4 w-4" />
              Products
            </NavLink>
          )}

          <NavLink
            to="/bugs/new"
            className="focus-ring mt-3 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-b from-brand-700 to-brand-800 px-3 py-2 text-sm font-medium text-white shadow-glass transition-colors hover:from-brand-800 hover:to-brand-900"
          >
            <Plus className="h-4 w-4" />
            New Bug
          </NavLink>

          {hasAnyAdminAccess && meta?.bugzillaWebUrl && (
            <div className="mt-6 border-t border-white/30 pt-4">
              <p className="px-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Advanced Administration</p>
              <p className="mt-1 px-3 text-[11px] leading-snug text-slate-600">
                Group/permission and workflow config stay in Bugzilla's native admin.
              </p>
              <div className="mt-2 space-y-0.5">
                {ADVANCED_ADMIN_LINKS.map((link) => (
                  <a
                    key={link.path}
                    href={`${meta.bugzillaWebUrl}/${link.path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="focus-ring flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-slate-600 hover:bg-white/50 hover:text-slate-800"
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    <span className="truncate">{link.label}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </nav>

        <div className="border-t border-white/30 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
              {initials(user?.realName || user?.email || '?')}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{user?.realName || '—'}</p>
              <p className="truncate text-xs text-slate-600">{user?.email || ''}</p>
            </div>
            <button
              onClick={() => logout.mutate()}
              className="focus-ring shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-white/60 hover:text-slate-600"
              aria-label="Log out"
              title="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="ml-64 flex-1">{children}</main>
    </div>
  );
}
