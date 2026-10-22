import { Router, type Request, type Response } from 'express';
import type { Env } from '../config/env';
import { requireAuth } from '../middleware/auth';
import { BugzillaClient } from './bugzillaClient';
import { patchBugSnapshot } from './bugSnapshot';

/**
 * Live updates: every signed-in browser keeps one Server-Sent Events stream
 * open (GET /api/events), and is told the moment bugs change, so lists, counts,
 * dashboards and an open bug refresh without anyone pressing reload.
 *
 * Two sources of "bugs changed":
 *
 *   1. Writes through this app - announced as soon as Bugzilla accepts them
 *      (`announceBugChange`, called by the bugs router after every successful
 *      non-GET request).
 *   2. Everything else - the automation benches filing through Bugzilla's API,
 *      Bugzilla's own web pages, scripts - found by a watcher that asks
 *      Bugzilla every WATCH_MS which bugs changed since it last looked. It runs
 *      only while at least one browser is connected.
 *
 * Either way the in-memory bug copy is patched for just those bugs first
 * (lib/bugSnapshot.ts), then browsers are told, so the refetch they make is
 * answered from fresh data in milliseconds.
 *
 * The message carries bug ids only - no titles or content. Each browser then
 * re-reads through its own session, so nobody sees a change to a bug they
 * could not already see.
 */

const WATCH_MS = 10_000;
const HEARTBEAT_MS = 25_000;

interface Client {
  res: Response;
  userId: number;
}

const clients = new Set<Client>();

function send(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) {
    try {
      c.res.write(payload);
    } catch {
      clients.delete(c);
    }
  }
}

/** Bugs changed through this app: patch the copy, then tell every browser. */
const recentlyAnnounced = new Map<number, number>();
export async function announceBugChange(env: Env, ids: number[]): Promise<void> {
  const now = Date.now();
  for (const id of ids) recentlyAnnounced.set(id, now);
  await patchBugSnapshot(env, ids).catch((err) =>
    console.warn('[live] snapshot patch failed:', err instanceof Error ? err.message : err)
  );
  send('bugs', { ids });
}

/** Products, components, sub-components or people changed (admin screens). */
export function announceDirectoryChange(): void {
  send('directory', {});
}

/** GET /api/events - the stream. */
export function eventsRouter(env: Env): Router {
  const router = Router();
  router.get('/', requireAuth(env), (req: Request, res: Response) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    // Reconnect after 5 s if the stream drops (backend restart, network blip).
    res.write('retry: 5000\n\n');

    const client: Client = { res, userId: req.sessionUser!.bzUserId };
    clients.add(client);
    // A comment line now and then keeps proxies from closing an idle stream.
    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
    req.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(client);
    });
  });
  return router;
}

/*
 * ----------------------------------------------------------------- watcher
 *
 * Asks Bugzilla for bugs whose last change is at or after the newest change it
 * has already seen. Bugzilla's `last_change_time` search is indexed, so this
 * is one cheap call every WATCH_MS - and none at all while nobody is connected.
 */
export function startChangeWatcher(env: Env): void {
  const client = new BugzillaClient(env.BUGZILLA_URL, { kind: 'api_key', apiKey: env.BUGZILLA_API_KEY });
  let since = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  let seenAtSince = new Set<number>();
  let busy = false;

  const tick = async () => {
    if (busy || clients.size === 0) return;
    busy = true;
    try {
      const resp = await client.get<{ bugs: { id: number; last_change_time: string }[] }>('/bug', {
        last_change_time: since,
        include_fields: 'id,last_change_time',
      });
      const bugs = resp.bugs ?? [];
      const changed = bugs.filter((b) => b.last_change_time > since || !seenAtSince.has(b.id));
      if (bugs.length) {
        const newest = bugs.reduce((m, b) => (b.last_change_time > m ? b.last_change_time : m), since);
        seenAtSince = new Set(bugs.filter((b) => b.last_change_time === newest).map((b) => b.id));
        if (newest !== since) since = newest;
        else for (const b of bugs) seenAtSince.add(b.id);
      }
      // Changes this app already announced need no second round.
      const cutoff = Date.now() - 2 * WATCH_MS;
      for (const [id, at] of recentlyAnnounced) if (at < cutoff) recentlyAnnounced.delete(id);
      const external = changed.map((b) => b.id).filter((id) => !recentlyAnnounced.has(id));
      if (external.length) {
        await patchBugSnapshot(env, external).catch(() => undefined);
        send('bugs', { ids: external });
      }
    } catch (err) {
      console.warn('[live] change watcher:', err instanceof Error ? err.message : err);
    } finally {
      busy = false;
    }
  };

  setInterval(() => void tick(), WATCH_MS).unref();
}
