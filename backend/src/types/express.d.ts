import 'express-session';
import type { BugzillaClient } from '../lib/bugzillaClient';
import type { Permissions } from '../schemas/common';

export interface SessionUser {
  bzUserId: number;
  bzToken: string;
  email: string;
  realName: string;
  permissions: Permissions;
}

declare module 'express-session' {
  /**
   * The server-side session record. Held in memory by express-session's
   * MemoryStore - only the signed session id reaches the browser.
   */
  interface SessionData extends Partial<SessionUser> {}
}

declare global {
  namespace Express {
    interface Request {
      /** Present once requireAuth has run; a BugzillaClient authenticated as the current user. */
      bugzilla?: BugzillaClient;
      /** Present once requireAuth has run; the current user's identity. */
      sessionUser?: SessionUser;
    }
  }
}

export {};
