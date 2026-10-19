import { useCallback, useEffect, useState } from 'react';
import { useMe } from '../api/hooks';
import type { Permissions } from '../types';

/**
 * Which dashboard a person sees.
 *
 * Bugzilla has no concept of a "role" - it has groups, and the BFF already
 * reduces those to three capability flags (schemas/common.ts). So the role is
 * DERIVED from permissions rather than stored anywhere, which means it cannot
 * drift out of step with what the server will actually allow. A dashboard that
 * claimed a role the backend disagreed with would offer actions that then fail.
 *
 *   admin      canManageUsers || canManageProducts  (editusers / editcomponents)
 *   qa         canTriage                            (canconfirm - confirms and triages)
 *   developer  everything else                      (editbugs - the baseline)
 *
 * Mirrors backend/src/lib/roles.ts `roleFromGroups`, including its ordering:
 * widest first, because an admin also holds canTriage and testing for that
 * first would report every admin as QA.
 */
export const DASHBOARD_VIEWS = ['qa', 'developer', 'admin'] as const;
export type DashboardView = (typeof DASHBOARD_VIEWS)[number];

export const VIEW_LABELS: Record<DashboardView, string> = {
  qa: 'QA',
  developer: 'Developer',
  admin: 'Admin',
};

export function roleFromPermissions(permissions?: Permissions): DashboardView {
  if (!permissions) return 'developer';
  if (permissions.canManageUsers || permissions.canManageProducts) return 'admin';
  if (permissions.canTriage) return 'qa';
  return 'developer';
}

/**
 * Which views this account may open.
 *
 * An admin can look at all three - they manage the people doing that work, and
 * "what does a developer actually see?" is a question they need answerable
 * without a second account. Everyone else gets their own view only, because the
 * other dashboards would just render actions the server refuses.
 *
 * This is a UI affordance, never a permission: every panel still calls the same
 * guarded endpoints, so switching to the admin view without `editusers` shows
 * an empty access matrix rather than privileged data.
 */
export function availableViews(permissions?: Permissions): DashboardView[] {
  const role = roleFromPermissions(permissions);
  if (role === 'admin') return ['admin', 'qa', 'developer'];
  if (role === 'qa') return ['qa', 'developer'];
  return ['developer'];
}

const STORAGE_KEY = 'bzui.dashboardView';

/**
 * The active view, with the user's last choice remembered.
 *
 * Persisted per browser so a lead who works out of the QA board does not land
 * on the admin dashboard every morning. Validated on read against what the
 * account may currently open - a stored value survives a permission change, and
 * without the check a demoted user would keep opening a view whose panels now
 * all 403.
 */
export function useDashboardView() {
  const { data } = useMe();
  const permissions = data?.user.permissions;
  const role = roleFromPermissions(permissions);
  const allowed = availableViews(permissions);

  const [stored, setStored] = useState<DashboardView | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return DASHBOARD_VIEWS.includes(raw as DashboardView) ? (raw as DashboardView) : null;
    } catch {
      // Private mode / blocked storage: fall back to the derived role.
      return null;
    }
  });

  const view = stored && allowed.includes(stored) ? stored : role;

  // Drop a stored view the account can no longer open, so it is not re-applied
  // on the next visit either.
  useEffect(() => {
    if (stored && !allowed.includes(stored)) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* nothing to do - the value is already ignored above */
      }
      setStored(null);
    }
  }, [stored, allowed]);

  const setView = useCallback((next: DashboardView) => {
    setStored(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* the choice still applies for this session */
    }
  }, []);

  return { view, setView, role, allowed, permissions };
}
