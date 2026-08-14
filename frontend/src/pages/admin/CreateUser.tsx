import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { useCreateUser } from '../../api/hooks';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Field';
import { useToast } from '../../context/ToastContext';

export function CreateUser() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const createUser = useCreateUser();

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!email.trim()) next.email = 'Email is required';
    if (password.length < 6) next.password = 'Password must be at least 6 characters long';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) return;

    try {
      const result = await createUser.mutateAsync({ email: email.trim(), fullName: fullName.trim() || undefined, password });
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
            <Input
              label="Password"
              type="password"
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
