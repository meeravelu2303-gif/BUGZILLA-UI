import { ArrowRight, CornerDownLeft, Search as SearchIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMe } from '../../api/hooks';
import { NAV_SECTIONS, visibleNavItems, type NavItem } from '../../lib/nav';
import { cn } from '../../lib/utils';

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: NavItem['icon'];
  run: () => void;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { data } = useMe();
  const permissions = data?.user.permissions;
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const navCommands = useMemo<Command[]>(() => {
    const out: Command[] = [];
    for (const section of NAV_SECTIONS) {
      for (const item of visibleNavItems(section, permissions)) {
        if (!item.to) continue;
        const to = item.to;
        out.push({
          id: to,
          label: item.label,
          hint: section.title,
          icon: item.icon,
          run: () => navigate(to),
        });
      }
    }
    return out;
  }, [permissions, navigate]);

  const results = useMemo<Command[]>(() => {
    const q = query.trim();
    const dynamic: Command[] = [];
    const bugId = q.match(/^#?(\d+)$/);
    if (bugId) {
      dynamic.push({
        id: 'goto-bug',
        label: `Go to bug #${bugId[1]}`,
        hint: 'Open',
        icon: ArrowRight,
        run: () => navigate(`/bugs/${bugId[1]}`),
      });
    }
    if (q.length > 0 && !bugId) {
      dynamic.push({
        id: 'search',
        label: `Search bugs for “${q}”`,
        hint: 'Search',
        icon: SearchIcon,
        run: () => navigate(`/bugs?search=${encodeURIComponent(q)}`),
      });
    }
    const lower = q.toLowerCase();
    const filtered = q.length === 0 ? navCommands : navCommands.filter((c) => c.label.toLowerCase().includes(lower) || c.hint?.toLowerCase().includes(lower));
    return [...dynamic, ...filtered];
  }, [query, navCommands, navigate]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      // Focus after the element mounts.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) return null;

  function choose(cmd?: Command) {
    if (!cmd) return;
    cmd.run();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/35 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="glass-raised w-full max-w-xl overflow-hidden rounded-2xl animate-toast-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="flex items-center gap-3 border-b border-hairline px-4">
          <SearchIcon className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                choose(results[active]);
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
            placeholder="Jump to a page, or type a bug number…"
            aria-label="Search commands"
            className="w-full bg-transparent py-3.5 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none"
          />
          <kbd className="hidden shrink-0 rounded border border-line bg-white px-1.5 py-0.5 text-[0.6667rem] font-medium text-slate-500 sm:block">esc</kbd>
        </div>

        <ul className="max-h-80 overflow-y-auto p-2" role="listbox">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-slate-500">No matches.</li>
          ) : (
            results.map((cmd, i) => (
              <li key={cmd.id} role="option" aria-selected={i === active}>
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(cmd)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                    i === active
                      ? 'bg-gradient-to-r from-brand-600 to-brand-700 text-white shadow-md ring-1 ring-inset ring-white/20'
                      : 'text-slate-700 hover:bg-slate-900/[0.04]'
                  )}
                >
                  <cmd.icon className={cn('h-4 w-4 shrink-0', i === active ? 'text-white' : 'text-slate-400')} />
                  <span className="flex-1 truncate font-medium">{cmd.label}</span>
                  {cmd.hint && (
                    <span className={cn('shrink-0 text-xs', i === active ? 'text-white/80' : 'text-slate-400')}>{cmd.hint}</span>
                  )}
                  {i === active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-white/80" />}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
