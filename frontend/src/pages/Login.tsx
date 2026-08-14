import { BarChart3, Bug, ListChecks, LogIn, Search, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLogin } from '../api/hooks';
import { ApiError } from '../api/client';
import { UEducateLogo } from '../components/brand/UEducateLogo';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Field';

const FEATURES = [
  { icon: ListChecks, title: 'Track & triage', text: 'File, filter and update bugs across every product.' },
  { icon: BarChart3, title: 'Live reports', text: 'Breakdowns by status, severity, product and owner.' },
  { icon: Search, title: 'Find anything fast', text: 'Advanced search and a ⌘K command palette.' },
  { icon: ShieldCheck, title: 'Your permissions', text: 'Access respects your real Bugzilla groups.' },
];

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
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* ---------- Animated brand panel ---------- */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-800 via-brand-700 to-brand-900 lg:flex lg:flex-col lg:justify-between">
        {/* drifting grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.15] motion-reduce:animate-none animate-drift"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
        {/* floating color blobs */}
        <div className="pointer-events-none absolute -left-24 top-10 h-80 w-80 rounded-full bg-ueducate-accent/30 blur-3xl motion-reduce:animate-none animate-blob" />
        <div className="pointer-events-none absolute right-[-6rem] top-1/3 h-96 w-96 rounded-full bg-brand-400/25 blur-3xl motion-reduce:animate-none animate-blob-slow" />
        <div className="pointer-events-none absolute bottom-[-4rem] left-1/3 h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl motion-reduce:animate-none animate-float-slow" />

        {/* floating bug marks */}
        <Bug className="pointer-events-none absolute left-[16%] top-[22%] h-6 w-6 text-white/25 motion-reduce:animate-none animate-float" />
        <Bug className="pointer-events-none absolute right-[22%] top-[62%] h-8 w-8 text-white/20 motion-reduce:animate-none animate-float-slow" />
        <Bug className="pointer-events-none absolute left-[28%] bottom-[16%] h-5 w-5 text-white/25 motion-reduce:animate-none animate-float" style={{ animationDelay: '1.5s' }} />

        <div className="relative z-10 p-10">
          <div className="inline-flex items-center gap-3 rounded-2xl bg-white/95 px-4 py-2.5 shadow-lg animate-fade-up">
            <UEducateLogo height={30} />
            <span className="border-l border-slate-200 pl-3 text-sm font-semibold text-brand-700">Bugzilla</span>
          </div>
        </div>

        <div className="relative z-10 px-10">
          <h2
            className="max-w-md text-balance text-4xl font-bold leading-tight tracking-tight text-white animate-fade-up"
            style={{ animationDelay: '0.1s' }}
          >
            Track every bug. Ship with confidence.
          </h2>
          <p className="mt-4 max-w-md text-lg text-brand-100 animate-fade-up" style={{ animationDelay: '0.2s' }}>
            A clean, fast workspace on top of your Bugzilla — for the whole team.
          </p>

          <ul className="mt-9 grid max-w-lg grid-cols-1 gap-3 sm:grid-cols-2">
            {FEATURES.map((f, i) => (
              <li
                key={f.title}
                className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-sm animate-fade-up"
                style={{ animationDelay: `${0.3 + i * 0.1}s` }}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white">
                  <f.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{f.title}</p>
                  <p className="text-xs leading-snug text-brand-100/90">{f.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 p-10 text-sm text-brand-100/70 animate-fade-in" style={{ animationDelay: '0.8s' }}>
          Bugzilla stays your system of record — this app never touches its database.
        </div>
      </aside>

      {/* ---------- Sign-in panel ---------- */}
      <main className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm animate-fade-up" style={{ animationDelay: '0.15s' }}>
          {/* compact logo for small screens where the brand panel is hidden */}
          <div className="mb-8 flex flex-col items-center gap-3 lg:hidden">
            <UEducateLogo height={40} />
            <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-800">
              Bugzilla
            </span>
          </div>

          <div className="mb-6 hidden lg:block">
            <h1 className="text-2xl font-bold tracking-tight text-ueducate-ink">Welcome back</h1>
            <p className="mt-1 text-sm text-slate-600">Sign in to your Bugzilla workspace.</p>
          </div>

          <form onSubmit={onSubmit} className="glass-surface overflow-hidden rounded-2xl shadow-glass">
            <div
              className="h-1.5 bg-gradient-to-r from-ueducate-primary via-ueducate-accent to-ueducate-hover motion-reduce:animate-none animate-gradient-x"
              style={{ backgroundSize: '200% 100%' }}
            />
            <div className="flex flex-col gap-4 p-6 sm:p-7">
              <h1 className="text-lg font-semibold tracking-tight text-ueducate-ink lg:hidden">Sign in to Bugzilla</h1>

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
                <p role="alert" className="animate-fade-up rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
                  {error}
                </p>
              )}
              <Button type="submit" className="group mt-1 w-full" loading={loginMutation.isPending}>
                {!loginMutation.isPending && <LogIn className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
                {loginMutation.isPending ? 'Signing in…' : 'Sign in'}
              </Button>

              <p className="text-center text-xs text-slate-500">
                Secured by your Bugzilla account — no separate password.
              </p>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
