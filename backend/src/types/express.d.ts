import 'express-session';
import type { BugzillaClient } from '../clients/bugzilla.client';
import type { Permissions } from '../dto/common.dto';

export interface SessionUser {
  bzUserId: number;
  bzToken: string;
  email: string;
  realName: string;
  permissions: Permissions;
}

declare module 'express-session' {
  interface SessionData extends Partial<SessionUser> {
    deviceId?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      bugzilla?: BugzillaClient;
      sessionUser?: SessionUser;
    }
  }
}

export {};
