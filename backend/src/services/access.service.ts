import type { BugzillaClient } from '../clients/bugzilla.client';
import { holdsProductGroup } from './productGroups.service';

const ADMIN_GROUPS = new Set(['admin', 'editusers']);

const ACCESS_TTL_MS = 5 * 60_000;

/** Everything the access rules need. */
export interface AccessSnapshot {
  products: Array<Record<string, unknown> & { name: string }>;
  names: string[] | null;
  isAdmin: boolean;
}

interface ScopeEntry {
  builtAt: number;
  promise: Promise<AccessSnapshot>;
}

const scopeCache = new Map<number, ScopeEntry>();

type ProductRecord = Record<string, unknown> & { name: string; id?: number };
const productCache = { at: 0, byId: new Map<number, ProductRecord>() };

async function productsByIds(client: BugzillaClient, ids: number[]): Promise<ProductRecord[]> {
  if (Date.now() - productCache.at > ACCESS_TTL_MS) {
    productCache.byId.clear();
    productCache.at = Date.now();
  }
  const missing = ids.filter((id) => !productCache.byId.has(id));
  if (missing.length > 0) {
    const response = await client.get<{ products: ProductRecord[] }>('/product', { ids: missing });
    for (const product of response.products ?? [])
      if (typeof product.id === 'number') productCache.byId.set(product.id, product);
  }
  return ids
    .map((id) => productCache.byId.get(id))
    .filter((productRecord): productRecord is ProductRecord => productRecord !== undefined);
}

/** Drop cached access, for everyone or one user. */
export function clearAccessScope(bzUserId?: number): void {
  if (bzUserId === undefined) {
    scopeCache.clear();
    productCache.byId.clear();
  } else scopeCache.delete(bzUserId);
}

/** The product names the user may see. */
export function accessSnapshot(client: BugzillaClient, bzUserId: number): Promise<AccessSnapshot> {
  const hit = scopeCache.get(bzUserId);
  if (hit && Date.now() - hit.builtAt < ACCESS_TTL_MS) return hit.promise;

  const entry: ScopeEntry = { builtAt: Date.now(), promise: readAccess(client, bzUserId) };
  scopeCache.set(bzUserId, entry);
  entry.promise.catch(() => scopeCache.delete(bzUserId));
  return entry.promise;
}

async function readAccess(client: BugzillaClient, bzUserId: number): Promise<AccessSnapshot> {
  const [enterable, groups] = await Promise.all([
    client.get<{ ids: number[] }>('/product_enterable'),
    client
      .get<{ users: Array<{ groups?: Array<{ name: string }> }> }>('/user', {
        ids: bzUserId,
        groups_membership: 1,
      })
      .then((me) => (me.users[0]?.groups ?? []).map((group) => group.name))
      .catch((): string[] | null => null),
  ]);

  const isAdmin = !groups || groups.some((group) => ADMIN_GROUPS.has(group));
  if (!enterable.ids?.length) return { products: [], names: [], isAdmin };

  const products = await productsByIds(client, enterable.ids);

  if (isAdmin) return { products, names: null, isAdmin };

  const names = products.map((product) => product.name);
  const scoped = names.filter((name) => holdsProductGroup(name, groups));
  return { products, names: scoped.length > 0 ? scoped : names, isAdmin };
}

/** The product names the user may see, or null meaning "do not scope". */
export async function accessibleProductNames(client: BugzillaClient, bzUserId: number): Promise<string[] | null> {
  return (await accessSnapshot(client, bzUserId)).names;
}

/** Constrains a Bugzilla /bug query object to the caller's accessible products. */
export async function scopeToAccessibleProducts(
  params: Record<string, unknown>,
  client: BugzillaClient,
  bzUserId: number,
): Promise<void> {
  if (params.product !== undefined) return;
  const names = await accessibleProductNames(client, bzUserId);
  if (names) params.product = names;
}
