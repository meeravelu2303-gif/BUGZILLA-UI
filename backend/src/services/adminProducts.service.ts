import type { Env } from '../config/app.config';
import { getBugSnapshot } from './bugSnapshot.service';
import { notFound } from '../helpers/errors.helper';
import { normalizeProduct, rawProductSchema } from '../dto/product.dto';
import { byComponent, getSubcomponents } from './subcomponents.service';

export async function bugCountsByProduct(env: Env) {
  const snapshot = await getBugSnapshot(env);
  const counts = new Map<string, number>();
  for (const row of snapshot.rows) {
    const key = row.product.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export async function fetchProduct(
  client: { get<T>(path: string, params?: Record<string, unknown>): Promise<T> },
  id: number,
  env: Env,
) {
  const [response, subcomponents] = await Promise.all([
    client.get<{ products: unknown[] }>('/product', { ids: [id] }),
    getSubcomponents(env),
  ]);
  const raw = response.products[0];
  if (!raw) throw notFound('That product could not be found.');
  return normalizeProduct(rawProductSchema.parse(raw), byComponent(subcomponents));
}

export async function bugCountsBySubcomponent(env: Env) {
  const snapshot = await getBugSnapshot(env);
  const counts = new Map<string, number>();
  for (const row of snapshot.rows) {
    counts.set(row.subcomponent, (counts.get(row.subcomponent) ?? 0) + 1);
    const key = componentCountKey(row.product, row.component);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function componentCountKey(product: string, component: string) {
  return `component:${product.toLowerCase()}::${component.toLowerCase()}`;
}

export function withSubcomponentCounts<P extends ReturnType<typeof normalizeProduct>>(
  product: P,
  counts: Map<string, number>,
) {
  return {
    ...product,
    components: product.components.map((component) => ({
      ...component,
      bugCount: counts.get(componentCountKey(product.name, component.name)) ?? 0,
      subcomponents: component.subcomponents.map((subcomponent) => ({
        ...subcomponent,
        bugCount: counts.get(subcomponent.value) ?? 0,
      })),
    })),
  };
}

export const findSubcomponent = (product: Awaited<ReturnType<typeof fetchProduct>>, subcomponentId: number) => {
  for (const component of product.components) {
    const subcomponent = component.subcomponents.find((x) => x.id === subcomponentId);
    if (subcomponent) return { component, sub: subcomponent };
  }
  throw notFound('That sub-component could not be found in this product.');
};
