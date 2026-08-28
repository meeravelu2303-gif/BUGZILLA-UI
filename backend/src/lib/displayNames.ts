import type { BugzillaClient } from './bugzillaClient';

/**
 * Turn Bugzilla logins into the names people actually recognise.
 *
 * ## Why this exists
 *
 * Bugzilla is inconsistent about identities, and the inconsistency is visible
 * to users. `GET /bug/:id` embeds `creator_detail` / `assigned_to_detail`
 * objects that carry `real_name`, so the bug header can say "Jaganathan
 * Murthy". But `GET /bug/:id/comment` and `GET /bug/:id/attachment` carry only
 * `creator` — the bare login, `jagan@kpost.in`. Rendering each field as it
 * arrives therefore produced one bug page showing a person's name in the
 * sidebar and their e-mail address on every comment and attachment directly
 * beside it.
 *
 * `GET /user?names=…` is the only place the mapping exists, so this resolves it
 * once per request and hands back a lookup.
 *
 * ## Behaviour
 *
 * - Batched: one `/user` call for every distinct login on the page, not one per
 *   comment.
 * - Cached in-process for `CACHE_TTL_MS`. Real names change roughly never,
 *   while a busy bug is re-fetched constantly.
 * - Never fails a page. Bugzilla restricts `/user` for logged-out or
 *   low-privilege callers, and a bug page that 500s because it could not
 *   prettify a name would be a strictly worse page. Any failure falls back to
 *   the login, which is what was shown before this existed.
 */

const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  readonly name: string;
  readonly cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Exposed for tests: forget everything currently cached. */
export function clearDisplayNameCache(): void {
  cache.clear();
}

interface BugzillaUser {
  readonly name?: string;
  readonly real_name?: string;
  readonly email?: string;
}

/**
 * Resolve `login -> display name` for the given logins.
 *
 * The returned map always has an entry for every login asked for, so callers
 * can look up unconditionally; unknown users map to their own login.
 */
export async function resolveDisplayNames(
  client: BugzillaClient,
  logins: readonly string[],
): Promise<Map<string, string>> {
  const wanted = [...new Set(logins.filter((login) => login && login.trim() !== ''))];
  const resolved = new Map<string, string>();
  const now = Date.now();

  const missing: string[] = [];
  for (const login of wanted) {
    const hit = cache.get(login);
    if (hit && now - hit.cachedAt < CACHE_TTL_MS) resolved.set(login, hit.name);
    else missing.push(login);
  }

  if (missing.length > 0) {
    const found = await lookup(client, missing);
    if (found === null) {
      /*
       * Bugzilla's `/user?names=` is all-or-nothing: ONE unrecognised login
       * fails the entire request with "There is no user named …", and every
       * other name in the batch is lost with it. Verified against the live
       * instance — a batch of two known users resolves, and adding one unknown
       * name to the same batch throws.
       *
       * That matters because a comment can outlive its author: delete or rename
       * a Bugzilla account and one stale login would blank the display name of
       * everyone else on the page. So on a batch failure, ask one at a time —
       * each miss then costs only itself. Bugs have a handful of distinct
       * authors, so this stays cheap, and the results are cached anyway.
       */
      for (const login of missing) {
        const single = await lookup(client, [login]);
        if (single) absorb(single, resolved, now);
      }
    } else {
      absorb(found, resolved, now);
    }
  }

  for (const login of wanted) {
    if (!resolved.has(login)) resolved.set(login, login);
  }
  return resolved;
}

/** One `/user` call. `null` means it failed — not that nobody matched. */
async function lookup(
  client: BugzillaClient,
  names: readonly string[],
): Promise<BugzillaUser[] | null> {
  try {
    const response = await client.get<{ users?: BugzillaUser[] }>('/user', { names: [...names] });
    return response.users ?? [];
  } catch {
    // Swallowed on purpose — see the module header. A page that 500s because it
    // could not prettify a byline is worse than one showing an e-mail address.
    return null;
  }
}

/** Record resolved users into the result map and the cache. */
function absorb(users: readonly BugzillaUser[], into: Map<string, string>, now: number): void {
  for (const user of users) {
    const login = user.name ?? user.email;
    if (!login) continue;
    // `real_name` is optional and often empty; a blank byline is worse than an
    // e-mail address, so fall back rather than render nothing.
    const display = user.real_name?.trim() || login;
    into.set(login, display);
    cache.set(login, { name: display, cachedAt: now });
  }
}

/** Look a login up in a resolved map, falling back to the login itself. */
export function displayNameFor(names: Map<string, string>, login: string): string {
  return names.get(login) ?? login;
}
