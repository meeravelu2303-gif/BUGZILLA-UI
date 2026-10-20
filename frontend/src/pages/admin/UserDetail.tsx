import { AlertCircle, ArrowLeft, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { useAdminUser, useMe, useProducts, useUpdateUser } from '../../api/hooks';
import { DeleteUserDialog } from '../../components/admin/DeleteUserDialog';
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
  // Testers open accounts read-only; editing and deleting stay with canManageUsers.
  const { data: me } = useMe();
  const canManage = Boolean(me?.user.permissions.canManageUsers);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [disabled, setDisabled] = useState(false);
  const [disabledReason, setDisabledReason] = useState('');
  const [role, setRole] = useState<Role>('developer');
  const [products, setProducts] = useState<string[]>([]);

  useEffect(() => {
    if (!data) return;
    setFullName(data.user.fullName);
    setEmail(data.user.email);
    setEmailEnabled(data.user.emailEnabled ?? true);
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
  if (!canManage) return <ReadOnlyUser user={user} productNames={productNames} />;
  const original = {
    fullName: user.fullName,
    email: user.email,
    emailEnabled: user.emailEnabled ?? true,
    disabled: !user.isEnabled,
    disabledReason: user.disabledReason,
    role: roleFromGroups(user.groups),
    // Compared as a sorted string so re-ticking the same two products in a
    // different order does not read as a change.
    products: user.groups.filter((g) => productNames.has(g)).sort().join('|'),
  };
  const emailChanged = email.trim().toLowerCase() !== original.email.toLowerCase();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const isDirty =
    fullName !== original.fullName ||
    emailChanged ||
    emailEnabled !== original.emailEnabled ||
    newPassword.trim().length > 0 ||
    disabled !== original.disabled ||
    (disabled && disabledReason !== original.disabledReason) ||
    role !== original.role ||
    [...products].sort().join('|') !== original.products;
  const canSave = isDirty && emailValid && (!disabled || disabledReason.trim().length > 0) && (newPassword === '' || newPassword.length >= 6);

  async function onSave() {
    const payload: UpdateUserInput = {};
    if (fullName !== original.fullName) payload.fullName = fullName;
    if (emailChanged) payload.email = email.trim();
    if (emailEnabled !== original.emailEnabled) payload.emailEnabled = emailEnabled;
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
          <Button size="sm" variant="ghost" onClick={() => setDeleting(true)} className="text-rose-600 hover:bg-rose-50 hover:text-rose-700">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      </div>
      <DeleteUserDialog open={deleting} user={user} onClose={() => setDeleting(false)} afterDelete="/admin/users" />

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
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            <Input
              label="Email (login)"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={!emailValid ? 'Enter a valid email address' : undefined}
              hint={emailChanged && emailValid ? 'They will sign in with this address from now on.' : undefined}
            />
          </div>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={emailEnabled}
              onChange={(e) => setEmailEnabled(e.target.checked)}
              className="focus-ring mt-0.5 h-4 w-4 rounded border-line text-brand-600"
            />
            <span className="text-sm">
              <span className="font-medium text-slate-900">Send bug mail</span>
              <p className="mt-0.5 text-slate-600">Email this person when bugs they are involved in change. Password reset mail is always sent.</p>
            </span>
          </label>
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
                className="focus-ring mt-0.5 h-4 w-4 rounded border-line text-brand-600"
              />
              <span className="text-sm">
                <span className="font-medium text-slate-900">Disable this account</span>
                <p className="mt-0.5 text-slate-600">Blocks login. The account and its history are preserved - the right choice for anyone who has worked on bugs.</p>
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
                  role === r ? 'border-brand-500 bg-brand-50/50' : 'border-hairline hover:bg-slate-50'
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
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-hairline p-3 text-sm transition-colors hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={products.includes(p.name)}
                  onChange={() =>
                    setProducts((prev) =>
                      prev.includes(p.name) ? prev.filter((x) => x !== p.name) : [...prev, p.name]
                    )
                  }
                  className="h-4 w-4 rounded border-line text-brand-600 focus-ring"
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

/**
 * The same account, for someone who may look but not change anything (testers).
 * Shows what the edit form would - name, login, status, role, product access -
 * as plain facts, with no inputs that would only be refused on save.
 */
function ReadOnlyUser({
  user,
  productNames,
}: {
  user: { fullName: string; email: string; isEnabled: boolean; disabledReason: string; emailEnabled?: boolean; groups: string[] };
  productNames: Set<string>;
}) {
  const role = roleFromGroups(user.groups);
  const products = user.groups.filter((g) => productNames.has(g)).sort((a, b) => a.localeCompare(b));

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
          <Pill tone={user.isEnabled ? 'emerald' : 'rose'}>{user.isEnabled ? 'Enabled' : 'Disabled'}</Pill>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <span className="text-xs text-slate-500">View only</span>
        </CardHeader>
        <CardBody className="flex flex-col gap-5">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-slate-500">Full name</dt>
              <dd className="mt-0.5 text-slate-900">{user.fullName || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Email (login)</dt>
              <dd className="mt-0.5 break-all text-slate-900">{user.email}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Role</dt>
              <dd className="mt-0.5 text-slate-900">{ROLE_LABELS[role]}</dd>
              <dd className="text-xs text-slate-500">{ROLE_DESCRIPTIONS[role]}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Bug mail</dt>
              <dd className="mt-0.5 text-slate-900">{(user.emailEnabled ?? true) ? 'On' : 'Off'}</dd>
            </div>
            {!user.isEnabled && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-slate-500">Disabled reason</dt>
                <dd className="mt-0.5 text-slate-900">{user.disabledReason || '—'}</dd>
              </div>
            )}
          </dl>

          <div className="border-t border-white/30 pt-5">
            <p className="mb-2 text-sm font-medium text-slate-700">Product access ({products.length})</p>
            {products.length === 0 ? (
              <p className="text-sm text-slate-600">No product access.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {products.map((p) => (
                  <Pill key={p} tone="slate">
                    {p}
                  </Pill>
                ))}
              </div>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
