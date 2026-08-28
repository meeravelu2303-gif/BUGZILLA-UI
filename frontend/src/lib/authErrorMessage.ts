import { ApiError } from '../api/client';

/**
 * Turns whatever the sign-in request threw into one sentence a person can act
 * on.
 *
 * Sign-in is the one screen where the error IS the interface: the reader has no
 * navigation, no context, and usually no idea whether the fault is theirs. So
 * the rules here are stricter than elsewhere in the app - say what happened,
 * say what to do, and never surface infrastructure.
 *
 * Kept out of the component so it can be reasoned about (and tested) without
 * rendering a form.
 */

/**
 * Address literals, in case one ever reaches the browser.
 *
 * The backend scrubs these at the source (see `scrubNetworkDetail` in
 * backend/src/lib/errors.ts), and Bugzilla's IP-bearing lockout string is
 * rewritten there wholesale. This is the second layer: a browser that is still
 * talking to an older backend, or a future upstream message nobody anticipated,
 * must not put an IP in front of the user just because the server forgot to.
 *
 * IPv6 is matched only in forms that cannot be a clock time - see the same
 * reasoning on the backend regex. A cooldown message's whole job is to state a
 * time, so a scrubber that eats `4:08 PM` would be worse than one that misses
 * an exotic address form.
 */
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

/**
 * "in 4 minutes" / "in 45 seconds" — the wait, phrased the way someone waiting
 * would say it.
 *
 * Rounds UP, deliberately: telling someone to come back in 4 minutes when 4:30
 * remains earns them a second refusal, which reads as the app being broken.
 * Under a minute is given in seconds rather than rounded up to "1 minute",
 * because "try again in 20 seconds" is worth waiting out and "1 minute" is not.
 */
export function formatCooldown(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  if (safe < 60) return `in ${safe} second${safe === 1 ? '' : 's'}`;
  const minutes = Math.ceil(safe / 60);
  return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/** "4:08 PM" in the reader's own locale and timezone. */
function formatClockTime(iso: string): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * Seconds of cooldown left, preferring the absolute instant over the relative
 * one.
 *
 * `retryAfterSeconds` was correct when the response was generated; if the
 * request sat in flight, or the user stared at the message for a minute before
 * reading it, it is already stale. `retryAt` stays true however long the page
 * has been open, so it wins whenever both are present.
 */
function remainingSeconds(details: { retryAfterSeconds?: number; retryAt?: string } | undefined): number | null {
  if (details?.retryAt) {
    const at = new Date(details.retryAt).getTime();
    if (!Number.isNaN(at)) return Math.max(0, (at - Date.now()) / 1000);
  }
  if (typeof details?.retryAfterSeconds === 'number') return Math.max(0, details.retryAfterSeconds);
  return null;
}

/** Copy for a cooldown whose length we could not determine at all. */
const RATE_LIMITED_FALLBACK =
  'Too many failed sign-in attempts. Please wait a few minutes and try again.';

export const INVALID_CREDENTIALS =
  'Invalid email or password. Please check your credentials and try again.';

const UNEXPECTED = 'Something went wrong signing you in. Please try again.';

/**
 * The single entry point the sign-in form calls.
 *
 * Ordered by how specific the answer can be: a known cooldown, then a known
 * credential rejection, then a scrubbed server sentence, then a generic
 * apology. Anything not recognised still gets its message shown rather than
 * swallowed - a person told "something went wrong" for a fault the server
 * described precisely has been actively unhelped.
 */
export function getSignInErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return UNEXPECTED;

  if (err.status === 429 || err.code === 'RATE_LIMITED') {
    const seconds = remainingSeconds(err.details);
    if (seconds !== null && seconds > 0) {
      return `Too many failed sign-in attempts. Please try again ${formatCooldown(seconds)}.`;
    }

    /*
     * Bugzilla's own account lockout reports an unlock TIME rather than a
     * duration (it has no notion of when we asked). Shown as a clock time,
     * which is what it is - inventing a countdown from it would mean parsing a
     * string rendered in the server's locale and timezone.
     */
    const unlockText = err.details?.unlockAtText;
    if (typeof unlockText === 'string' && unlockText.length > 0) {
      const asClock = formatClockTime(unlockText);
      return asClock
        ? `Too many failed sign-in attempts. This account is locked until ${asClock}.`
        : `Too many failed sign-in attempts. This account is locked until ${stripNetworkDetail(unlockText)}.`;
    }

    // The cooldown elapsed between the response arriving and this render, or
    // the server sent no timing at all.
    return seconds === 0
      ? 'Too many failed sign-in attempts. You can try again now.'
      : RATE_LIMITED_FALLBACK;
  }

  if (err.status === 401 || err.code === 'UNAUTHENTICATED') return INVALID_CREDENTIALS;

  /*
   * Upstream problems are worth naming: "Bugzilla is unreachable" tells the
   * reader to stop retyping their password, which a generic apology does not.
   */
  if (err.code === 'UPSTREAM_UNREACHABLE' || err.code === 'UPSTREAM_TIMEOUT') {
    return 'Cannot reach the Bugzilla server right now. Please try again shortly.';
  }

  return err.message ? stripNetworkDetail(err.message) : UNEXPECTED;
}
