import { LogIn } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLogin } from '../api/hooks';
import { ApiError } from '../api/client';
import { UEducateLogo } from '../components/brand/UEducateLogo';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Field';

export function Login() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const loginMutation = useLogin();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await loginMutation.mutateAsync({ login, password });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4">
          <UEducateLogo height={44} />
          <div className="flex flex-col items-center gap-1.5">
            <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-800">
              Bugzilla
            </span>
            <h1 className="text-lg font-semibold tracking-tight text-ueducate-ink">Sign in to Bugzilla</h1>
            <p className="text-sm text-slate-600">Use your Bugzilla account credentials</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="glass-surface overflow-hidden rounded-2xl">
          {/* Decorative brand bar - authentic #3AB2CC/#5BC9ED, no text sits on it */}
          <div className="h-1.5 bg-gradient-to-r from-ueducate-primary via-ueducate-accent to-ueducate-hover" />
          <div className="flex flex-col gap-4 p-6">
            <Input
              label="Email"
              type="text"
              autoComplete="username"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
            {error && (
              <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
                {error}
              </p>
            )}
            <Button type="submit" className="mt-1 w-full" loading={loginMutation.isPending}>
              <LogIn className="h-4 w-4" />
              {loginMutation.isPending ? 'Signing in…' : 'Sign in'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
