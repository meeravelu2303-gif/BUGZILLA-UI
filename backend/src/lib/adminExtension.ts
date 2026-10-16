import type { BugzillaClient, QueryParams } from './bugzillaClient';
import { AppError } from './errors';

/**
 * Calls into the UeducateAdmin Bugzilla extension (bugzilla-extension/UeducateAdmin), which adds
 * the admin endpoints Bugzilla 5.2's REST API lacks under /rest/ueducate/...
 *
 * The extension can be switched off at any moment with a "disabled" file. Bugzilla then answers
 * every /ueducate path with error 32614 ("REST API resource was not found"), which on its own
 * reads like a bug in this app. It is translated here into a 503 that says what actually happened.
 */
const RESOURCE_NOT_FOUND = 32614;
const PREFIX = '/ueducate';

function translate(err: unknown): never {
  if (err instanceof AppError && err.upstream?.code === RESOURCE_NOT_FOUND) {
    throw new AppError(
      503,
      'UPSTREAM_ERROR',
      'This admin feature needs the UeducateAdmin Bugzilla extension, which is switched off or not installed.'
    );
  }
  throw err;
}

export function adminExtension(client: BugzillaClient) {
  return {
    get: <T>(path: string, params?: QueryParams) => client.get<T>(PREFIX + path, params).catch(translate),
    put: <T>(path: string, body: unknown) => client.put<T>(PREFIX + path, body).catch(translate),
    post: <T>(path: string, body: unknown) => client.post<T>(PREFIX + path, body).catch(translate),
    delete: <T>(path: string) => client.delete<T>(PREFIX + path).catch(translate),
  };
}
