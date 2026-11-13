import { type Request, type Response } from 'express';
import type { Env } from '../config/app.config';
import { BugzillaClient } from '../clients/bugzilla.client';
import { patchBugSnapshot } from '../services/bugSnapshot.service';

const WATCH_MS = 10_000;
const HEARTBEAT_MS = 25_000;

interface Client {
  res: Response;
  userId: number;
}

const clients = new Set<Client>();

function send(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.res.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

const recentlyAnnounced = new Map<number, number>();
export async function announceBugChange(env: Env, ids: number[]): Promise<void> {
  const now = Date.now();
  for (const id of ids) recentlyAnnounced.set(id, now);
  await patchBugSnapshot(env, ids).catch((err) =>
    console.warn('[live] snapshot patch failed:', err instanceof Error ? err.message : err),
  );
  send('bugs', { ids });
}

/** Products, components, sub-components or people changed (admin screens). */
export function announceDirectoryChange(): void {
  send('directory', {});
}

/** GET /api/events - the stream. */
export const streamEvents = (req: Request, res: Response): void => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 5000\n\n');

  const client: Client = { res, userId: req.sessionUser!.bzUserId };
  clients.add(client);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(client);
  });
};

/** ----------------------------------------------------------------- watcher Asks Bugzilla for bugs. */
export function startChangeWatcher(env: Env): void {
  const client = new BugzillaClient(env.BUGZILLA_URL, { kind: 'api_key', apiKey: env.BUGZILLA_API_KEY });
  let since = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  let seenAtSince = new Set<number>();
  let busy = false;

  const tick = async () => {
    if (busy || clients.size === 0) return;
    busy = true;
    try {
      const response = await client.get<{ bugs: { id: number; last_change_time: string }[] }>('/bug', {
        last_change_time: since,
        include_fields: 'id,last_change_time',
      });
      const bugs = response.bugs ?? [];
      const changed = bugs.filter((bug) => bug.last_change_time > since || !seenAtSince.has(bug.id));
      if (bugs.length) {
        const newest = bugs.reduce(
          (accumulator, bug) => (bug.last_change_time > accumulator ? bug.last_change_time : accumulator),
          since,
        );
        seenAtSince = new Set(bugs.filter((bug) => bug.last_change_time === newest).map((bug) => bug.id));
        if (newest !== since) since = newest;
        else for (const bug of bugs) seenAtSince.add(bug.id);
      }
      const cutoff = Date.now() - 2 * WATCH_MS;
      for (const [id, at] of recentlyAnnounced) if (at < cutoff) recentlyAnnounced.delete(id);
      const external = changed.map((item) => item.id).filter((id) => !recentlyAnnounced.has(id));
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
