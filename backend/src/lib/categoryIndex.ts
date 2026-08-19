import type { BugzillaClient } from './bugzillaClient';
import { CATEGORIES, toBugzillaQuery, type Category } from './classification';

/**
 * A cached id-set per category, so a bug's category can be known without
 * fetching its description.
 *
 * Category lives in one of two places: a `[cat:Xxx]` whiteboard tag on bugs the
 * current bench files, or the `Classification:` line inside the description on
 * the 1,283 filed before that change. The whiteboard is returned by a bug
 * search; the description is not - Bugzilla's `GET /bug` never includes it, and
 * fetching comments per row would mean one upstream call per listed bug.
 *
 * Bugzilla can still *search* description text, so instead of reading bodies we
 * ask it once per category which bug ids match, and label rows from the answer.
 * That is four upstream calls to classify the entire product, reused by the bug
 * list and the stats endpoint alike.
 *
 * Cached per user, never globally: bugs can be group-restricted, so the id set
 * one user is allowed to see is not the set another sees. A shared cache would
 * leak the existence of restricted bugs through counts.
 */

export interface CategoryIndex {
  categoryOf(bugId: number): Category;
  /** Ids per category, for the aggregation endpoint. */
  byCategory: Record<Category, Set<number>>;
  builtAt: number;
}

interface CacheEntry {
  builtAt: number;
  promise: Promise<CategoryIndex>;
}

const cache = new Map<number, CacheEntry>();

/** Categories that can actually be searched for; Unclassified is the leftover. */
const SEARCHABLE = CATEGORIES.filter((c) => c !== 'Unclassified');

function emptyIndex(): Record<Category, Set<number>> {
  return Object.fromEntries(CATEGORIES.map((c) => [c, new Set<number>()])) as Record<Category, Set<number>>;
}

async function build(client: BugzillaClient): Promise<CategoryIndex> {
  const byCategory = emptyIndex();

  // One query per category. Each returns ids only, so the payload stays small
  // even when a category covers most of the product.
  const results = await Promise.all(
    SEARCHABLE.map(async (category) => {
      const params = { ...toBugzillaQuery({ category: [category] }), limit: 0, include_fields: 'id' };
      const raw = await client.get<{ bugs: { id: number }[] }>('/bug', params);
      return [category, raw.bugs.map((b) => b.id)] as const;
    })
  );

  for (const [category, ids] of results) {
    for (const id of ids) byCategory[category].add(id);
  }

  const lookup = new Map<number, Category>();
  for (const category of SEARCHABLE) {
    for (const id of byCategory[category]) {
      // First category wins; a bug matching two is vanishingly unlikely and the
      // alternative (throwing) would fail a whole list request over one oddity.
      if (!lookup.has(id)) lookup.set(id, category);
    }
  }

  return {
    byCategory,
    builtAt: Date.now(),
    categoryOf: (bugId: number) => lookup.get(bugId) ?? 'Unclassified',
  };
}

/**
 * The index for this user, rebuilding only when the cached one has expired.
 *
 * The in-flight promise is cached rather than the result, so a burst of
 * requests after expiry shares one rebuild instead of each firing its own four
 * queries. A failed build is evicted so the next request retries rather than
 * caching an error.
 */
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
