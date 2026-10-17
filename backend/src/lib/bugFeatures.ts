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

const FALLBACK: BugFeatures = {
  qaContact: false,
  targetMilestone: false,
  seeAlso: true,
  privateComments: false,
  commentTags: false,
  maxAttachmentKb: 51200,
};

let groupCache: { at: number; names: string[] } | null = null;

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
