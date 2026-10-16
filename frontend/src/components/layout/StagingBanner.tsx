import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '../../api/client';

/**
 * A red bar across every page, and "[STAGING]" in the tab title, when the backend runs with
 * APP_ENV=staging (npm run dev:staging). Driven by the backend, not the build, so it is right
 * whichever way the UI was started - a staging tab must never pass for live.
 */
export function StagingBanner() {
  const { data } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<{ ok: boolean; env?: 'live' | 'staging' }>('/health'),
    staleTime: Infinity,
    retry: false,
  });
  const staging = data?.env === 'staging';

  useEffect(() => {
    if (staging && !document.title.startsWith('[STAGING]')) document.title = `[STAGING] ${document.title}`;
  }, [staging]);

  if (!staging) return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] bg-red-700 py-0.5 text-center text-[11px] font-bold uppercase tracking-[0.2em] text-white shadow"
    >
      Staging — test copy, not the live Bugzilla
    </div>
  );
}
