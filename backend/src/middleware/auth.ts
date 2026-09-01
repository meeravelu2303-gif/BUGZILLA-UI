import type { NextFunction, Request, Response } from 'express';
import { BugzillaClient } from '../lib/bugzillaClient';
import { AppError } from '../lib/errors';
import { touchSession } from '../lib/sessionRegistry';
import type { Permissions } from '../schemas/common';
import type { Env } from '../config/env';

/**
 * Requires an active Bugzilla-backed session (see routes/auth.ts). Attaches
 * req.bugzilla, a BugzillaClient authenticated with the *user's own* session
 * token - never the service API key - so Bugzilla's native per-user group
 * permissions are respected end to end.
 */
export function requireAuth(env: Env) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const session = req.session;

    if (!session || !session.bzToken || !session.bzUserId) {
      next(new AppError(401, 'UNAUTHENTICATED', 'Please log in to continue.'));
      return;
    }

    req.sessionUser = {
      bzUserId: session.bzUserId,
      bzToken: session.bzToken,
      email: String(session.email ?? ''),
      realName: String(session.realName ?? ''),
      /*
       * Defensive default for sessions issued before a permission existed.
       * Every flag defaults to FALSE, including `canTriage` - a session
       * predating that field must not be treated as able to reassign other
       * people's bugs. Signing in again refreshes it from the real groups.
       */
      permissions: {
        canManageUsers: false,
        canManageProducts: false,
        canTriage: false,
        ...(session.permissions ?? {}),
      },
    };
    req.bugzilla = new BugzillaClient(env.BUGZILLA_URL, { kind: 'token', token: session.bzToken });

    /*
     * Mark this session used, so the LRU ordering in sessionRegistry reflects
     * actual activity. Without this the "least recently used" session would
     * really be the least recently *logged in*, and a device someone uses daily
     * could be evicted in favour of one they signed into last week and
     * abandoned.
     */
    touchSession(req.sessionID);
    next();
  };
}

/**
 * Gates admin-only routes on the permission computed at login time (see
 * derivePermissions in schemas/common.ts). This is a fast local UX gate only
 * - the real security backstop is Bugzilla itself, which independently
 * rejects the underlying REST call with error code 304 (mapped to the same
 * 403 FORBIDDEN shape) if this has somehow gone stale mid-session.
 */
export function requirePermission(key: keyof Permissions) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.sessionUser?.permissions[key]) {
      next(new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'));
      return;
    }
    next();
  };
}
