import { Bug, ChevronDown, LogOut, Menu, Plus, Search, Settings, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useLogout, useMe } from '../../api/hooks';
import { NAV_SECTIONS, type NavSection } from '../../lib/nav';
import { cn, initials } from '../../lib/utils';
import { UEducateLogo } from '../brand/UEducateLogo';
import { CommandPalette } from './CommandPalette';
import { ErrorBoundary } from './ErrorBoundary';

function navLinkClasses({ isActive }: { isActive: boolean }): string {
  return cn(
    'focus-ring group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-gradient-to-r from-brand-600/15 to-brand-500/5 text-brand-800 shadow-sm ring-1 ring-inset ring-brand-500/20'
      : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
  );
}

function SidebarSection({
  section,
  canSeeAdmin,
  hasPermission,
}: {
  section: NavSection;
  canSeeAdmin: boolean;
  hasPermission: (p?: string) => boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  if (section.adminOnly && !canSeeAdmin) return null;

  const items = section.items.filter((item) => hasPermission(item.permission));
  if (items.length === 0) return null;

  return (
    <div className="px-2 pt-4 first:pt-1">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="focus-ring flex w-full items-center justify-between rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700"
        aria-expanded={!collapsed}
      >
        {section.title}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', collapsed && '-rotate-90')} />
      </button>
      {!collapsed && (
        <div className="mt-1 space-y-0.5">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to!} end={item.end} className={navLinkClasses}>
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { data } = useMe();
  const logout = useLogout();
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const user = data?.user;
  const permissions = user?.permissions;
  const canSeeAdmin = Boolean(permissions?.canManageUsers || permissions?.canManageProducts);
  const hasPermission = (p?: string) => !p || Boolean(permissions?.[p as 'canManageUsers' | 'canManageProducts']);

  // ⌘K / Ctrl-K opens the command palette anywhere in the app.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Close the mobile drawer on navigation.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-white/30 px-5 py-4">
        <div className="flex flex-col gap-2">
          <UEducateLogo height={28} />
          <div className="flex items-center gap-2 pl-0.5">
            <Bug className="h-3.5 w-3.5 text-brand-700" />
            {/*
              Product name, matching the sign-in screen. Purely a brand label -
              unlike the "Open in Bugzilla" links on the admin pages, which name
              the actual system they navigate to and must keep saying so.
            */}
            <span className="text-sm font-semibold tracking-tight text-ueducate-ink">Bug Tracker</span>
          </div>
        </div>
        <button
          onClick={() => setMobileOpen(false)}
          className="focus-ring rounded-md p-1.5 text-slate-400 hover:bg-white/60 lg:hidden"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        <div className="px-3">
          <NavLink
            to="/bugs/new"
            className="focus-ring flex items-center justify-center gap-2 rounded-lg bg-gradient-to-b from-brand-700 to-brand-800 px-3 py-2.5 text-sm font-semibold text-white shadow-glass transition-colors hover:from-brand-800 hover:to-brand-900"
          >
            <Plus className="h-4 w-4" />
            New Bug
          </NavLink>
        </div>
        {NAV_SECTIONS.map((section) => (
          <SidebarSection key={section.id} section={section} canSeeAdmin={canSeeAdmin} hasPermission={hasPermission} />
        ))}
      </nav>

      <div className="border-t border-white/30 p-3">
        <div className="flex items-center gap-3 rounded-lg px-1 py-1">
          <NavLink
            to="/preferences"
            className="focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1 hover:bg-white/60"
            title="Preferences"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
              {initials(user?.realName || user?.email || '?')}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{user?.realName || '—'}</p>
              <p className="truncate text-xs text-slate-600">{user?.email || ''}</p>
            </div>
          </NavLink>
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
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-white/30 bg-white/60 backdrop-blur-xl lg:flex">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-white/30 bg-white/90 backdrop-blur-xl">{sidebar}</aside>
        </div>
      )}

      <div className="lg:ml-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-white/30 bg-white/60 px-4 backdrop-blur-xl sm:px-6">
          <button
            onClick={() => setMobileOpen(true)}
            className="focus-ring rounded-md p-1.5 text-slate-500 hover:bg-white/70 lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <button
            onClick={() => setPaletteOpen(true)}
            className="focus-ring group flex max-w-md flex-1 items-center gap-2 rounded-xl border border-white/60 bg-white/70 px-3 py-2 text-sm text-slate-500 transition-colors hover:bg-white/90"
          >
            <Search className="h-4 w-4 text-slate-400" />
            <span className="flex-1 text-left">Search bugs, jump to a page…</span>
            <kbd className="hidden items-center gap-0.5 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500 sm:inline-flex">
              ⌘K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <NavLink
              to="/preferences"
              className="focus-ring rounded-md p-2 text-slate-500 hover:bg-white/70 hover:text-slate-700"
              aria-label="Preferences"
              title="Preferences"
            >
              <Settings className="h-5 w-5" />
            </NavLink>
          </div>
        </header>

        <main>
          {/* Keyed by route so navigating away from a crashed page clears the error. */}
          <ErrorBoundary resetKey={location.pathname}>{children}</ErrorBoundary>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
