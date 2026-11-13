import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Signed, expiring links to a bug's proof files. */
export type ProofLinkKind = 'bug' | 'file';

function keyFrom(secret: string): Buffer {
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
  expires: number,
): SignedQuery {
  return { b: String(bugId), e: String(expires), s: signature(secret, kind, id, bugId, expires) };
}

/** The bug id the link was signed for, or null when the link is forged, edited or expired. */
export function verifyProof(
  secret: string,
  kind: ProofLinkKind,
  id: number,
  query: Partial<Record<keyof SignedQuery, unknown>>,
  now = Date.now(),
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

export function proofQueryString(string: SignedQuery): string {
  return new URLSearchParams({ ...string }).toString();
}

/** The secret proof links are signed with. */
export function proofSecret(env: { PROOF_LINK_SECRET?: string; SESSION_SECRET: string }): string {
  return env.PROOF_LINK_SECRET ?? env.SESSION_SECRET;
}
