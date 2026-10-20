import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * `cn` now resolves Tailwind conflicts instead of just concatenating.
 *
 * Previously this was plain `clsx`, so `cn('px-3', props.className)` with a
 * caller passing `px-6` emitted BOTH - and which one won came down to their
 * order in the compiled stylesheet, not the call site. That is the bug every
 * variant-driven component eventually hits, and it gets worse as the component
 * count grows, so it is fixed before the new primitives land rather than after.
 *
 * The merger is EXTENDED rather than used bare: tailwind.config.js defines font
 * sizes and shadows that stock tailwind-merge has never heard of. Without these
 * registrations it treats `text-md` and `text-sm` as unrelated classes and
 * keeps both, which is precisely the conflict this is meant to resolve.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['2xs', 'xs', 'sm', 'base', 'md', 'lg', 'xl', '2xl', '3xl'] }],
      shadow: [{ shadow: ['hairline', 'raised', 'soft', 'lifted', 'float', 'overlay', 'ring', 'card', 'glass', 'glow'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.round((now - then) / 1000);

  if (diffSec < 60) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return formatDate(iso);
}

/**
 * How a bug is labelled in the UI: the `KPA-NNN` form (e.g. `KPA-001`).
 *
 * Bugzilla on this instance does not auto-assign the `KPA-` alias, so rather than fall back to
 * a bare `#<id>`, the label is derived from the bug id — `KPA-` plus the id zero-padded to at
 * least three digits. Always - an alias (e.g. the `mantis-N` on imported Mantis bugs) is never
 * the label, so every bug reads the same way; the Mantis number is shown separately from
 * `mantisRef`. The numeric id is still what links and sorting use; only the visible label changes.
 */
export function bugDisplayId(bug: { id: number }): string {
  return `KPA-${String(bug.id).padStart(3, '0')}`;
}


export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
