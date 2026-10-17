import { mkdirSync, promises as fs } from 'node:fs';
import path from 'node:path';
import session, { type SessionData } from 'express-session';
import type { Env } from '../config/env';

/**
 * Where sessions live.
 *
 *   memory  express-session's MemoryStore. Lost on restart, single process,
 *           grows without bound. Development only; the server warns.
 *   file    One JSON file per session under SESSION_DIR, written atomically,
 *           expired entries swept every ten minutes. Survives restarts with
 *           no extra infrastructure. The default for a single-server install.
 *   redis   connect-redis over ioredis at REDIS_URL. Required to run more than
 *           one BFF process, and the right choice once Redis exists anyway.
 *
 * Whatever the store, the cookie carries only an opaque signed id - the user's
 * Bugzilla token never leaves the server.
 */
export async function createSessionStore(env: Env): Promise<session.Store | undefined> {
  switch (env.SESSION_STORE) {
    case 'memory':
      console.warn('[session] SESSION_STORE=memory: sessions are lost on restart and cannot be shared. Use "file" or "redis" in production.');
      return undefined;
    case 'file': {
      const dir = env.SESSION_DIR ?? path.resolve(process.cwd(), '.sessions');
      mkdirSync(dir, { recursive: true });
      console.log(`[session] file store at ${dir}`);
      return new FileSessionStore(dir);
    }
    case 'redis': {
      // Loaded lazily so the file/memory stores need no Redis client installed or running.
      const [{ default: RedisStore }, { default: Redis }] = await Promise.all([import('connect-redis'), import('ioredis')]);
      const client = new Redis(env.REDIS_URL!, { lazyConnect: false, maxRetriesPerRequest: 3 });
      client.on('error', (err: Error) => console.error('[session] redis error:', err.message));
      console.log('[session] redis store');
      return new RedisStore({ client, prefix: 'bzui:sess:' });
    }
  }
}

/** The on-disk shape: the session plus an absolute expiry, so a sweep needs no parsing of cookie data. */
interface StoredSession {
  expires: number;
  data: SessionData;
}

const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
/** express-session ids are base64url; anything else is refused before it can touch a path. */
const SID_SHAPE = /^[A-Za-z0-9_-]{8,128}$/;

/** A touch within this window after the last write is a no-op: the expiry moved by seconds, not hours. */
const TOUCH_COALESCE_MS = 60_000;
/** Windows refuses to replace a file another handle is reading at that instant; a short retry clears it. */
const RENAME_RETRIES = 6;
const RENAME_RETRY_MS = 25;

export class FileSessionStore extends session.Store {
  private readonly sweeper: NodeJS.Timeout;
  /** Writes to one session are serialised; a page load fires several requests that all touch the same session. */
  private readonly queues = new Map<string, Promise<void>>();
  private readonly lastWrite = new Map<string, number>();
  private seq = 0;

  constructor(private readonly dir: string) {
    super();
    this.sweeper = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.sweeper.unref();
    void this.sweep();
  }

  private file(sid: string): string | null {
    return SID_SHAPE.test(sid) ? path.join(this.dir, `${sid}.json`) : null;
  }

  /** Runs `task` after every earlier write for the same session has finished. */
  private enqueue(sid: string, task: () => Promise<void>): Promise<void> {
    const prev = this.queues.get(sid) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(task);
    this.queues.set(sid, next);
    void next.finally(() => {
      if (this.queues.get(sid) === next) this.queues.delete(sid);
    });
    return next;
  }

