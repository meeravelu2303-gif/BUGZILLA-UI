import { AppError, mapBugzillaError } from './errors';

/**
 * Bugzilla client.
 *
 * ## Why JSON-RPC underneath a REST-shaped API
 *
 * Every caller in this codebase speaks Bugzilla's REST paths (`GET /bug/{id}`,
 * `PUT /bug/{id}`, …). That stays. What changed is the wire: calls are sent to
 * Bugzilla's JSON-RPC endpoint (`POST /jsonrpc.cgi`) with the credential in the
 * request BODY, never in the URL.
 *
 * Bugzilla 5.2's REST transport only accepts a token or API key as a query
 * parameter (`?token=…`, `?api_key=…`) - it has no `X-BUGZILLA-*` header
 * support (that arrived later, in the Harmony branch) and it deliberately
 * refuses cookie/body credentials on GET. Query strings are written to the web
 * server's access log, so under REST every request logged a live credential.
 * JSON-RPC is the same WebService methods (`Bug.get`, `Bug.update`, …) that
 * the REST resources dispatch to, reached with a POST body - which the access
 * log does not record.
 *
 * `restToRpc` below is the dispatch table Bugzilla's own REST layer uses
 * (Bugzilla/WebService/Server/REST/Resources/*.pm), inverted. It covers every
 * path this codebase uses; an unmapped path fails loudly rather than guessing.
 */

const UPSTREAM_TIMEOUT_MS = 15_000;

export type BugzillaCredential = { kind: 'token'; token: string } | { kind: 'api_key'; apiKey: string };

type QueryValue = string | number | boolean | undefined | null | Array<string | number>;
export type QueryParams = Record<string, QueryValue>;

interface RpcError {
  code?: number;
  message?: string;
}

interface RpcResponse {
  id?: unknown;
  result?: unknown;
  error?: RpcError | null;
}

/** `http://host/rest` (the REST base this app is configured with) -> `http://host/jsonrpc.cgi`. */
export function jsonRpcUrlFor(restBase: string): string {
  return restBase.replace(/\/+$/, '').replace(/\/rest$/, '') + '/jsonrpc.cgi';
}

/**
 * REST accepts `include_fields=id,summary` and `ids=1,2`; the WebService methods
 * underneath want arrays. REST's own server does this split (REST.pm), so the
 * adapter does it too - callers keep passing what they always passed.
 */
const FIELD_LISTS = new Set(['include_fields', 'exclude_fields']); // REST splits these on commas or whitespace
const ID_LISTS = new Set(['ids', 'id', 'comment_ids', 'attachment_ids']); // comma-joined ids, as callers pass them
const NAME_LISTS = new Set(['names']); // never split: "KPost UI" is one name

function normaliseParams(params: QueryParams): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (FIELD_LISTS.has(key)) {
      out[key] = (Array.isArray(value) ? value : String(value).split(/[\s,]+/)).map(String).filter(Boolean);
    } else if (ID_LISTS.has(key)) {
      // Bug ids are numbers in the WebService API; an alias stays a string.
      const list = Array.isArray(value) ? value : String(value).split(/\s*,\s*/).filter(Boolean);
      out[key] = list.map((v) => (/^\d+$/.test(String(v)) ? Number(v) : String(v)));
    } else if (NAME_LISTS.has(key)) {
      out[key] = (Array.isArray(value) ? value : [value]).map(String);
    } else {
      out[key] = value;
    }
  }
  return out;
}

const toId = (s: string) => (/^\d+$/.test(s) ? Number(s) : s);

/**
 * REST path -> WebService method + params. Path parameters become the method
 * parameters the REST resource would have set; an explicit `ids` in the body or
 * query still wins, exactly as in REST ("body overrides path").
 */
