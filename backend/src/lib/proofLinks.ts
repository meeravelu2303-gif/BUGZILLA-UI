import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed, expiring links to a bug's proof files.
 *
 * The exported sheet is opened by developers who have no Bugzilla login, and a plain
 * `attachment.cgi` link sends them to Bugzilla's "you are not authorized" page. A signed link
 * opens without a login, but only for exactly what it was signed for: the bug (or file) id and
 * the expiry are inside the signature, so a link cannot be edited to reach another bug's files,
 * and it stops working when it expires. Links are only ever minted during an export, by a user
 * who could already read those bugs - the link passes on that user's access, nothing more.
 */
export type ProofLinkKind = 'bug' | 'file';

function keyFrom(secret: string): Buffer {
  // A key of its own, derived from the session secret, so a proof signature is never also a valid
  // session-cookie signature (or the other way round).
  return createHash('sha256').update(`proof-links:${secret}`).digest();
}

function signature(secret: string, kind: ProofLinkKind, id: number, bugId: number, expires: number): string {
  return createHmac('sha256', keyFrom(secret)).update(`${kind}.${id}.${bugId}.${expires}`).digest('base64url');
}

export interface SignedQuery {
  b: string;
  e: string;
  s: string;
}

export function signProof(
  secret: string,
  kind: ProofLinkKind,
  id: number,
  bugId: number,
  expires: number
): SignedQuery {
  return { b: String(bugId), e: String(expires), s: signature(secret, kind, id, bugId, expires) };
}

/** The bug id the link was signed for, or null when the link is forged, edited or expired. */
export function verifyProof(
  secret: string,
  kind: ProofLinkKind,
  id: number,
  query: Partial<Record<keyof SignedQuery, unknown>>,
  now = Date.now()
): number | null {
  const bugId = Number(query.b);
  const expires = Number(query.e);
  const given = typeof query.s === 'string' ? Buffer.from(query.s) : null;
  if (!Number.isInteger(id) || !Number.isInteger(bugId) || !Number.isInteger(expires) || !given) return null;
  if (expires < now) return null;
  const expected = Buffer.from(signature(secret, kind, id, bugId, expires));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return bugId;
}

export function proofQueryString(q: SignedQuery): string {
  return new URLSearchParams({ ...q }).toString();
}

/**
 * The secret proof links are signed with. Dedicated when configured, so the
 * session secret can be rotated (signing everyone out) without voiding every
 * link in every sheet ever exported; otherwise the session secret, as before.
 */
export function proofSecret(env: { PROOF_LINK_SECRET?: string; SESSION_SECRET: string }): string {
  return env.PROOF_LINK_SECRET ?? env.SESSION_SECRET;
}
