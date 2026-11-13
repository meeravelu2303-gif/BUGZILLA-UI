/** Tracks which sessions belong to which user. */
export const MAX_SESSIONS_PER_USER = 3;

export interface TrackedSession {
  sessionId: string;
  deviceId: string;
  createdAt: number;
  lastSeenAt: number;
  userAgent: string;
}

const byUser = new Map<number, Map<string, TrackedSession>>();
const ownerOf = new Map<string, number>();

/** Records a newly authenticated session and returns the sessions pushed out to make room - oldest-used first. */
export function registerSession(userId: number, session: TrackedSession): TrackedSession[] {
  let sessions = byUser.get(userId);
  if (!sessions) {
    sessions = new Map<string, TrackedSession>();
    byUser.set(userId, sessions);
  }

  sessions.set(session.sessionId, session);
  ownerOf.set(session.sessionId, userId);

  if (sessions.size <= MAX_SESSIONS_PER_USER) return [];

  const evicted: TrackedSession[] = [];
  const ordered = [...sessions.values()].sort((left, right) => left.lastSeenAt - right.lastSeenAt);
  while (sessions.size > MAX_SESSIONS_PER_USER) {
    const oldest = ordered.shift();
    if (!oldest) break;
    sessions.delete(oldest.sessionId);
    ownerOf.delete(oldest.sessionId);
    evicted.push(oldest);
  }
  return evicted;
}

/** Marks a session as used now. */
export function touchSession(sessionId: string, now = Date.now()): void {
  const userId = ownerOf.get(sessionId);
  if (userId === undefined) return;
  const tracked = byUser.get(userId)?.get(sessionId);
  if (tracked) tracked.lastSeenAt = now;
}

/** Forgets one session - on explicit logout, or after it has been evicted. */
export function forgetSession(sessionId: string): void {
  const userId = ownerOf.get(sessionId);
  ownerOf.delete(sessionId);
  if (userId === undefined) return;

  const sessions = byUser.get(userId);
  if (!sessions) return;
  sessions.delete(sessionId);
  if (sessions.size === 0) byUser.delete(userId);
}

/** A user's live sessions, most recently used first. */
export function sessionsFor(userId: number): TrackedSession[] {
  return [...(byUser.get(userId)?.values() ?? [])].sort((left, right) => right.lastSeenAt - left.lastSeenAt);
}

/** Test seam. */
export function ensureTracked(session: Omit<TrackedSession, 'lastSeenAt'> & { userId: number }): void {
  if (ownerOf.has(session.sessionId)) return;
  const { userId, ...tracked } = session;
  let sessions = byUser.get(userId);
  if (!sessions) {
    sessions = new Map<string, TrackedSession>();
    byUser.set(userId, sessions);
  }
  sessions.set(tracked.sessionId, { ...tracked, lastSeenAt: Date.now() });
  ownerOf.set(tracked.sessionId, userId);
}

export function resetSessionRegistry(): void {
  byUser.clear();
  ownerOf.clear();
}
