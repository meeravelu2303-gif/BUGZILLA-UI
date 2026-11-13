import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['2xs', 'xs', 'sm', 'base', 'md', 'lg', 'xl', '2xl', '3xl'] }],
      shadow: [
        { shadow: ['hairline', 'raised', 'soft', 'lifted', 'float', 'overlay', 'ring', 'card', 'glass', 'glow'] },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSeconds = Math.round((now - then) / 1000);

  if (diffSeconds < 60) return 'just now';
  const diffMin = Math.round(diffSeconds / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return formatDate(iso);
}

/** How a bug is labelled in the UI: the KPA-NNN form (e.g. */
export function bugDisplayId(bug: { id: number }): string {
  return `KPA-${String(bug.id).padStart(3, '0')}`;
}

/** A sub-component's display name from its stored value: Login [42] -> Login. */
export function subcomponentName(value: string | undefined | null): string {
  if (!value || value === '---') return '';
  return value.replace(/\s*\[\d+\]$/, '');
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
