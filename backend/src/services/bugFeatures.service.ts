import type { Env } from '../config/app.config';
import { BugzillaClient } from '../clients/bugzilla.client';

/** Which optional Bugzilla bug fields are switched on for this instance. */
export interface BugFeatures {
  qaContact: boolean;
  targetMilestone: boolean;
  seeAlso: boolean;
  privateComments: boolean;
  commentTags: boolean;
  maxAttachmentKb: number;
}

const TTL_MS = 5 * 60 * 1000;
let cached: { at: number; value: BugFeatures } | null = null;
let inflight: Promise<BugFeatures> | null = null;
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

/** Every group name on the instance, for mapping a product to its same-named visibility group. */
export async function allGroupNames(env: Env): Promise<string[]> {
  if (groupCache && Date.now() - groupCache.at < TTL_MS) return groupCache.names;
  try {
    const directory = new BugzillaClient(env.BUGZILLA_URL, { kind: 'api_key', apiKey: env.BUGZILLA_API_KEY });
    const response = await directory.get<{ groups: { name: string }[] }>('/group', { membership: 0 });
    groupCache = { at: Date.now(), names: (response.groups ?? []).map((group) => group.name) };
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
      const { parameters: bugzillaParameters } = await directory.get<{ parameters: Record<string, unknown> }>(
        '/parameters',
      );
      const on = (name: string) => String(bugzillaParameters[name] ?? '0') === '1';
      const value: BugFeatures = {
        qaContact: on('useqacontact'),
        targetMilestone: on('usetargetmilestone'),
        seeAlso: on('use_see_also'),
        privateComments: String(bugzillaParameters.insidergroup ?? '') !== '',
        commentTags: String(bugzillaParameters.comment_taggers_group ?? '') !== '',
        maxAttachmentKb: Number(bugzillaParameters.maxattachmentsize) || FALLBACK.maxAttachmentKb,
      };
      cached = { at: Date.now(), value };
      urlbase = typeof bugzillaParameters.urlbase === 'string' ? bugzillaParameters.urlbase : urlbase;
      return value;
    } catch {
      return cached?.value ?? FALLBACK;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** The address a BROWSER uses to reach native Bugzilla (editparams.cgi. */
export async function bugzillaPublicUrl(env: Env): Promise<string> {
  const strip = (value: string) => value.replace(/\/+$/, '');
  if (env.BUGZILLA_PUBLIC_URL) return strip(env.BUGZILLA_PUBLIC_URL);
  await bugFeatures(env);
  if (urlbase && /^https?:\/\/[^/]/i.test(urlbase)) return strip(urlbase);
  return strip(env.BUGZILLA_URL.replace(/\/rest\/?$/, ''));
}
