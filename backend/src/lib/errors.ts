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
}

export type ErrorCode =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_UNREACHABLE'
  | 'UPSTREAM_ERROR'
  | 'INTERNAL';

export class AppError extends Error {
  status: number;
  code: ErrorCode;
  upstream?: { code: number; message: string };

  constructor(status: number, code: ErrorCode, message: string, upstream?: { code: number; message: string }) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.upstream = upstream;
  }

  toBody(): ApiErrorBody {
    return {
      error: true,
      status: this.status,
      code: this.code,
      message: this.message,
      ...(this.upstream ? { upstream: this.upstream } : {}),
    };
  }
}

/**
 * Bugzilla mixes 400/401/404 inconsistently for what are all really
 * client-input problems (see API_CONTRACT.md #8). We classify by Bugzilla's
 * own numeric `code` field instead of trusting its HTTP status.
 */
export function mapBugzillaError(httpStatus: number, body: { code?: number; message?: string } | undefined): AppError {
  const bzCode = body?.code;
  const bzMessage = body?.message ?? 'Bugzilla returned an error.';
  const upstream = bzCode !== undefined ? { code: bzCode, message: bzMessage } : undefined;

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