export function restToRpc(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  params: Record<string, unknown>
): { rpcMethod: string; rpcParams: Record<string, unknown> } {
  const p = path.replace(/^\/+/, '');
  const seg = p.split('/').map(decodeURIComponent);
  const with_ = (extra: Record<string, unknown>) => ({ ...extra, ...params });
  const ids = (s: string) => with_({ ids: [toId(s)] });

  if (method === 'GET') {
    if (p === 'version') return { rpcMethod: 'Bugzilla.version', rpcParams: params };
    if (p === 'parameters') return { rpcMethod: 'Bugzilla.parameters', rpcParams: params };
    if (p === 'bug') return { rpcMethod: 'Bug.search', rpcParams: params };
    if (seg[0] === 'bug' && seg.length === 2) return { rpcMethod: 'Bug.get', rpcParams: ids(seg[1]) };
    if (seg[0] === 'bug' && seg[2] === 'comment' && seg.length === 3) {
      // `/bug/{id}/comment?ids=…` batches: the path id plus any extra ids, de-duplicated.
      const extra = Array.isArray(params.ids) ? (params.ids as unknown[]) : [];
      const { ids: _drop, ...rest } = params;
      return { rpcMethod: 'Bug.comments', rpcParams: { ...rest, ids: [...new Set([toId(seg[1]), ...extra.map((v) => toId(String(v)))])] } };
    }
    if (seg[0] === 'bug' && seg[1] === 'comment' && seg[2] === 'tags' && seg.length === 4) {
      return { rpcMethod: 'Bug.search_comment_tags', rpcParams: with_({ query: seg[3] }) };
    }
    if (seg[0] === 'bug' && seg[1] === 'comment' && seg.length === 3) {
      return { rpcMethod: 'Bug.comments', rpcParams: with_({ comment_ids: [toId(seg[2])] }) };
    }
    if (seg[0] === 'bug' && seg[2] === 'attachment' && seg.length === 3) {
      const extra = Array.isArray(params.ids) ? (params.ids as unknown[]) : [];
      const { ids: _drop, ...rest } = params;
      return { rpcMethod: 'Bug.attachments', rpcParams: { ...rest, ids: [...new Set([toId(seg[1]), ...extra.map((v) => toId(String(v)))])] } };
    }
    if (seg[0] === 'bug' && seg[1] === 'attachment' && seg.length === 3) {
      return { rpcMethod: 'Bug.attachments', rpcParams: with_({ attachment_ids: [toId(seg[2])] }) };
    }
    if (seg[0] === 'bug' && seg[2] === 'history' && seg.length === 3) return { rpcMethod: 'Bug.history', rpcParams: ids(seg[1]) };
    if (p === 'field/bug') return { rpcMethod: 'Bug.fields', rpcParams: params };
    if (seg[0] === 'field' && seg[1] === 'bug' && seg.length === 3) return { rpcMethod: 'Bug.fields', rpcParams: with_({ names: [seg[2]] }) };
    if (p === 'product_enterable') return { rpcMethod: 'Product.get_enterable_products', rpcParams: params };
    if (p === 'product_accessible') return { rpcMethod: 'Product.get_accessible_products', rpcParams: params };
    if (p === 'product_selectable') return { rpcMethod: 'Product.get_selectable_products', rpcParams: params };
    if (p === 'product') return { rpcMethod: 'Product.get', rpcParams: params };
    if (seg[0] === 'product' && seg.length === 2) return { rpcMethod: 'Product.get', rpcParams: ids(seg[1]) };
    if (p === 'user') return { rpcMethod: 'User.get', rpcParams: params };
    if (seg[0] === 'user' && seg.length === 2) {
      return { rpcMethod: 'User.get', rpcParams: /^\d+$/.test(seg[1]) ? ids(seg[1]) : with_({ names: [seg[1]] }) };
    }
    if (p === 'group') return { rpcMethod: 'Group.get', rpcParams: params };
    if (seg[0] === 'group' && seg.length === 2) return { rpcMethod: 'Group.get', rpcParams: ids(seg[1]) };
    if (p === 'classification') return { rpcMethod: 'Classification.get', rpcParams: params };
    if (p === 'flag_type') return { rpcMethod: 'FlagType.get', rpcParams: params };
    // The SubComponents extension (ops/bugzilla/extensions/SubComponents).
    if (p === 'subcomponent') return { rpcMethod: 'SubComponent.list', rpcParams: params };
    // The Teams extension (ops/bugzilla/extensions/Teams).
    if (p === 'team') return { rpcMethod: 'Team.list', rpcParams: params };
  }

  if (method === 'POST') {
    if (p === 'bug') return { rpcMethod: 'Bug.create', rpcParams: params };
    if (seg[0] === 'bug' && seg[2] === 'comment' && seg.length === 3) return { rpcMethod: 'Bug.add_comment', rpcParams: with_({ id: toId(seg[1]) }) };
    if (seg[0] === 'bug' && seg[2] === 'attachment' && seg.length === 3) return { rpcMethod: 'Bug.add_attachment', rpcParams: ids(seg[1]) };
    if (seg[0] === 'bug_user_last_visit' && seg.length === 2) return { rpcMethod: 'BugUserLastVisit.update', rpcParams: ids(seg[1]) };
    if (p === 'component') return { rpcMethod: 'Component.create', rpcParams: params };
    if (p === 'product') return { rpcMethod: 'Product.create', rpcParams: params };
    if (p === 'user') return { rpcMethod: 'User.create', rpcParams: params };
    if (p === 'group') return { rpcMethod: 'Group.create', rpcParams: params };
    if (p === 'flag_type') return { rpcMethod: 'FlagType.create', rpcParams: params };
    if (p === 'subcomponent') return { rpcMethod: 'SubComponent.create', rpcParams: params };
    if (p === 'subcomponent/update') return { rpcMethod: 'SubComponent.update', rpcParams: params };
    if (p === 'subcomponent/remove') return { rpcMethod: 'SubComponent.remove', rpcParams: params };
    if (p === 'subcomponent/purge') return { rpcMethod: 'SubComponent.purge_orphans', rpcParams: params };
    if (p === 'subcomponent/component/remove') return { rpcMethod: 'SubComponent.remove_component', rpcParams: params };
    if (p === 'subcomponent/component/update') return { rpcMethod: 'SubComponent.update_component', rpcParams: params };
    if (p === 'subcomponent/product/setup') return { rpcMethod: 'SubComponent.setup_product_access', rpcParams: params };
    if (p === 'team') return { rpcMethod: 'Team.create', rpcParams: params };
    if (p === 'team/update') return { rpcMethod: 'Team.update', rpcParams: params };
    if (p === 'team/remove') return { rpcMethod: 'Team.remove', rpcParams: params };
    // The AttachmentDelete extension (ops/bugzilla/extensions/AttachmentDelete).
    if (p === 'attachment/remove') return { rpcMethod: 'AttachmentDelete.remove', rpcParams: params };
  }

  if (method === 'PUT') {
    if (seg[0] === 'bug' && seg[1] === 'attachment' && seg.length === 3) return { rpcMethod: 'Bug.update_attachment', rpcParams: ids(seg[2]) };
    if (seg[0] === 'bug' && seg[1] === 'comment' && seg[3] === 'tags' && seg.length === 4) {
      return { rpcMethod: 'Bug.update_comment_tags', rpcParams: with_({ comment_id: toId(seg[2]) }) };
    }
    if (seg[0] === 'bug' && seg.length === 2) return { rpcMethod: 'Bug.update', rpcParams: ids(seg[1]) };
    if (seg[0] === 'product' && seg.length === 2) return { rpcMethod: 'Product.update', rpcParams: ids(seg[1]) };
    if (seg[0] === 'user' && seg.length === 2) return { rpcMethod: 'User.update', rpcParams: ids(seg[1]) };
    if (seg[0] === 'group' && seg.length === 2) return { rpcMethod: 'Group.update', rpcParams: ids(seg[1]) };
    if (seg[0] === 'flag_type' && seg.length === 2) return { rpcMethod: 'FlagType.update', rpcParams: ids(seg[1]) };
  }

  throw new AppError(500, 'INTERNAL', `No Bugzilla method is mapped for ${method} /${p}.`);
}

