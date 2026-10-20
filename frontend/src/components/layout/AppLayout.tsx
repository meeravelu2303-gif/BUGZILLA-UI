import { Bug, ChevronDown, LogOut, Menu, Plus, Search, Settings, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useLogout, useMe } from '../../api/hooks';
import { NAV_SECTIONS, visibleNavItems, type NavSection } from '../../lib/nav';
import type { Permissions } from '../../types';
import { cn, initials } from '../../lib/utils';
import { UEducateLogo } from '../brand/UEducateLogo';
import { CommandPalette } from './CommandPalette';
import { ErrorBoundary } from './ErrorBoundary';

/*
 * Nav items are pills. The active one carries a brand-tinted fill, a hairline
 * ring and a small accent dot on its left edge, so the current page is found by
 * shape and colour, not by reading every label.
 */
function navLinkClasses({ isActive }: { isActive: boolean }): string {
  return cn(
    'focus-ring group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition-all duration-200',
    isActive
      ? 'bg-white/85 text-brand-800 shadow-card ring-1 ring-inset ring-brand-500/25'
      : 'text-slate-600 hover:bg-white/55 hover:text-slate-900'
  );
}

function SidebarSection({ section, permissions }: { section: NavSection; permissions?: Permissions }) {
  const [collapsed, setCollapsed] = useState(false);

  // A section with nothing visible (e.g. Administration for a developer) is not drawn at all.
  const items = visibleNavItems(section, permissions);
  if (items.length === 0) return null;

  return (
    <div className="px-3 pt-5 first:pt-2">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="focus-ring flex w-full items-center justify-between rounded-md px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500 hover:text-slate-700"
        aria-expanded={!collapsed}
      >
        {section.title}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', collapsed && '-rotate-90')} aria-hidden />
      </button>
      {!collapsed && (
        <div className="mt-1.5 space-y-0.5">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to!} end={item.end} className={navLinkClasses}>
              {({ isActive }) => (
                <>
                  <span
                    aria-hidden
                    className={cn(
                      'absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-brand-500 to-brand-700 transition-opacity',
                      isActive ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <item.icon
                    className={cn('h-4 w-4 shrink-0 transition-colors', isActive ? 'text-brand-700' : 'text-slate-400 group-hover:text-slate-600')}
                    aria-hidden
                  />
                  <span className="truncate">{item.label}</span>
                </>
              )}
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
      <div className="flex items-start justify-between gap-2 px-5 pb-4 pt-5">
        <div className="flex flex-col gap-2">
          <UEducateLogo height={28} />
          <div className="flex items-center gap-2 pl-0.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
              <Bug className="h-3 w-3" aria-hidden />
            </span>
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

      <nav className="flex-1 overflow-y-auto pb-3">
        <div className="px-4 pb-1">
          <NavLink
            to="/bugs/new"
            /*
             * The sidebar's one premium control.
             *
             * Three stacked cues make the 3D read, and each does a distinct job:
             *   - a vertical gradient (brand-500 -> brand-700) for the lit face;
             *   - `ring-white/25 inset` as a specular highlight along the top edge;
             *   - a coloured cast below, so it sits ON the sidebar rather than in it.
             * On press, the shadow collapses and the button drops 1px, which is
             * what sells the depth as physical rather than painted.
             *
             * White text clears AA across the whole ramp - 5.17:1 on brand-600,
             * 6.70:1 on brand-700 - which is the check a gradient fill quietly
             * fails at its lightest stop.
             */
            className="focus-ring flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-brand-500 via-brand-600 to-brand-700 px-4 text-sm font-semibold text-white shadow-[0_6px_16px_-4px_rgb(37_99_235_/_0.5),inset_0_1px_0_0_rgb(255_255_255_/_0.25)] ring-1 ring-inset ring-white/25 transition-all duration-200 hover:from-brand-600 hover:to-brand-800 hover:shadow-[0_10px_22px_-4px_rgb(37_99_235_/_0.6),inset_0_1px_0_0_rgb(255_255_255_/_0.3)] active:translate-y-px active:shadow-[0_2px_8px_-2px_rgb(37_99_235_/_0.5)]"
          >
            <Plus className="h-4 w-4" aria-hidden />
            New Bug
          </NavLink>
        </div>
        {NAV_SECTIONS.map((section) => (
          <SidebarSection key={section.id} section={section} permissions={permissions} />
        ))}
      </nav>

      <div className="p-3">
        <div className="flex items-center gap-2 rounded-2xl bg-white/60 p-2 shadow-card ring-1 ring-inset ring-white/80">
          <NavLink
            to="/preferences"
            className="focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1.5 py-1 hover:bg-white/70"
            title="Preferences"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-semibold text-white shadow-sm ring-2 ring-white/80">
              {initials(user?.realName || user?.email || '?')}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-slate-900">{user?.realName || '—'}</p>
              <p className="truncate text-[11px] text-slate-500">{user?.email || ''}</p>
            </div>
          </NavLink>
          <button
            onClick={() => logout.mutate()}
            className="focus-ring shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
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
      {/*
       * Depth behind the glass: two slow, blurred colour fields fixed under the
       * content. Without them the frosted surfaces have nothing to diffuse and
       * read as flat grey. Pointer-events off, aria-hidden, well under the page.
       */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-[12%] h-[34rem] w-[34rem] rounded-full bg-brand-400/25 blur-3xl animate-blob-slow" />
        <div className="absolute right-[-10rem] top-[18%] h-[30rem] w-[30rem] rounded-full bg-ueducate-accent/25 blur-3xl animate-blob" />
        <div className="absolute bottom-[-12rem] left-[38%] h-[32rem] w-[32rem] rounded-full bg-indigo-300/20 blur-3xl animate-blob-slow" />
      </div>

      {/* Desktop sidebar */}
      <aside className="glass-panel fixed inset-y-0 left-0 z-30 hidden w-[17rem] flex-col rounded-none border-y-0 border-l-0 lg:flex">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="glass-raised absolute inset-y-0 left-0 w-72 rounded-none border-y-0 border-l-0">{sidebar}</aside>
        </div>
      )}

      <div className="lg:pl-[17rem]">
        {/*
         * Floating top bar: inset from the edges and rounded, so it reads as a
         * glass element over the page rather than a wall across it. Sticky with
         * a little headroom so it never touches the viewport edge.
         */}
        <header className="sticky top-0 z-20 px-3 pt-3 sm:px-5">
          <div className="glass-panel flex h-14 items-center gap-3 rounded-2xl px-3 sm:px-4">
            <button
              onClick={() => setMobileOpen(true)}
              className="focus-ring rounded-lg p-2 text-slate-500 hover:bg-white/70 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <button
              onClick={() => setPaletteOpen(true)}
              className="focus-ring group flex h-10 max-w-md flex-1 items-center gap-2.5 rounded-full bg-white/70 px-4 text-sm text-slate-500 shadow-[inset_0_1px_1px_rgb(15_23_42_/_0.04)] ring-1 ring-inset ring-slate-900/10 transition-all hover:bg-white hover:ring-slate-900/15"
            >
              <Search className="h-4 w-4 text-slate-400 transition-colors group-hover:text-brand-700" aria-hidden />
              <span className="flex-1 truncate text-left">Search bugs, jump to a page…</span>
              <kbd className="hidden items-center gap-0.5 rounded-md border border-line bg-white px-1.5 py-0.5 font-sans text-[10px] font-semibold text-slate-500 sm:inline-flex">
                ⌘K
              </kbd>
            </button>

            <div className="ml-auto flex items-center gap-1">
              <NavLink
                to="/bugs/new"
                className="focus-ring hidden h-9 items-center gap-1.5 rounded-full bg-gradient-to-b from-brand-600 to-brand-800 px-3.5 text-[13px] font-semibold text-white shadow-glow ring-1 ring-inset ring-white/20 hover:from-brand-700 hover:to-brand-900 sm:inline-flex lg:hidden"
              >
                <Plus className="h-4 w-4" aria-hidden /> New bug
              </NavLink>
              <NavLink
                to="/preferences"
                className="focus-ring rounded-full p-2 text-slate-500 transition-colors hover:bg-white/80 hover:text-slate-800"
                aria-label="Preferences"
                title="Preferences"
              >
                <Settings className="h-5 w-5" />
              </NavLink>
            </div>
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
