import { ExternalLink, Info, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Card } from '../ui/Card';

/**
 * Hosts a native Bugzilla page inside the app shell via an iframe, so admin and
 * preference surfaces that Bugzilla's REST API can't expose never throw the user
 * out to a jarring separate Perl tab.
 *
 * Caveat: many Bugzilla installs send `X-Frame-Options: SAMEORIGIN`, which blocks
 * embedding when the SPA and Bugzilla are on different origins (e.g. the Vite dev
 * server). We can't read that cross-origin, so we always offer an "Open in new
 * tab" escape hatch and surface the caveat plainly.
 */
export function EmbeddedNative({ src, title, blurb }: { src: string; title: string; blurb?: string }) {
  const [loading, setLoading] = useState(true);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/30 px-5 py-3">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
          <p className="text-xs leading-snug text-slate-600">
            This is Bugzilla’s native page, embedded here. If it appears blank, your Bugzilla blocks embedding — use “Open in
            Bugzilla”.
          </p>
        </div>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-white/60 hover:bg-white/90"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open in Bugzilla
        </a>
      </div>
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/40">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        )}
        <iframe
          src={src}
          title={title}
          onLoad={() => setLoading(false)}
          className="h-[calc(100vh-16rem)] w-full bg-white"
        />
      </div>
      {blurb && <p className="border-t border-white/30 px-5 py-3 text-xs text-slate-500">{blurb}</p>}
    </Card>
  );
}
