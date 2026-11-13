import type { NextFunction, Request, Response } from 'express';
import { BugzillaClient } from '../clients/bugzilla.client';
import { unauthenticated, forbidden } from '../helpers/errors.helper';
import { ensureTracked, touchSession } from '../services/sessionRegistry.service';
import { derivePermissions, userDetailSchema, type Permissions } from '../dto/common.dto';
import type { Env } from '../config/app.config';

/** Requires an active Bugzilla-backed session (see controllers/auth.controller.ts). */
export function requireAuth(env: Env) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const session = req.session;

    if (!session || !session.bzToken || !session.bzUserId) {
      next(unauthenticated('Please log in to continue.'));
      return;
    }

    req.sessionUser = {
      bzUserId: session.bzUserId,
      bzToken: session.bzToken,
      email: String(session.email ?? ''),
      realName: String(session.realName ?? ''),
      permissions: {
        canManageUsers: false,
        canManageProducts: false,
        canTriage: false,
        canReassignAny: false,
        canViewUsers: false,
        canViewProducts: false,
        canCreateComponents: false,
        isReporter: false,
        ...(session.permissions ?? {}),
      },
    };
    req.bugzilla = new BugzillaClient(env.BUGZILLA_URL, { kind: 'token', token: session.bzToken });

    ensureTracked({
      sessionId: req.sessionID,
      userId: session.bzUserId,
      deviceId: String(session.deviceId ?? ''),
      createdAt: Date.now(),
      userAgent: String(req.headers['user-agent'] ?? ''),
    });
    touchSession(req.sessionID);

    if (session.permissions && session.permissions.canReassignAny === undefined) {
      void refreshPermissions(req).finally(() => next());
      return;
    }
    next();
  };
}

async function refreshPermissions(req: Request): Promise<void> {
  try {
    const response = await req.bugzilla!.get<{ users: unknown[] }>(`/user/${req.session.bzUserId}`);
    const permissions = derivePermissions(userDetailSchema.parse(response.users[0]).groups);
    req.session.permissions = permissions;
    req.sessionUser!.permissions = permissions;
    await new Promise<void>((resolve) => req.session.save(() => resolve()));
  } catch {}
}

/** Gates admin-only routes on the permission computed at login time (see derivePermissions in dto/common.dto.ts). */
export function requirePermission(key: keyof Permissions) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.sessionUser?.permissions[key]) {
      next(forbidden('You do not have permission to perform this action.'));
      return;
    }
    next();
  };
}
