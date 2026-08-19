import { AlertTriangle } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '../ui/Button';

interface Props {
  children: ReactNode;
  /** Changing this resets the boundary - pass the route so navigating away clears a crash. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time exceptions from the page currently mounted in AppLayout.
 *
 * React unmounts the *entire* tree when a component throws and nothing catches
 * it, which is why an uncaught error here used to leave a blank white page with
 * no sidebar and no message - the failure was invisible unless you happened to
 * have DevTools open. Wrapping only the page content means a broken page shows
 * what went wrong while the shell around it keeps working.
 *
 * The message is shown deliberately: this is an internal tool whose users are
 * the engineers who would otherwise have to reproduce the fault to see it.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Page crashed:', error, info.componentStack);
  }

  componentDidUpdate(prev: Props): void {
    // A crash is tied to the page that caused it; navigating elsewhere should not
    // leave the user stuck on the error screen.
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="mx-auto max-w-[900px] px-8 py-12">
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-slate-900">This page couldn&apos;t be displayed</h2>
              <p className="mt-1 text-sm text-slate-700">
                Something went wrong while rendering. The rest of the app still works — use the menu to go elsewhere.
              </p>
              <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-white/80 p-3 font-mono text-xs text-rose-800 ring-1 ring-inset ring-rose-200">
                {error.message}
              </pre>
              <Button className="mt-4" onClick={() => this.setState({ error: null })}>
                Try again
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
