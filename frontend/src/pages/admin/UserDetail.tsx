import { AlertCircle, ArrowLeft, Save, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { useAdminUser, useProducts, useUpdateUser } from '../../api/hooks';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input, PasswordInput } from '../../components/ui/Field';
import { Pill } from '../../components/ui/Pill';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../context/ToastContext';
import { cn } from '../../lib/utils';
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, roleFromGroups, type Role, type UpdateUserInput } from '../../types';

export function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const userId = Number(id);
  const { data, isLoading, isError, error } = useAdminUser(userId);
  const updateUser = useUpdateUser(userId);
  const { data: productsData } = useProducts();
  // The set of product-access group names, so a user's groups can be split into
  // 'products' and 'everything else' without hard-coding any product name.
  const productNames = useMemo(
    () => new Set((productsData?.products ?? []).map((p) => p.name)),
    [productsData]
  );
  const { toast } = useToast();

  const [fullName, setFullName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [disabled, setDisabled] = useState(false);
  const [disabledReason, setDisabledReason] = useState('');
  const [role, setRole] = useState<Role>('developer');
  const [products, setProducts] = useState<string[]>([]);

  useEffect(() => {
    if (!data) return;
    setFullName(data.user.fullName);
    setDisabled(!data.user.isEnabled);
    setDisabledReason(data.user.disabledReason);
    setNewPassword('');
    // Prefilled from the groups the account actually holds, so the form opens
    // showing the truth rather than a default that would silently demote on save.
    setRole(roleFromGroups(data.user.groups));
    setProducts(data.user.groups.filter((g) => productNames.has(g)));
  }, [data, productNames]);

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
  const original = {
    fullName: user.fullName,
    disabled: !user.isEnabled,
    disabledReason: user.disabledReason,
    role: roleFromGroups(user.groups),
    // Compared as a sorted string so re-ticking the same two products in a
    // different order does not read as a change.
    products: user.groups.filter((g) => productNames.has(g)).sort().join('|'),
  };
  const isDirty =
    fullName !== original.fullName ||
    newPassword.trim().length > 0 ||
    disabled !== original.disabled ||
    (disabled && disabledReason !== original.disabledReason) ||
    role !== original.role ||
    [...products].sort().join('|') !== original.products;
  const canSave = isDirty && (!disabled || disabledReason.trim().length > 0) && (newPassword === '' || newPassword.length >= 6);

  async function onSave() {
    const payload: UpdateUserInput = {};
    if (fullName !== original.fullName) payload.fullName = fullName;
    if (newPassword.trim()) payload.password = newPassword;
    if (disabled !== original.disabled) {
      payload.disabled = disabled;
      if (disabled) payload.disabledReason = disabledReason.trim();
    }
    /*
     * Role and products travel together, and only when one of them moved.
     * Sending a role on every save would make the backend recompute group
     * membership for a rename - harmless today, but it would quietly "repair"
     * any group a person had been given by hand outside the role model.
     */
    if (role !== original.role || [...products].sort().join('|') !== original.products) {
      payload.role = role;
      payload.products = products;
    }

    try {
      const result = await updateUser.mutateAsync(payload);
      setNewPassword('');
      if (result.skippedGroups?.length) {
        toast({
          variant: 'error',
          title: 'Some access was not granted',
          description: `No Bugzilla group exists for: ${result.skippedGroups.join(', ')}`,
        });
      }
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
          <PasswordInput
            label="Reset password"
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

          {/* ------------------------------------------------ role & access -- */}
          <fieldset className="flex flex-col gap-2 border-t border-white/30 pt-5">
            <legend className="mb-1 text-sm font-medium text-slate-700">Role</legend>
            <p className="mb-1 text-xs text-slate-500">
              Changing this adds and removes only the groups behind the role and its products.
              Anything else the account holds is left alone.
            </p>
            {ROLES.map((r) => (
              <label
                key={r}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                  role === r ? 'border-brand-500 bg-brand-50/50' : 'border-slate-200 hover:bg-slate-50'
                )}
              >
                <input
                  type="radio"
                  name="user-role"
                  value={r}
                  checked={role === r}
                  onChange={() => setRole(r)}
                  aria-label={ROLE_LABELS[r]}
                  aria-describedby={`user-role-${r}-desc`}
                  className="mt-0.5 h-4 w-4 text-brand-600 focus-ring"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-800">{ROLE_LABELS[r]}</span>
                  <span id={`user-role-${r}-desc`} className="block text-xs leading-relaxed text-slate-500">
                    {ROLE_DESCRIPTIONS[r]}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-slate-700">Product access</legend>
            {(productsData?.products ?? []).map((p) => (
              <label
                key={p.name}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm transition-colors hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={products.includes(p.name)}
                  onChange={() =>
                    setProducts((prev) =>
                      prev.includes(p.name) ? prev.filter((x) => x !== p.name) : [...prev, p.name]
                    )
                  }
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus-ring"
                />
                <span className="text-slate-800">{p.name}</span>
              </label>
            ))}
          </fieldset>

          <div className="border-t border-white/30 pt-4 text-xs text-slate-600">
            Groups outside the role model — <span className="font-mono">{user.groups.join(', ') || 'none'}</span> — are
            managed in <span className="font-medium text-slate-700">Bugzilla's native admin</span> (see Advanced
            Administration in the sidebar).
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
