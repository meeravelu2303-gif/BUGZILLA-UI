import type { Env } from '../config/env';
import { BugzillaClient } from './bugzillaClient';

/**
 * Which optional Bugzilla bug fields are switched on for this instance.
 *
 * The editor shows a field only when Bugzilla will accept it: offering a QA
 * contact picker while `useqacontact` is off produces a save that Bugzilla
 * silently ignores, which reads as a bug in this UI.
 *
 * Read on the SERVICE key because Bugzilla returns these parameters only to
 * administrators - an ordinary user's `/parameters` omits every one of them.
 * Only the booleans below leave the backend, never the parameter values.
 */
export interface BugFeatures {
  qaContact: boolean;
  targetMilestone: boolean;
  seeAlso: boolean;
  /** Private comments/attachments need an `insidergroup`; with none, nobody can mark anything private. */
  privateComments: boolean;
  commentTags: boolean;
  /** Largest attachment Bugzilla accepts, in KB. */
  maxAttachmentKb: number;
}

const TTL_MS = 5 * 60 * 1000;
let cached: { at: number; value: BugFeatures } | null = null;
let inflight: Promise<BugFeatures> | null = null;
/** Bugzilla's `urlbase` parameter, read alongside the features above. */
let urlbase: string | null = null;

const FALLBACK: BugFeatures = {
  qaContact: false,
  targetMilestone: false,
  seeAlso: true,
  privateComments: false,
  commentTags: false,
  maxAttachmentKb: 51200,
};

let groupCache: { at: number; names: string[] } | null = null;

/** After a group is renamed or created, so product -> group lookups see it at once. */
export function clearGroupNameCache(): void {
  groupCache = null;
}

/**
 * Every group name on the instance, for mapping a product to its same-named
 * visibility group. Service key for the same reason as the assignee lookup:
 * `Group.get` is refused to anyone without editusers/creategroups.
 */
export async function allGroupNames(env: Env): Promise<string[]> {
  if (groupCache && Date.now() - groupCache.at < TTL_MS) return groupCache.names;
  try {
    const directory = new BugzillaClient(env.BUGZILLA_URL, { kind: 'api_key', apiKey: env.BUGZILLA_API_KEY });
    const resp = await directory.get<{ groups: { name: string }[] }>('/group', { membership: 0 });
    groupCache = { at: Date.now(), names: (resp.groups ?? []).map((g) => g.name) };
    return groupCache.names;
  } catch {
    return groupCache?.names ?? [];
  }
}

export async function bugFeatures(env: Env): Promise<BugFeatures> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const directory = new BugzillaClient(env.BUGZILLA_URL, { kind: 'api_key', apiKey: env.BUGZILLA_API_KEY });
      const { parameters: p } = await directory.get<{ parameters: Record<string, unknown> }>('/parameters');
      const on = (name: string) => String(p[name] ?? '0') === '1';
      const value: BugFeatures = {
        qaContact: on('useqacontact'),
        targetMilestone: on('usetargetmilestone'),
        seeAlso: on('use_see_also'),
        privateComments: String(p.insidergroup ?? '') !== '',
        commentTags: String(p.comment_taggers_group ?? '') !== '',
        maxAttachmentKb: Number(p.maxattachmentsize) || FALLBACK.maxAttachmentKb,
      };
      cached = { at: Date.now(), value };
      urlbase = typeof p.urlbase === 'string' ? p.urlbase : urlbase;
      return value;
    } catch {
      // A failed lookup must not break the bug page; the conservative defaults
      // hide the optional fields rather than offering ones that may be off.
      return cached?.value ?? FALLBACK;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * The address a BROWSER uses to reach native Bugzilla (editparams.cgi,
 * userprefs.cgi, ...), as opposed to BUGZILLA_URL, which is how this server
 * reaches it.
 *
 * The two differ whenever Bugzilla runs on the same machine as the BFF:
 * BUGZILLA_URL is then `http://localhost/rest`, and "localhost" in a colleague's
 * browser is their own computer - so every "Edit in Bugzilla" link opened
 * nothing for anyone but the person at this desk.
 *
 * In order of preference:
 *   1. BUGZILLA_PUBLIC_URL, when set (a domain name, a reverse proxy path);
 *   2. Bugzilla's own `urlbase` parameter - the address Bugzilla already puts in
 *      every email it sends, so app links and mail links can never disagree;
 *   3. BUGZILLA_URL without /rest, so a fresh install still links somewhere.
 */
export async function bugzillaPublicUrl(env: Env): Promise<string> {
  const strip = (u: string) => u.replace(/\/+$/, '');
  if (env.BUGZILLA_PUBLIC_URL) return strip(env.BUGZILLA_PUBLIC_URL);
  await bugFeatures(env);
  if (urlbase && /^https?:\/\/[^/]/i.test(urlbase)) return strip(urlbase);
  return strip(env.BUGZILLA_URL.replace(/\/rest\/?$/, ''));
}
