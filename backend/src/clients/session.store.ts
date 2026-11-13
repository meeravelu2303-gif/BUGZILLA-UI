import { mkdirSync, promises as fs } from 'node:fs';
import path from 'node:path';
import session, { type SessionData } from 'express-session';
import type { Env } from '../config/app.config';

/** Where sessions live. */
export async function createSessionStore(env: Env): Promise<session.Store | undefined> {
  switch (env.SESSION_STORE) {
    case 'memory':
      console.warn(
        '[session] SESSION_STORE=memory: sessions are lost on restart and cannot be shared. Use "file" or "redis" in production.',
      );
      return undefined;
    case 'file': {
      const dir = env.SESSION_DIR ?? path.resolve(process.cwd(), '.sessions');
      mkdirSync(dir, { recursive: true });
      console.log(`[session] file store at ${dir}`);
      return new FileSessionStore(dir);
    }
    case 'redis': {
      const [{ default: RedisStore }, { default: Redis }] = await Promise.all([
        import('connect-redis'),
        import('ioredis'),
      ]);
      const client = new Redis(env.REDIS_URL!, { lazyConnect: false, maxRetriesPerRequest: 3 });
      client.on('error', (err: Error) => console.error('[session] redis error:', err.message));
      console.log('[session] redis store');
      return new RedisStore({ client, prefix: 'bzui:sess:' });
    }
  }
}

interface StoredSession {
  expires: number;
  data: SessionData;
}

const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const SID_SHAPE = /^[A-Za-z0-9_-]{8,128}$/;

const TOUCH_COALESCE_MS = 60_000;
const RENAME_RETRIES = 6;
const RENAME_RETRY_MS = 25;

export class FileSessionStore extends session.Store {
  private readonly sweeper: NodeJS.Timeout;
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

  private enqueue(sid: string, task: () => Promise<void>): Promise<void> {
    const previous = this.queues.get(sid) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    this.queues.set(sid, next);
    void next.finally(() => {
      if (this.queues.get(sid) === next) this.queues.delete(sid);
    });
    return next;
  }

  private async writeAtomic(file: string, stored: StoredSession): Promise<void> {
    const temp = `${file}.${process.pid}.${++this.seq}.tmp`;
    await fs.writeFile(temp, JSON.stringify(stored), { mode: 0o600 });
    for (let attempt = 1; ; attempt++) {
      try {
        await fs.rename(temp, file);
        return;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if ((code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') && attempt < RENAME_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, RENAME_RETRY_MS * attempt));
          continue;
        }
        await fs.unlink(temp).catch(() => undefined);
        throw err;
      }
    }
  }

  private expiryOf(data: SessionData, fallbackMs = 8 * 60 * 60 * 1000): number {
    const expires = data.cookie?.expires;
    const at = expires ? new Date(expires).getTime() : NaN;
    return Number.isFinite(at) ? at : Date.now() + fallbackMs;
  }

  get = (sid: string, callback: (err: unknown, session?: SessionData | null) => void): void => {
    const file = this.file(sid);
    if (!file) return callback(null, null);
    fs.readFile(file, 'utf8').then(
      (text) => {
        try {
          const stored = JSON.parse(text) as StoredSession;
          if (stored.expires <= Date.now()) {
            void fs.unlink(file).catch(() => undefined);
            return callback(null, null);
          }
          callback(null, stored.data);
        } catch {
          callback(null, null);
        }
      },
      (err: NodeJS.ErrnoException) => (err.code === 'ENOENT' ? callback(null, null) : callback(err)),
    );
  };

  set = (sid: string, data: SessionData, callback?: (err?: unknown) => void): void => {
    const file = this.file(sid);
    if (!file) return callback?.(new Error('invalid session id'));
    const stored: StoredSession = { expires: this.expiryOf(data), data };
    this.enqueue(sid, async () => {
      await this.writeAtomic(file, stored);
      this.lastWrite.set(sid, Date.now());
    }).then(
      () => callback?.(),
      (err) => callback?.(err),
    );
  };

  destroy = (sid: string, callback?: (err?: unknown) => void): void => {
    const file = this.file(sid);
    if (!file) return callback?.();
    this.enqueue(sid, async () => {
      this.lastWrite.delete(sid);
      await fs.unlink(file).catch((err: NodeJS.ErrnoException) => {
        if (err.code !== 'ENOENT') throw err;
      });
    }).then(
      () => callback?.(),
      (err) => callback?.(err),
    );
  };

  touch = (sid: string, data: SessionData, callback?: (err?: unknown) => void): void => {
    const last = this.lastWrite.get(sid);
    if (last !== undefined && Date.now() - last < TOUCH_COALESCE_MS) return void callback?.();
    this.set(sid, data, callback);
  };

  all = (callback: (err: unknown, object?: SessionData[] | { [sid: string]: SessionData } | null) => void): void => {
    fs.readdir(this.dir).then(
      async (names) => {
        const out: { [sid: string]: SessionData } = {};
        for (const name of names) {
          if (!name.endsWith('.json')) continue;
          try {
            const stored = JSON.parse(await fs.readFile(path.join(this.dir, name), 'utf8')) as StoredSession;
            if (stored.expires > Date.now()) out[name.slice(0, -5)] = stored.data;
          } catch {}
        }
        callback(null, out);
      },
      (err) => callback(err),
    );
  };

  length = (callback: (err: unknown, length?: number) => void): void => {
    this.all((err, object) => callback(err, object ? Object.keys(object).length : 0));
  };

  clear = (callback?: (err?: unknown) => void): void => {
    fs.readdir(this.dir).then(
      async (names) => {
        await Promise.all(
          names
            .filter((name) => name.endsWith('.json'))
            .map((name) => fs.unlink(path.join(this.dir, name)).catch(() => undefined)),
        );
        callback?.();
      },
      (err) => callback?.(err),
    );
  };

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
      } catch {}
    }
    return removed;
  }

  close(): void {
    clearInterval(this.sweeper);
  }
}
