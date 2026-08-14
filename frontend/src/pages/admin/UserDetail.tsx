import { AlertCircle, ArrowLeft, Save, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { useAdminUser, useUpdateUser } from '../../api/hooks';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Field';
import { Pill } from '../../components/ui/Pill';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../context/ToastContext';

export function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const userId = Number(id);
  const { data, isLoading, isError, error } = useAdminUser(userId);
  const updateUser = useUpdateUser(userId);
  const { toast } = useToast();

  const [fullName, setFullName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [disabled, setDisabled] = useState(false);
  const [disabledReason, setDisabledReason] = useState('');

  useEffect(() => {
    if (!data) return;
    setFullName(data.user.fullName);
    setDisabled(!data.user.isEnabled);
    setDisabledReason(data.user.disabledReason);
    setNewPassword('');
  }, [data]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-8 py-8">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="mt-4 h-64" />
      </div>
    );
  }

  if (isError || !data) {
    const message = error instanceof ApiError ? error.message : 'Something went wrong loading this user.';
    return (
      <div className="mx-auto max-w-2xl px-8 py-8">
        <EmptyState icon={AlertCircle} title="Couldn't load this user" description={message} />
      </div>
    );
  }

  const { user } = data;
  const original = { fullName: user.fullName, disabled: !user.isEnabled, disabledReason: user.disabledReason };
  const isDirty =
    fullName !== original.fullName ||
    newPassword.trim().length > 0 ||
    disabled !== original.disabled ||
    (disabled && disabledReason !== original.disabledReason);
  const canSave = isDirty && (!disabled || disabledReason.trim().length > 0) && (newPassword === '' || newPassword.length >= 6);

  async function onSave() {
    const payload: { fullName?: string; password?: string; disabled?: boolean; disabledReason?: string } = {};
    if (fullName !== original.fullName) payload.fullName = fullName;
    if (newPassword.trim()) payload.password = newPassword;
    if (disabled !== original.disabled) {
      payload.disabled = disabled;
      if (disabled) payload.disabledReason = disabledReason.trim();
    }

    try {
      await updateUser.mutateAsync(payload);
      setNewPassword('');
      toast({ variant: 'success', title: 'User updated' });
    } catch (err) {
      toast({
        variant: 'error',
        title: 'Update failed',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-8 py-8">
      <Link to="/admin/users" className="focus-ring inline-flex items-center gap-1.5 rounded text-sm text-slate-600 hover:text-slate-700">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to users
      </Link>

      <div className="mt-4 mb-6 flex items-center gap-4">
        <Avatar name={user.fullName || user.email} size="md" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">{user.fullName || user.email}</h1>
          <p className="text-sm text-slate-600">{user.email}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {user.groups.includes('editusers') && (
            <Pill tone="violet">
              <ShieldCheck className="h-3 w-3" /> Admin
            </Pill>
          )}
          <Pill tone={disabled ? 'rose' : 'emerald'}>{disabled ? 'Disabled' : 'Enabled'}</Pill>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Edit account</CardTitle>
          {isDirty && (
            <Button size="sm" onClick={onSave} disabled={!canSave} loading={updateUser.isPending}>
              <Save className="h-3.5 w-3.5" /> Save
            </Button>
          )}
        </CardHeader>
        <CardBody className="flex flex-col gap-5">
          <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <Input
            label="Reset password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Leave blank to keep current password"
            hint={newPassword && newPassword.length < 6 ? 'Password must be at least 6 characters long' : undefined}
          />

          <div className="border-t border-white/30 pt-5">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={disabled}
                onChange={(e) => setDisabled(e.target.checked)}
                className="focus-ring mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600"
              />
              <span className="text-sm">
                <span className="font-medium text-slate-900">Disable this account</span>
                <p className="mt-0.5 text-slate-600">Blocks login. The account and its history are preserved — Bugzilla has no delete.</p>
              </span>
            </label>

            {disabled && (
              <Input
                label="Reason shown to the user"
                value={disabledReason}
                onChange={(e) => setDisabledReason(e.target.value)}
                placeholder="e.g. Account disabled by administrator"
                className="mt-3"
                error={disabled && !disabledReason.trim() ? 'A reason is required to disable a user' : undefined}
              />
            )}
          </div>

          <div className="border-t border-white/30 pt-4 text-xs text-slate-600">
            Group membership isn't editable here — manage security groups in{' '}
            <span className="font-medium text-slate-700">Bugzilla's native admin</span> (see Advanced Administration in the sidebar).
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
