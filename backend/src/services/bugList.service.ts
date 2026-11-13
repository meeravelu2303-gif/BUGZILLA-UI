import { type Request } from 'express';
import { accessSnapshot } from './access.service';
import { toBugzillaQuery, type BugFilters } from './classification.service';
import { type SnapshotBug } from './bugSnapshot.service';
import { componentOwnerKey, type ComponentOwners } from '../dto/bug.dto';

export interface StatsRow {
  id: number;
  severity: string;
  priority: string;
  status: string;
  component: string;
  cf_subcomponent?: string;
  product: string;
  resolution?: string;
  whiteboard?: string;
  is_open: boolean;
  assigned_to?: string;
}

export function toCountRow(row: SnapshotBug) {
  return {
    id: row.id,
    is_open: row.isOpen,
    status: row.status,
    severity: row.severity,
    priority: row.priority,
    assigned_to: row.assignedTo,
    product: row.product,
    component: row.component,
  };
}

export function zeroCounts<T extends readonly string[]>(keys: T): Record<T[number], number> {
  return Object.fromEntries(keys.map((k) => [k, 0])) as Record<T[number], number>;
}

const SORT_FIELDS: Record<string, string> = {
  id: 'bug_id',
  priority: 'priority',
  severity: 'bug_severity',
  status: 'bug_status',
  product: 'product',
  component: 'component',
  assigned_to: 'assigned_to',
  last_change_time: 'changeddate',
  creation_time: 'opendate',
  summary: 'short_desc',
  status_whiteboard: 'status_whiteboard',
  importance: 'bug_severity,priority',
};

const DEFAULT_SORT = 'last_change_time';

const TIEBREAKERS = [{ field: 'bug_id', clause: 'bug_id ASC' }];

export function applyBugFilters(params: Record<string, unknown>, query: BugFilters): void {
  Object.assign(params, toBugzillaQuery(query));
}

export function buildOrder(sortBy: string, sortDir: 'asc' | 'desc'): string {
  const sortField = SORT_FIELDS[sortBy] ?? SORT_FIELDS[DEFAULT_SORT];
  const primary =
    sortDir === 'desc'
      ? sortField
          .split(',')
          .map((value) => `${value} DESC`)
          .join(',')
      : sortField;
  const chosen = sortField.split(',');
  return [
    primary,
    ...TIEBREAKERS.filter((tiebreaker) => !chosen.includes(tiebreaker.field)).map((tiebreaker) => tiebreaker.clause),
  ].join(',');
}

export async function componentOwners(req: Request): Promise<ComponentOwners | undefined> {
  try {
    const snapshot = await accessSnapshot(req.bugzilla!, req.sessionUser!.bzUserId);
    const owners: ComponentOwners = new Map();
    for (const product of snapshot.products) {
      const components =
        (product as { components?: Array<{ name?: string; default_assigned_to?: string }> }).components ?? [];
      for (const component of components) {
        if (component.name && component.default_assigned_to) {
          owners.set(componentOwnerKey(product.name, component.name), component.default_assigned_to.toLowerCase());
        }
      }
    }
    return owners;
  } catch {
    return undefined;
  }
}

export function isQueued(
  bug: { product: string; component: string; assignedTo?: { email: string } | null },
  owners: ComponentOwners,
): boolean {
  const owner = owners.get(componentOwnerKey(bug.product, bug.component));
  return owner !== undefined && owner === (bug.assignedTo?.email ?? '').toLowerCase();
}
