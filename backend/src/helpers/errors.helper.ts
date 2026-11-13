/** Typed error contract shared with the frontend. */
export interface ApiErrorBody {
  error: true;
  status: number;
  code: ErrorCode;
  message: string;
  upstream?: { code: number; message: string };
  details?: Record<string, unknown>;
}

export type ErrorCode =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_UNREACHABLE'
  | 'UPSTREAM_ERROR'
  | 'INTERNAL';

type Upstream = { code: number; message: string };
type Details = Record<string, unknown>;

/** 400: the request itself is invalid. */
export const badRequest = (message: string, upstream?: Upstream, details?: Details) =>
  new AppError(400, 'VALIDATION', message, upstream, details);

/** 401: no valid session. */
export const unauthenticated = (message: string, upstream?: Upstream, details?: Details) =>
  new AppError(401, 'UNAUTHENTICATED', message, upstream, details);

/** 403: signed in, but not allowed. */
export const forbidden = (message: string, upstream?: Upstream, details?: Details) =>
  new AppError(403, 'FORBIDDEN', message, upstream, details);

/** 404: the thing asked for does not exist or is not visible to the caller. */
export const notFound = (message: string, upstream?: Upstream, details?: Details) =>
  new AppError(404, 'NOT_FOUND', message, upstream, details);

/** 409: the change conflicts with the current state. */
export const conflict = (message: string, upstream?: Upstream, details?: Details) =>
  new AppError(409, 'CONFLICT', message, upstream, details);

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
    details?: Record<string, unknown>,
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

const BZ_ACCOUNT_LOCKED = /locked out of this account\s+until\s+(.+?),?\s+as you have exceeded/i;

const YOUR_IP_PHRASE = /\byour IP\s*\([^)]*\)/gi;

const IPV4_LITERAL = /\b\d{1,3}(?:\.\d{1,3}){3}\b(?::\d{1,5})?/g;
const IPV6_LITERAL = /\b(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}\b|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:)*[0-9a-f]{1,4}?/gi;

/** Removes network addresses from any text that is about to reach a browser. */
export function scrubNetworkDetail(message: string): string {
  return message
    .replace(YOUR_IP_PHRASE, 'This device')
    .replace(IPV4_LITERAL, 'this device')
    .replace(IPV6_LITERAL, 'this device')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Bugzilla mixes 400/401/404 inconsistently for what are all really client-input problems (see. */
export function mapBugzillaError(httpStatus: number, body: { code?: number; message?: string } | undefined): AppError {
  const bzCode = body?.code;
  const rawMessage = body?.message ?? 'Bugzilla returned an error.';
  const bzMessage = scrubNetworkDetail(rawMessage);
  const upstream = bzCode !== undefined ? { code: bzCode, message: bzMessage } : undefined;

  const locked = BZ_ACCOUNT_LOCKED.exec(rawMessage);
  if (locked) {
    const unlockText = locked[1].trim();
    return new AppError(
      429,
      'RATE_LIMITED',
      'Too many failed sign-in attempts. This account is temporarily locked.',
      upstream,
      {
        unlockAtText: unlockText,
        scope: 'bugzilla-account',
      },
    );
  }

  switch (bzCode) {
    case 101:
      return notFound('That bug could not be found.', upstream);
    case 102:
      return forbidden('You do not have permission to view this bug.', upstream);
    case 106:
      return badRequest('That product does not exist or you are not authorized to file bugs into it.', upstream);
    case 50:
    case 51:
    case 105:
    case 107:
      return badRequest(bzMessage, upstream);
    case 300:
      return unauthenticated('Incorrect email or password.', upstream);
    case 305:
    case 306:
      return unauthenticated('Your session is no longer valid. Please log in again.', upstream);
    case 505:
      return unauthenticated('Please log in to continue.', upstream);
    case 304:
      return forbidden(bzMessage, upstream);
    default:
      if (httpStatus === 401) return unauthenticated(bzMessage, upstream);
      if (httpStatus === 403) return forbidden(bzMessage, upstream);
      if (httpStatus === 404) return notFound(bzMessage, upstream);
      if (httpStatus === 400) return badRequest(bzMessage, upstream);
      return new AppError(502, 'UPSTREAM_ERROR', bzMessage, upstream);
  }
}
