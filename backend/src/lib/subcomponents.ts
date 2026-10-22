import type { Env } from '../config/env';
import { AppError } from './errors';
import { clearMemo, memo } from './memo';
import { directoryClient } from './productTransfer';

/**
 * Sub-components: a second level under a product's components.
 *
 * Bugzilla has no such level, so it is a custom single-select field,
 * `cf_subcomponent`, whose value list is controlled by Component - each value
 * belongs to exactly one component (ops/bugzilla/add-subcomponent-field.pl).
 * Values are created, renamed and removed through the SubComponents Bugzilla
 * extension (ops/bugzilla/extensions/SubComponents), because Bugzilla's REST
 * API has no call for adding field values.
 *
 * STORED VALUE. Bugzilla keeps one value list per field, unique across it, but
 * two components may both want a "Login". So a value is stored as
 * `<name> [<component id>]` - unique, and unaffected by renaming the
 * component. Everything user-facing shows `<name>` only; the stored value is
 * what travels in filters and on bugs, so it is never ambiguous.
 *
 * `---` is Bugzilla's "none" value, which every existing bug carries.
 */

export const SUBCOMPONENT_FIELD = 'cf_subcomponent';
export const NO_SUBCOMPONENT = '---';
/** Longest name accepted: the stored value adds ` [<id>]` and Bugzilla caps values at 64. */
export const SUBCOMPONENT_NAME_MAX = 48;

export interface Subcomponent {
  id: number;
  /** The stored value, `<name> [<component id>]`. */
  value: string;
  name: string;
  componentId: number;
  isActive: boolean;
  sortkey: number;
}

/** The display name of a stored value; '' for none. */
export function subcomponentName(value: string | undefined | null): string {
  if (!value || value === NO_SUBCOMPONENT) return '';
  return value.replace(/\s*\[\d+\]$/, '');
}

const CACHE = 'subcomponents';
const TTL = 5 * 60 * 1000;

interface RawSub {
  id: number | string;
  value: string;
  name: string;
  component_id: number | string;
  is_active: boolean | number | string;
  sortkey: number | string;
}

/**
 * Every sub-component, read on the service key and memoized for five minutes
 * (cleared by every write below). Empty - never an error - when the field or
 * the extension is not installed, so the rest of the app keeps working.
 */
export function getSubcomponents(env: Env): Promise<Subcomponent[]> {
  return memo(CACHE, 'all', TTL, async () => {
    const resp = await directoryClient(env).get<{ subcomponents: RawSub[] }>('/subcomponent');
    return (resp.subcomponents ?? [])
      .map((s) => ({
        id: Number(s.id),
        value: s.value,
        name: s.name,
        componentId: Number(s.component_id),
        isActive: s.is_active === true || s.is_active === 1 || s.is_active === '1',
        sortkey: Number(s.sortkey) || 0,
      }))
      .sort((a, b) => a.sortkey - b.sortkey || a.name.localeCompare(b.name));
  }).catch((err) => {
    console.warn('[subcomponents] list unavailable:', err instanceof Error ? err.message : err);
    return [];
  });
}

export function clearSubcomponents(): void {
  clearMemo(CACHE);
}

/** Sub-components grouped by component id, in display order. */
export function byComponent(list: Subcomponent[]): Map<number, Subcomponent[]> {
  const map = new Map<number, Subcomponent[]>();
  for (const s of list) {
    const bucket = map.get(s.componentId);
    if (bucket) bucket.push(s);
    else map.set(s.componentId, [s]);
  }
  return map;
}

/** A component's id from its product and name, read on the service key (memoized with the list). */
export async function componentIdFor(env: Env, product: string, component: string): Promise<number | null> {
  const resp = await memo(CACHE, `components:${product.toLowerCase()}`, TTL, () =>
    directoryClient(env).get<{ products: Array<{ components?: Array<{ id: number; name: string }> }> }>('/product', {
      names: product,
      include_fields: 'components.id,components.name',
    })
  );
  const hit = resp.products?.[0]?.components?.find((c) => c.name.toLowerCase() === component.toLowerCase());
  return hit ? hit.id : null;
}

/**
 * The value to store for a bug in `product` / `component`, given what the
 * caller sent: '' or `---` clears it; anything else must be an ACTIVE
 * sub-component of exactly that component, or the request is refused.
 */
export async function resolveSubcomponent(env: Env, product: string, component: string, requested: string): Promise<string> {
  const wanted = requested.trim();
  if (!wanted || wanted === NO_SUBCOMPONENT) return NO_SUBCOMPONENT;
  const [all, componentId] = await Promise.all([getSubcomponents(env), componentIdFor(env, product, component)]);
  const hit = all.find((s) => s.value === wanted);
  if (!hit || componentId === null || hit.componentId !== componentId) {
    throw new AppError(400, 'VALIDATION', `"${subcomponentName(wanted)}" is not a sub-component of ${component}.`);
  }
  if (!hit.isActive) {
    throw new AppError(400, 'VALIDATION', `The sub-component "${hit.name}" is no longer in use. Choose another one.`);
  }
  return hit.value;
}

/** Validates a sub-component name before it reaches Bugzilla, so the user gets a readable message. */
export function cleanSubcomponentName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name) throw new AppError(400, 'VALIDATION', 'Enter a sub-component name.');
  if (name.length > SUBCOMPONENT_NAME_MAX) {
    throw new AppError(400, 'VALIDATION', `Sub-component names are limited to ${SUBCOMPONENT_NAME_MAX} characters.`);
  }
  if (/[[\]]/.test(name)) throw new AppError(400, 'VALIDATION', 'Sub-component names cannot contain [ or ].');
  if (name === NO_SUBCOMPONENT) throw new AppError(400, 'VALIDATION', 'That name is reserved.');
  return name;
}

/** Writes through the extension, on the service key. Each clears the cache so the next read is exact. */
export async function createSubcomponent(env: Env, componentId: number, name: string): Promise<Subcomponent> {
  const resp = await directoryClient(env).post<{ subcomponent: RawSub }>('/subcomponent', { component_id: componentId, name });
  clearSubcomponents();
  return (await getSubcomponents(env)).find((s) => s.id === Number(resp.subcomponent.id))!;
}

export async function updateSubcomponent(env: Env, id: number, change: { name?: string; isActive?: boolean }): Promise<void> {
  await directoryClient(env).post('/subcomponent/update', {
    id,
    ...(change.name !== undefined ? { name: change.name } : {}),
    ...(change.isActive !== undefined ? { is_active: change.isActive } : {}),
  });
  clearSubcomponents();
}

export async function removeSubcomponent(env: Env, id: number): Promise<void> {
  await directoryClient(env).post('/subcomponent/remove', { id });
  clearSubcomponents();
}

/** After a product is deleted: drop the sub-components its components left behind. */
export async function purgeOrphanSubcomponents(env: Env): Promise<void> {
  await directoryClient(env)
    .post('/subcomponent/purge', {})
    .catch((err) => console.warn('[subcomponents] purge failed:', err instanceof Error ? err.message : err));
  clearSubcomponents();
}
