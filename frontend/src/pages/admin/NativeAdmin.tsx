import { Ban } from 'lucide-react';
import { Navigate, useParams } from 'react-router-dom';
import { useMe, useMeta } from '../../api/hooks';
import { EmbeddedNative } from '../../components/layout/EmbeddedNative';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { NATIVE_ADMIN_PAGES } from '../../lib/nav';

export function NativeAdmin() {
  const { page = '' } = useParams();
  const { data: me } = useMe();
  const { data: meta } = useMeta();

  const config = NATIVE_ADMIN_PAGES[page];
  if (!config) return <Navigate to="/" replace />;

  const permissions = me?.user.permissions;
  const isAdmin = Boolean(permissions?.canManageUsers || permissions?.canManageProducts);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8">
      <PageHeader
        title={config.title}
        description={config.blurb}
        crumbs={[{ label: 'Administration' }, { label: config.title }]}
      />

      {!isAdmin ? (
        <EmptyState
          icon={Ban}
          title="You don't have permission to view this page"
          description="This administration area requires additional Bugzilla privileges."
        />
      ) : meta?.bugzillaWebUrl ? (
        <EmbeddedNative src={`${meta.bugzillaWebUrl}/${config.cgi}`} title={config.title} />
      ) : (
        <EmptyState icon={Ban} title="Bugzilla URL unavailable" description="Could not resolve the Bugzilla web address." />
      )}
    </div>
  );
}
