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
  interface SessionData extends Partial<SessionUser> {
    /**
     * The browser install this session belongs to. Paired with express-session's
     * own `sessionID` (this sign-in), it is what lets one account hold several
     * independent sessions: revoking one destroys only that record, so the
     * other devices keep theirs. Server-side only - never sent as a claim.
     */
    deviceId?: string;
  }
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
