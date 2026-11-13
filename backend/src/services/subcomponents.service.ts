import type { Env } from '../config/app.config';
import { badRequest } from '../helpers/errors.helper';
import { clearMemo, memo } from '../helpers/memo.helper';
import { directoryClient } from './productTransfer.service';

/** Sub-components: a second level under a product's components. */
export const SUBCOMPONENT_FIELD = 'cf_subcomponent';
export const NO_SUBCOMPONENT = '---';
/** Longest name accepted: the stored value adds  [<id>] and Bugzilla caps values at 64. */
export const SUBCOMPONENT_NAME_MAX = 48;

export interface Subcomponent {
  id: number;
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

/** Every sub-component, read on the service key and memoized for five minutes (cleared by every write below). */
export function getSubcomponents(env: Env): Promise<Subcomponent[]> {
  return memo(CACHE, 'all', TTL, async () => {
    const response = await directoryClient(env).get<{ subcomponents: RawSub[] }>('/subcomponent');
    return (response.subcomponents ?? [])
      .map((subcomponent) => ({
        id: Number(subcomponent.id),
        value: subcomponent.value,
        name: subcomponent.name,
        componentId: Number(subcomponent.component_id),
        isActive: subcomponent.is_active === true || subcomponent.is_active === 1 || subcomponent.is_active === '1',
        sortkey: Number(subcomponent.sortkey) || 0,
      }))
      .sort((left, right) => left.sortkey - right.sortkey || left.name.localeCompare(right.name));
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
  for (const subcomponent of list) {
    const bucket = map.get(subcomponent.componentId);
    if (bucket) bucket.push(subcomponent);
    else map.set(subcomponent.componentId, [subcomponent]);
  }
  return map;
}

/** A component's id from its product and name, read on the service key (memoized with the list). */
export async function componentIdFor(env: Env, product: string, component: string): Promise<number | null> {
  const response = await memo(CACHE, `components:${product.toLowerCase()}`, TTL, () =>
    directoryClient(env).get<{ products: Array<{ components?: Array<{ id: number; name: string }> }> }>('/product', {
      names: product,
      include_fields: 'components.id,components.name',
    }),
  );
  const hit = response.products?.[0]?.components?.find(
    (candidate) => candidate.name.toLowerCase() === component.toLowerCase(),
  );
  return hit ? hit.id : null;
}

/** The value to store for a bug in product / component. */
export async function resolveSubcomponent(
  env: Env,
  product: string,
  component: string,
  requested: string,
): Promise<string> {
  const wanted = requested.trim();
  if (!wanted || wanted === NO_SUBCOMPONENT) return NO_SUBCOMPONENT;
  const [all, componentId] = await Promise.all([getSubcomponents(env), componentIdFor(env, product, component)]);
  const hit = all.find((subcomponent) => subcomponent.value === wanted);
  if (!hit || componentId === null || hit.componentId !== componentId) {
    throw badRequest(`"${subcomponentName(wanted)}" is not a sub-component of ${component}.`);
  }
  if (!hit.isActive) {
    throw badRequest(`The sub-component "${hit.name}" is no longer in use. Choose another one.`);
  }
  return hit.value;
}

/** Validates a sub-component name before it reaches Bugzilla, so the user gets a readable message. */
export function cleanSubcomponentName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name) throw badRequest('Enter a sub-component name.');
  if (name.length > SUBCOMPONENT_NAME_MAX) {
    throw badRequest(`Sub-component names are limited to ${SUBCOMPONENT_NAME_MAX} characters.`);
  }
  if (/[[\]]/.test(name)) throw badRequest('Sub-component names cannot contain [ or ].');
  if (name === NO_SUBCOMPONENT) throw badRequest('That name is reserved.');
  return name;
}

/** Writes through the extension, on the service key. */
export async function createSubcomponent(env: Env, componentId: number, name: string): Promise<Subcomponent> {
  const response = await directoryClient(env).post<{ subcomponent: RawSub }>('/subcomponent', {
    component_id: componentId,
    name,
  });
  clearSubcomponents();
  return (await getSubcomponents(env)).find((subcomponent) => subcomponent.id === Number(response.subcomponent.id))!;
}

export async function updateSubcomponent(
  env: Env,
  id: number,
  change: { name?: string; isActive?: boolean },
): Promise<void> {
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
