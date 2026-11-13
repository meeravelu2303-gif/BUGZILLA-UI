import type { BugzillaClient } from '../clients/bugzilla.client';
import { CATEGORIES, toBugzillaQuery, type Category } from './classification.service';

/** A cached id-set per category, so a bug's category can be known without fetching its description. */
export interface CategoryIndex {
  categoryOf(bugId: number): Category;
  byCategory: Record<Category, Set<number>>;
  builtAt: number;
}

interface CacheEntry {
  builtAt: number;
  promise: Promise<CategoryIndex>;
}

const cache = new Map<number, CacheEntry>();

const SEARCHABLE = CATEGORIES.filter((category) => category !== 'Unclassified');

function emptyIndex(): Record<Category, Set<number>> {
  return Object.fromEntries(CATEGORIES.map((category) => [category, new Set<number>()])) as Record<
    Category,
    Set<number>
  >;
}

async function build(client: BugzillaClient): Promise<CategoryIndex> {
  const byCategory = emptyIndex();

  const [tagged, legacy] = await Promise.all([
    Promise.all(
      SEARCHABLE.map(async (category) => {
        const params = {
          f1: 'status_whiteboard',
          o1: 'substring',
          v1: `[cat:${category}]`,
          limit: 0,
          include_fields: 'id',
        };
        const raw = await client.get<{ bugs: { id: number }[] }>('/bug', params);
        return [category, raw.bugs.map((bug) => bug.id)] as const;
      }),
    ),
    Promise.all(
      SEARCHABLE.map(async (category) => {
        const params = { ...toBugzillaQuery({ category: [category] }), limit: 0, include_fields: 'id' };
        const raw = await client.get<{ bugs: { id: number }[] }>('/bug', params);
        return [category, raw.bugs.map((bug) => bug.id)] as const;
      }),
    ),
  ]);

  const lookup = new Map<number, Category>();
  for (const [category, ids] of tagged) {
    for (const id of ids) if (!lookup.has(id)) lookup.set(id, category);
  }
  for (const [category, ids] of legacy) {
    for (const id of ids) if (!lookup.has(id)) lookup.set(id, category);
  }

  for (const [id, category] of lookup) byCategory[category].add(id);

  return {
    byCategory,
    builtAt: Date.now(),
    categoryOf: (bugId: number) => lookup.get(bugId) ?? 'Unclassified',
  };
}

/** The index for this user, rebuilding only when the cached one has expired. */
export function getCategoryIndex(client: BugzillaClient, userId: number, ttlMs: number): Promise<CategoryIndex> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.builtAt < ttlMs) return hit.promise;

  const entry: CacheEntry = { builtAt: Date.now(), promise: build(client) };
  cache.set(userId, entry);
  entry.promise.catch(() => cache.delete(userId));
  return entry.promise;
}

/** Test seam, and used when a write invalidates what the index knows. */
export function clearCategoryIndex(): void {
  cache.clear();
}
