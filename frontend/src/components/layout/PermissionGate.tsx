import { ShieldOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMe } from '../../api/hooks';
import type { Permissions } from '../../types';
import { EmptyState } from '../ui/EmptyState';

/**
 * Gates admin-only UI on the current user's real Bugzilla permissions
 * (computed server-side from their own group membership at login - see
 * derivePermissions in the BFF). Unlike RequireAuth, this never redirects:
 * the user IS authenticated, just not privileged, so a clean in-page denial
 * is correct - never a crash, never a bounce back to the login screen.
 */
export function PermissionGate({ permission, children }: { permission: keyof Permissions; children: ReactNode }) {
  const { data } = useMe();
  const allowed = data?.user.permissions[permission] ?? false;

  if (!allowed) {
    return (
      <div className="mx-auto max-w-[1200px] px-8 py-8">
        <EmptyState
          icon={ShieldOff}
          title="You don't have permission to view this page"
          description="This area requires additional Bugzilla privileges. Contact your Bugzilla administrator if you believe this is a mistake."
        />
      </div>
    );
  }

  return <>{children}</>;
}
