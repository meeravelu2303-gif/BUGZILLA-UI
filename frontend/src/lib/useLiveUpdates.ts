import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

/** Live updates: keeps one stream open to the backend (GET /api/events) and refreshes what is on screen. */
export function useLiveUpdates(enabled: boolean): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/events');
    let bugsTimer: ReturnType<typeof setTimeout> | undefined;
    let directoryTimer: ReturnType<typeof setTimeout> | undefined;

    source.addEventListener('bugs', () => {
      clearTimeout(bugsTimer);
      bugsTimer = setTimeout(() => void queryClient.invalidateQueries({ queryKey: ['bugs'] }), 300);
    });
    source.addEventListener('directory', () => {
      clearTimeout(directoryTimer);
      directoryTimer = setTimeout(() => {
        for (const key of [['products'], ['admin'], ['meta']]) void queryClient.invalidateQueries({ queryKey: key });
      }, 300);
    });

    return () => {
      clearTimeout(bugsTimer);
      clearTimeout(directoryTimer);
      source.close();
    };
  }, [enabled, queryClient]);
}
