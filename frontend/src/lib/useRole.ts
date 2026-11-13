import { useCallback, useEffect, useState } from 'react';
import { useMe } from '../api/hooks';
import type { Permissions } from '../types';

/** Which dashboard a person sees. */
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
  if (permissions.isReporter) return 'qa';
  return 'developer';
}

/** Which views this account may open. */
export function availableViews(permissions?: Permissions): DashboardView[] {
  const role = roleFromPermissions(permissions);
  if (role === 'admin') return ['admin', 'qa', 'developer'];
  if (role === 'qa') return permissions?.canTriage ? ['qa', 'developer'] : ['qa'];
  return ['developer'];
}

const STORAGE_KEY = 'bzui.dashboardView';

/** The active view, with the user's last choice remembered. */
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
      return null;
    }
  });

  const view = stored && allowed.includes(stored) ? stored : role;

  useEffect(() => {
    if (stored && !allowed.includes(stored)) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
      setStored(null);
    }
  }, [stored, allowed]);

  const setView = useCallback((next: DashboardView) => {
    setStored(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }, []);

  return { view, setView, role, allowed, permissions };
}