  private async writeAtomic(file: string, stored: StoredSession): Promise<void> {
    // pid + a counter: two writes in the same millisecond must never share a temp name.
    const tmp = `${file}.${process.pid}.${++this.seq}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(stored), { mode: 0o600 });
    for (let attempt = 1; ; attempt++) {
      try {
        await fs.rename(tmp, file);
        return;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if ((code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') && attempt < RENAME_RETRIES) {
          await new Promise((r) => setTimeout(r, RENAME_RETRY_MS * attempt));
          continue;
        }
        await fs.unlink(tmp).catch(() => undefined);
        throw err;
      }
    }
  }

  private expiryOf(data: SessionData, fallbackMs = 8 * 60 * 60 * 1000): number {
    const expires = data.cookie?.expires;
    const at = expires ? new Date(expires).getTime() : NaN;
    return Number.isFinite(at) ? at : Date.now() + fallbackMs;
  }

  get = (sid: string, cb: (err: unknown, session?: SessionData | null) => void): void => {
    const file = this.file(sid);
    if (!file) return cb(null, null);
    fs.readFile(file, 'utf8').then(
      (text) => {
        try {
          const stored = JSON.parse(text) as StoredSession;
          if (stored.expires <= Date.now()) {
            void fs.unlink(file).catch(() => undefined);
            return cb(null, null);
          }
          cb(null, stored.data);
        } catch {
          cb(null, null);
        }
      },
      (err: NodeJS.ErrnoException) => (err.code === 'ENOENT' ? cb(null, null) : cb(err))
    );
  };

  set = (sid: string, data: SessionData, cb?: (err?: unknown) => void): void => {
    const file = this.file(sid);
    if (!file) return cb?.(new Error('invalid session id'));
    const stored: StoredSession = { expires: this.expiryOf(data), data };
    // Write-then-rename so a crash mid-write never leaves a half session behind.
    this.enqueue(sid, async () => {
      await this.writeAtomic(file, stored);
      this.lastWrite.set(sid, Date.now());
    }).then(() => cb?.(), (err) => cb?.(err));
  };

  destroy = (sid: string, cb?: (err?: unknown) => void): void => {
    const file = this.file(sid);
    if (!file) return cb?.();
    this.enqueue(sid, async () => {
      this.lastWrite.delete(sid);
      await fs.unlink(file).catch((err: NodeJS.ErrnoException) => {
        if (err.code !== 'ENOENT') throw err;
      });
    }).then(() => cb?.(), (err) => cb?.(err));
  };

  /**
   * express-session calls this on every request that did not modify the session,
   * to push the expiry forward. Rewriting the file each time is pointless churn
   * (and on Windows, a source of rename collisions), so a touch within a minute
   * of the last write is answered without touching the disk.
   */
  touch = (sid: string, data: SessionData, cb?: (err?: unknown) => void): void => {
    const last = this.lastWrite.get(sid);
    if (last !== undefined && Date.now() - last < TOUCH_COALESCE_MS) return void cb?.();
    this.set(sid, data, cb);
  };

  all = (cb: (err: unknown, obj?: SessionData[] | { [sid: string]: SessionData } | null) => void): void => {
    fs.readdir(this.dir).then(
      async (names) => {
        const out: { [sid: string]: SessionData } = {};
        for (const name of names) {
          if (!name.endsWith('.json')) continue;
          try {
            const stored = JSON.parse(await fs.readFile(path.join(this.dir, name), 'utf8')) as StoredSession;
            if (stored.expires > Date.now()) out[name.slice(0, -5)] = stored.data;
          } catch {
            // A partial or foreign file is simply not a session.
          }
        }
        cb(null, out);
      },
      (err) => cb(err)
    );
  };

  length = (cb: (err: unknown, length?: number) => void): void => {
    this.all((err, obj) => cb(err, obj ? Object.keys(obj).length : 0));
  };

  clear = (cb?: (err?: unknown) => void): void => {
    fs.readdir(this.dir).then(
      async (names) => {
        await Promise.all(names.filter((n) => n.endsWith('.json')).map((n) => fs.unlink(path.join(this.dir, n)).catch(() => undefined)));
        cb?.();
      },
      (err) => cb?.(err)
    );
  };

  /** Removes expired sessions and abandoned temp files. */
  async sweep(): Promise<number> {
    let removed = 0;
    let names: string[];
    try {
      names = await fs.readdir(this.dir);
    } catch {
      return 0;
    }
    for (const name of names) {
      const full = path.join(this.dir, name);
      try {
        if (name.endsWith('.tmp')) {
          const stat = await fs.stat(full);
          if (Date.now() - stat.mtimeMs > 60_000) {
            await fs.unlink(full);
            removed++;
          }
          continue;
        }
        if (!name.endsWith('.json')) continue;
        const stored = JSON.parse(await fs.readFile(full, 'utf8')) as StoredSession;
        if (stored.expires <= Date.now()) {
          await fs.unlink(full);
          removed++;
        }
      } catch {
        // Unreadable or vanished meanwhile - nothing to do.
      }
    }
    return removed;
  }

  close(): void {
    clearInterval(this.sweeper);
  }
}
