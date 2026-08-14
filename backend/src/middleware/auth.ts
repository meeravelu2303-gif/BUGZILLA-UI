import type { NextFunction, Request, Response } from 'express';
import { BugzillaClient } from '../lib/bugzillaClient';
import { AppError } from '../lib/errors';
import type { Permissions } from '../schemas/common';
import type { SessionUser } from '../types/express';
import type { Env } from '../config/env';

/**
 * Requires an active Bugzilla-backed session (see routes/auth.ts). Attaches
 * req.bugzilla, a BugzillaClient authenticated with the *user's own* session
 * token - never the service API key - so Bugzilla's native per-user group
 * permissions are respected end to end.
 */
export function requireAuth(env: Env) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const session = req.session as (Partial<SessionUser> & Record<string, unknown>) | null | undefined;

    if (!session || !session.bzToken || !session.bzUserId) {
      next(new AppError(401, 'UNAUTHENTICATED', 'Please log in to continue.'));
      return;
    }

    req.sessionUser = {
      bzUserId: session.bzUserId,
      bzToken: session.bzToken,
      email: String(session.email ?? ''),
      realName: String(session.realName ?? ''),
      // Defensive default for sessions issued before permissions existed on the cookie.
      permissions: session.permissions ?? { canManageUsers: false, canManageProducts: false },
    };
    req.bugzilla = new BugzillaClient(env.BUGZILLA_URL, { kind: 'token', token: session.bzToken });
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