/**
 * JSON-RPC answers HTTP 200 with `{error:{code,message}}`. REST would have
 * translated the code into a status; do the same so `mapBugzillaError` keeps
 * its existing, code-first behaviour. Positive codes below 32000 are user
 * errors ("bug does not exist", "invalid key"); 100000+ and negatives are
 * Bugzilla-side faults.
 */
function httpStatusForRpcError(code: number | undefined): number {
  if (code === undefined) return 502;
  if (code >= 100_000 || code < 0) return 502;
  if (code === 101) return 404;
  if (code === 102) return 403;
  return 400;
}

/**
 * One JSON-RPC call. Exported for the login path, which has no credential yet
 * and sends `login`/`password` in the same body position instead.
 */
export async function rpcCall<T>(
  restBase: string,
  method: string,
  params: Record<string, unknown>,
  credential?: BugzillaCredential
): Promise<T> {
  const url = jsonRpcUrlFor(restBase);
  const authed =
    credential === undefined
      ? params
      : credential.kind === 'token'
        ? { ...params, Bugzilla_token: credential.token }
        : { ...params, Bugzilla_api_key: credential.apiKey };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ method, params: [authed], id: 1 }),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new AppError(504, 'UPSTREAM_TIMEOUT', 'Bugzilla did not respond in time.');
    }
    throw new AppError(502, 'UPSTREAM_UNREACHABLE', 'Could not reach the Bugzilla server.');
  } finally {
    clearTimeout(timeout);
  }

  /*
   * Read as text and parse defensively: when Bugzilla cannot reach its own
   * database, Perl serves an HTML "Software error" page with a 200 status, and
   * `response.json()` would surface that as an opaque SyntaxError.
   */
  const text = await response.text();
  let json: RpcResponse;
  try {
    json = text.length > 0 ? (JSON.parse(text) as RpcResponse) : {};
  } catch {
    throw new AppError(
      502,
      'UPSTREAM_ERROR',
      'Bugzilla returned an error page instead of a response. It is most likely misconfigured or cannot reach its database.'
    );
  }

  if (!response.ok) {
    throw mapBugzillaError(response.status, { code: json.error?.code, message: json.error?.message ?? `Bugzilla answered HTTP ${response.status}.` });
  }
  if (json.error) {
    throw mapBugzillaError(httpStatusForRpcError(json.error.code), { code: json.error.code, message: json.error.message });
  }
  return json.result as T;
}

export class BugzillaClient {
  constructor(private readonly baseUrl: string, private readonly credential: BugzillaCredential) {}

  private call<T>(method: 'GET' | 'POST' | 'PUT', path: string, params: QueryParams, body?: unknown): Promise<T> {
    // Body fields first, then query params on top - REST's own precedence.
    const merged: Record<string, unknown> = {
      ...(body && typeof body === 'object' ? (body as Record<string, unknown>) : {}),
      ...normaliseParams(params),
    };
    const { rpcMethod, rpcParams } = restToRpc(method, path, merged);
    return rpcCall<T>(this.baseUrl, rpcMethod, rpcParams, this.credential);
  }

  get<T>(path: string, params: QueryParams = {}): Promise<T> {
    return this.call<T>('GET', path, params);
  }

  post<T>(path: string, body: unknown, params: QueryParams = {}): Promise<T> {
    return this.call<T>('POST', path, params, body);
  }

  put<T>(path: string, body: unknown, params: QueryParams = {}): Promise<T> {
    return this.call<T>('PUT', path, params, body);
  }
}
