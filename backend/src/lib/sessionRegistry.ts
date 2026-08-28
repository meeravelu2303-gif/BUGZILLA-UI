/**
 * Tracks which sessions belong to which user, so one account can be signed in
 * on several devices at once and the oldest is retired when there are too many.
 *
 * ---------------------------------------------------------------------------
 * What this is NOT
 *
 * There is no JWT here, and no refresh-token rotation. This BFF does not mint
 * tokens: it signs in to Bugzilla, holds Bugzilla's own token server-side in an
 * express-session record, and hands the browser nothing but a signed session
 * id. "Revoking a session" therefore means destroying that server-side record -
 * after which the cookie still exists but resolves to nothing, and requireAuth
 * answers 401. There is no token to blacklist because the browser never had one.
 *
 * Nor is there a database or Redis to hold this: the BFF ships no database
 * driver and runs single-instance (see index.ts), so the registry is an
 * in-process Map alongside the session store it mirrors. Its lifetime is the
 * process's, which is also MemoryStore's - the two cannot drift apart across a
 * restart because both are empty after one.
 *
 * ---------------------------------------------------------------------------
 * Simultaneous devices were ALREADY supported
 *
 * Each browser gets its own session id and its own record, so devices A, B and
 * C were always independent - signing out of one never touched the others, and
 * nothing capped how many could exist. This file does not add multi-device
 * support; it adds a *ceiling* on it, plus the bookkeeping that makes the
 * ceiling evict the least recently used session instead of refusing the login.
 */

/** Sessions one account may hold at once. A 4th login evicts the oldest. */
export const MAX_SESSIONS_PER_USER = 3;

export interface TrackedSession {
  sessionId: string;
  /** Stable per browser install; lets a device be recognised across logins. */
  deviceId: string;
  createdAt: number;
  /** Bumped on every authenticated request - this is the "recently used" in LRU. */
  lastSeenAt: number;
  /** Truncated UA string, so a person can tell their own sessions apart. */
  userAgent: string;
}

/** userId -> that user's live sessions. */
const byUser = new Map<number, Map<string, TrackedSession>>();
/** sessionId -> userId, so a logout can find its owner in one lookup. */
const ownerOf = new Map<string, number>();

/**
 * Records a newly authenticated session and returns the sessions pushed out to
 * make room - oldest-used first.
 *
 * Returning the evicted ids rather than destroying them here keeps this module
 * free of any dependency on express-session: the caller owns the store and
 * destroys them. That also makes the eviction decision testable without one.
 */
export function registerSession(userId: number, session: TrackedSession): TrackedSession[] {
  let sessions = byUser.get(userId);
  if (!sessions) {
    sessions = new Map<string, TrackedSession>();
    byUser.set(userId, sessions);
  }

  sessions.set(session.sessionId, session);
  ownerOf.set(session.sessionId, userId);

  if (sessions.size <= MAX_SESSIONS_PER_USER) return [];

  /*
   * Evict by least-recently-USED, not by oldest-created. A phone signed in
   * three weeks ago but used this morning is a live device; a laptop signed in
   * an hour ago and untouched since is the better thing to retire. Sorting by
   * lastSeenAt is what makes this LRU rather than FIFO.
   *
   * The session just registered carries `lastSeenAt = now`, so it is the most
   * recent by construction and can never evict itself - the new device always
   * gets in, which is the whole point of evicting instead of refusing.
   */
  const evicted: TrackedSession[] = [];
  const ordered = [...sessions.values()].sort((a, b) => a.lastSeenAt - b.lastSeenAt);
  while (sessions.size > MAX_SESSIONS_PER_USER) {
    const oldest = ordered.shift();
    if (!oldest) break;
    sessions.delete(oldest.sessionId);
    ownerOf.delete(oldest.sessionId);
    evicted.push(oldest);
  }
  return evicted;
}

/**
 * Marks a session as used now. Called on every authenticated request, so the
 * LRU order reflects real activity rather than login order.
 *
 * Unknown ids are ignored rather than re-added: after a restart the registry is
 * empty while a cookie may still be presented, and silently resurrecting that
 * session here would let a user exceed the ceiling.
 */
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
  // Drop the empty bucket so a signed-out user leaves nothing behind.
  if (sessions.size === 0) byUser.delete(userId);
}

/** A user's live sessions, most recently used first. */
export function sessionsFor(userId: number): TrackedSession[] {
  return [...(byUser.get(userId)?.values() ?? [])].sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

/** Test seam. Not used by the running server. */
export function resetSessionRegistry(): void {
  byUser.clear();
  ownerOf.clear();
}
