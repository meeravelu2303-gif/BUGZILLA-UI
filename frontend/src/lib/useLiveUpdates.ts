import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

/**
 * Live updates: keeps one stream open to the backend (GET /api/events) and
 * refreshes what is on screen the moment bugs change - whoever changed them,
 * in this app or in Bugzilla directly (backend lib/liveUpdates.ts).
 *
 *   "bugs"       -> every bug query: lists, counts, dashboard stats, the open
 *                   bug, its comments and activity. Only queries on screen
 *                   refetch now; the rest are marked stale for next time.
 *   "directory"  -> product, component and people lists.
 *
 * Messages are batched for a moment so a burst (a bulk reassign, a bench run
 * filing twenty bugs) costs one refresh, not twenty. An open bug being edited
 * keeps the user's unsaved changes: the editor rebases onto the new data
 * (lib/useBugEditor.ts). The browser reconnects by itself if the stream drops.
 */
export function useLiveUpdates(enabled: boolean): void {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/events');
    let bugsTimer: ReturnType<typeof setTimeout> | undefined;
    let directoryTimer: ReturnType<typeof setTimeout> | undefined;

    source.addEventListener('bugs', () => {
      clearTimeout(bugsTimer);
      bugsTimer = setTimeout(() => void qc.invalidateQueries({ queryKey: ['bugs'] }), 300);
    });
    source.addEventListener('directory', () => {
      clearTimeout(directoryTimer);
      directoryTimer = setTimeout(() => {
        for (const key of [['products'], ['admin'], ['meta']]) void qc.invalidateQueries({ queryKey: key });
      }, 300);
    });

    return () => {
      clearTimeout(bugsTimer);
      clearTimeout(directoryTimer);
      source.close();
    };
  }, [enabled, qc]);
}
