import { ApiError } from '../api/client';

const YOUR_IP_PHRASE = /\byour IP\s*\([^)]*\)/gi;
const IPV4_LITERAL = /\b\d{1,3}(?:\.\d{1,3}){3}\b(?::\d{1,5})?/g;
const IPV6_LITERAL = /\b(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}\b|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:)*[0-9a-f]{1,4}?/gi;

export function stripNetworkDetail(message: string): string {
  return message
    .replace(YOUR_IP_PHRASE, 'this device')
    .replace(IPV4_LITERAL, 'this device')
    .replace(IPV6_LITERAL, 'this device')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** "in 4 minutes" / "in 45 seconds" — the wait, phrased the way someone waiting would say it. */
export function formatCooldown(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  if (safe < 60) return `in ${safe} second${safe === 1 ? '' : 's'}`;
  const minutes = Math.ceil(safe / 60);
  return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

function formatClockTime(iso: string): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function remainingSeconds(details: { retryAfterSeconds?: number; retryAt?: string } | undefined): number | null {
  if (details?.retryAt) {
    const at = new Date(details.retryAt).getTime();
    if (!Number.isNaN(at)) return Math.max(0, (at - Date.now()) / 1000);
  }
  if (typeof details?.retryAfterSeconds === 'number') return Math.max(0, details.retryAfterSeconds);
  return null;
}

const RATE_LIMITED_FALLBACK = 'Too many failed sign-in attempts. Please wait a few minutes and try again.';

export const INVALID_CREDENTIALS = 'Invalid email or password. Please check your credentials and try again.';

const UNEXPECTED = 'Something went wrong signing you in. Please try again.';

/** The single entry point the sign-in form calls. */
export function getSignInErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return UNEXPECTED;

  if (err.status === 429 || err.code === 'RATE_LIMITED') {
    const seconds = remainingSeconds(err.details);
    if (seconds !== null && seconds > 0) {
      return `Too many failed sign-in attempts. Please try again ${formatCooldown(seconds)}.`;
    }

    const unlockText = err.details?.unlockAtText;
    if (typeof unlockText === 'string' && unlockText.length > 0) {
      const asClock = formatClockTime(unlockText);
      return asClock
        ? `Too many failed sign-in attempts. This account is locked until ${asClock}.`
        : `Too many failed sign-in attempts. This account is locked until ${stripNetworkDetail(unlockText)}.`;
    }

    return seconds === 0 ? 'Too many failed sign-in attempts. You can try again now.' : RATE_LIMITED_FALLBACK;
  }

  if (err.status === 401 || err.code === 'UNAUTHENTICATED') return INVALID_CREDENTIALS;

  if (err.code === 'UPSTREAM_UNREACHABLE' || err.code === 'UPSTREAM_TIMEOUT') {
    return 'Cannot reach the Bugzilla server right now. Please try again shortly.';
  }

  return err.message ? stripNetworkDetail(err.message) : UNEXPECTED;
}

const RESET_UNEXPECTED = 'Something went wrong. Please try again.';

function formatRetryMoment(iso: string): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const time = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (at.toDateString() === today.toDateString()) return `at ${time}`;
  if (at.toDateString() === tomorrow.toDateString()) return `tomorrow at ${time}`;
  return `on ${at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} at ${time}`;
}

/** The forgot / reset password pages' counterpart to getSignInErrorMessage. */
export function getPasswordResetErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return RESET_UNEXPECTED;

  if (err.status === 429 || err.code === 'RATE_LIMITED') {
    const seconds = remainingSeconds(err.details);

    if (err.details?.scope === 'password-reset-daily') {
      const limit = typeof err.details.limit === 'number' ? err.details.limit : 3;
      const at = typeof err.details.retryAt === 'string' ? formatRetryMoment(err.details.retryAt) : null;
      return `Limit reached: ${limit} password reset emails per 24 hours for this address. ${
        at ? `You can request another ${at}.` : 'Please try again later.'
      }`;
    }

    return seconds !== null && seconds > 0
      ? `Too many attempts. Please try again ${formatCooldown(seconds)}.`
      : 'Too many attempts. Please wait a few minutes and try again.';
  }

  if (err.code === 'UPSTREAM_UNREACHABLE' || err.code === 'UPSTREAM_TIMEOUT') {
    return 'Cannot reach the Bugzilla server right now. Please try again shortly.';
  }

  return err.message ? stripNetworkDetail(err.message) : RESET_UNEXPECTED;
}
