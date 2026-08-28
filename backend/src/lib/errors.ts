/**
 * Typed error contract shared with the frontend. Every error response from
 * this BFF has this exact shape - never a raw stack trace or upstream body.
 */
export interface ApiErrorBody {
  error: true;
  status: number;
  code: ErrorCode;
  message: string;
  upstream?: { code: number; message: string };
  /**
   * Machine-readable specifics for errors a client can act on programmatically,
   * rather than only show to a person. Added for RATE_LIMITED, where a caller
   * needs the retry delay and the window's shape to back off correctly - the
   * `Retry-After` header carries the same seconds for clients that read headers.
   *
   * Never carries anything the message does not already say in words: this
   * reaches the browser, so it must not become a side channel for internals.
   */
  details?: Record<string, unknown>;
}

export type ErrorCode =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  /** Well-formed request that conflicts with the resource's current state (HTTP 409). */
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_UNREACHABLE'
  | 'UPSTREAM_ERROR'
  | 'INTERNAL';

export class AppError extends Error {
  status: number;
  code: ErrorCode;
  upstream?: { code: number; message: string };
  details?: Record<string, unknown>;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    upstream?: { code: number; message: string },
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.upstream = upstream;
    this.details = details;
  }

  toBody(): ApiErrorBody {
    return {
      error: true,
      status: this.status,
      code: this.code,
      message: this.message,
      ...(this.upstream ? { upstream: this.upstream } : {}),
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

/*
 * Bugzilla's `account_locked` error, verbatim from
 * template/en/default/global/user-error.html.tmpl:
 *
 *   Your IP ([% ip_addr %]) has been locked out of this account
 *   until [% unlock_at %], as you have exceeded the maximum number
 *   of login attempts.
 *
 * It is not in Bugzilla's WS_ERROR_CODE table, so REST reports it under the
 * generic code 32000 on an HTTP 400 - indistinguishable by code from a dozen
 * ordinary validation failures. Recognising it therefore has to be done on the
 * message, which is why the pattern is anchored on two fixed phrases either
 * side of the variable time rather than on the sentence as a whole.
 *
 * Worth catching precisely because passing it through leaked the client's IP
 * address into the browser, and told a person their account was locked without
 * ever saying by whom or until when in a form the UI could use.
 */
const BZ_ACCOUNT_LOCKED = /locked out of this account\s+until\s+(.+?),?\s+as you have exceeded/i;

/** `Your IP (1.2.3.4)` — the phrase Bugzilla wraps the address in. */
const YOUR_IP_PHRASE = /\byour IP\s*\([^)]*\)/gi;

/*
 * Bare address literals, for anything that reaches us without the phrase above.
 *
 * IPv6 is matched ONLY in forms that cannot be confused with a clock time:
 * anything containing `::`, or a full eight-group address. A naive
 * `(?:[0-9a-f]{0,4}:){2,7}` also matches `11:05:00`, and this scrubber runs over
 * a message whose entire point is to state a time - so the cautious pattern is
 * the correct one, even though it will miss an exotic partial form.
 */
const IPV4_LITERAL = /\b\d{1,3}(?:\.\d{1,3}){3}\b(?::\d{1,5})?/g;
const IPV6_LITERAL = /\b(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}\b|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:)*[0-9a-f]{1,4}?/gi;

/**
 * Removes network addresses from any text that is about to reach a browser.
 *
 * Belt-and-braces against upstream wording changing: the specific lockout case
 * below is rewritten wholesale and never reaches this, but every other
 * pass-through message goes through it so a future Bugzilla string carrying an
 * address cannot quietly start leaking one. An IP tells the person nothing they
 * can act on and tells anyone else on their screen something they should not
 * have.
 */
export function scrubNetworkDetail(message: string): string {
  return message
    .replace(YOUR_IP_PHRASE, 'This device')
    .replace(IPV4_LITERAL, 'this device')
    .replace(IPV6_LITERAL, 'this device')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Bugzilla mixes 400/401/404 inconsistently for what are all really
 * client-input problems (see API_CONTRACT.md #8). We classify by Bugzilla's
 * own numeric `code` field instead of trusting its HTTP status.
 */
export function mapBugzillaError(httpStatus: number, body: { code?: number; message?: string } | undefined): AppError {
  const bzCode = body?.code;
  const rawMessage = body?.message ?? 'Bugzilla returned an error.';
  const bzMessage = scrubNetworkDetail(rawMessage);
  // The upstream block is diagnostic and reaches the browser too, so it is
  // scrubbed on the same terms as the message it accompanies.
  const upstream = bzCode !== undefined ? { code: bzCode, message: bzMessage } : undefined;

  /*
   * Bugzilla's own lockout, reported as OUR rate-limit shape.
   *
   * It is a 429 rather than the 400 Bugzilla sends: the request was well
   * formed and the credentials may well be right - the account is in cooldown,
   * which is precisely what 429 means. That also lets one client-side branch
   * handle both this and the BFF's own limiter instead of two.
   */
  const locked = BZ_ACCOUNT_LOCKED.exec(rawMessage);
  if (locked) {
    const unlockText = locked[1].trim();
    return new AppError(
      429,
      'RATE_LIMITED',
      'Too many failed sign-in attempts. This account is temporarily locked.',
      upstream,
      {
        // Bugzilla renders this with its own `time` filter in the server's
        // locale and timezone, so it is passed through as display text rather
        // than parsed into an instant we cannot reliably reconstruct.
        unlockAtText: unlockText,
        scope: 'bugzilla-account',
      }
    );
  }

  switch (bzCode) {
    case 101: // Bug does not exist
      return new AppError(404, 'NOT_FOUND', 'That bug could not be found.', upstream);
    case 102: // Not authorized to access bug
      return new AppError(403, 'FORBIDDEN', 'You do not have permission to view this bug.', upstream);
    case 106: // Product does not exist or not authorized to enter into it
      return new AppError(400, 'VALIDATION', 'That product does not exist or you are not authorized to file bugs into it.', upstream);
    case 50:
    case 51:
    case 105:
    case 107:
      return new AppError(400, 'VALIDATION', bzMessage, upstream);
    case 300: // invalid login/password
      return new AppError(401, 'UNAUTHENTICATED', 'Incorrect email or password.', upstream);
    case 305: // account disabled
    case 306: // invalid api key
      return new AppError(401, 'UNAUTHENTICATED', 'Your session is no longer valid. Please log in again.', upstream);
    case 505: // logged-out users can't use this
      return new AppError(401, 'UNAUTHENTICATED', 'Please log in to continue.', upstream);
    case 304: // authenticated but missing the required group (editusers/editcomponents/...)
      return new AppError(403, 'FORBIDDEN', bzMessage, upstream);
    default:
      if (httpStatus === 401) return new AppError(401, 'UNAUTHENTICATED', bzMessage, upstream);
      if (httpStatus === 403) return new AppError(403, 'FORBIDDEN', bzMessage, upstream);
      if (httpStatus === 404) return new AppError(404, 'NOT_FOUND', bzMessage, upstream);
      // Bugzilla uses a wide range of numeric codes (500/501/502, 702-704, 1200, 32000, ...)
      // for what are all really client-input validation problems on 400 responses -
      // classify by HTTP status here rather than enumerating every Bugzilla code.
      if (httpStatus === 400) return new AppError(400, 'VALIDATION', bzMessage, upstream);
      return new AppError(502, 'UPSTREAM_ERROR', bzMessage, upstream);
  }
}
