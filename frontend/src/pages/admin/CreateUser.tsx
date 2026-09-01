import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { useCreateUser, useProducts } from '../../api/hooks';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input, PasswordInput } from '../../components/ui/Field';
import { useToast } from '../../context/ToastContext';
import { cn } from '../../lib/utils';
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from '../../types';

export function CreateUser() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const createUser = useCreateUser();
  const { data: productsData } = useProducts();

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  // Developer is the safest default: the narrowest capability set, so an
  // unchanged form never quietly creates someone who can manage users.
  const [role, setRole] = useState<Role>('developer');
  const [products, setProducts] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!email.trim()) next.email = 'Email is required';
    if (password.length < 6) next.password = 'Password must be at least 6 characters long';
    // An account with no product sees an empty bug list and cannot be assigned
    // anything - almost certainly a slip rather than an intention.
    if (products.length === 0) next.products = 'Select at least one product this person works on';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) return;

    try {
      const result = await createUser.mutateAsync({
        email: email.trim(),
        fullName: fullName.trim() || undefined,
        password,
        role,
        products,
      });
      // Surfaced rather than swallowed: a product with no matching Bugzilla
      // group grants nothing, and the admin should know before they assume the
      // account is fully set up.
      if (result.skippedGroups?.length) {
        toast({
          variant: 'error',
          title: 'Some access was not granted',
          description: `No Bugzilla group exists for: ${result.skippedGroups.join(', ')}`,
        });
      }
      toast({ variant: 'success', title: 'User created', description: result.user.email });
      navigate(`/admin/users/${result.user.id}`);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not create the user. Please try again.');
    }
  }

  return (
    <div className="mx-auto max-w-xl px-8 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">New user</h1>
        <p className="mt-1 text-sm text-slate-600">Creates a Bugzilla account directly via the REST API.</p>
      </div>

      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Account details</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-5">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={errors.email}
              placeholder="name@example.com"
              required
              autoFocus
            />
            <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Optional" />

            {/* ------------------------------------------------------ role -- */}
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-slate-700">Role</legend>
              <p className="mb-1 text-xs text-slate-500">
                Decides what this person can do. Products below decide what they can see.
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
                    name="role"
                    value={r}
                    checked={role === r}
                    onChange={() => setRole(r)}
                    /*
                     * The wrapping <label> contains BOTH the role name and its
                     * description, so the implicit accessible name became
                     * "Administrator Everything a tester can do…" - burying the
                     * actual choice, and leaving two options indistinguishable
                     * to anything matching on name.
                     *
                     * `aria-label` overrides that implicit name with just the
                     * role; `aria-describedby` re-attaches the sentence as the
                     * supporting detail it actually is. Both are needed -
                     * describedby alone does not displace the label text.
                     */
                    aria-label={ROLE_LABELS[r]}
                    aria-describedby={`role-${r}-desc`}
                    className="mt-0.5 h-4 w-4 text-brand-600 focus-ring"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-800">{ROLE_LABELS[r]}</span>
                    <span id={`role-${r}-desc`} className="block text-xs leading-relaxed text-slate-500">
                      {ROLE_DESCRIPTIONS[r]}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>

            {/* -------------------------------------------------- products -- */}
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-slate-700">Product access</legend>
              <p className="mb-1 text-xs text-slate-500">
                Which products' bugs this person can see and be assigned. Testers usually need every
                product; a developer normally needs only their own.
              </p>
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
              {errors.products && <p className="text-xs text-rose-600">{errors.products}</p>}
            </fieldset>

            <PasswordInput
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              hint="At least 6 characters. Set explicitly rather than relying on an email invite, which may not be configured on this instance."
              required
            />

            {submitError && (
              <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
                {submitError}
              </p>
            )}

            <div className="flex items-center justify-end gap-3 border-t border-white/30 pt-5">
              <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
                Cancel
              </Button>
              <Button type="submit" loading={createUser.isPending}>
                <Plus className="h-4 w-4" />
                Create user
              </Button>
            </div>
          </CardBody>
        </Card>
      </form>
    </div>
  );
}
