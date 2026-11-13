import type { BugzillaClient } from '../clients/bugzilla.client';

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

/** Resolve login -> display name for the given logins. */
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

async function lookup(client: BugzillaClient, names: readonly string[]): Promise<BugzillaUser[] | null> {
  try {
    const response = await client.get<{ users?: BugzillaUser[] }>('/user', { names: [...names] });
    return response.users ?? [];
  } catch {
    return null;
  }
}

function absorb(users: readonly BugzillaUser[], into: Map<string, string>, now: number): void {
  for (const user of users) {
    const login = user.name ?? user.email;
    if (!login) continue;
    const display = user.real_name?.trim() || login;
    into.set(login, display);
    cache.set(login, { name: display, cachedAt: now });
  }
}

/** Look a login up in a resolved map, falling back to the login itself. */
export function displayNameFor(names: Map<string, string>, login: string): string {
  return names.get(login) ?? login;
}
