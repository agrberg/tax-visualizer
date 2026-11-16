import { Component, type ErrorInfo, type ReactNode } from 'react';
import { clearStoredData, clearStoredInput } from '@/storage';

interface Props {
  children: ReactNode;
  /** Called after storage is cleared; defaults to a full page reload without the share-link hash. */
  onReload?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * Last-resort backstop: renders a recoverable fallback instead of a blank screen if
 * any child throws while rendering. "Reset current input" clears the saved input that
 * could be feeding a persistent crash, so a corrupted saved input can't wedge the app
 * across reloads, and keeps the named scenarios. "Delete saved scenarios too" clears
 * everything the app stores.
 *
 * This is a class (not a function component) on purpose: error boundaries rely on
 * `getDerivedStateFromError` / `componentDidCatch`, which have no hook equivalent —
 * React provides no way to catch render errors from a function component. The only
 * functional-looking alternative is the `react-error-boundary` library, which just
 * wraps this same class API; we keep the dependency-free class instead.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Uncaught error in tax-visualizer:', error, info);
  }

  handleResetInput = () => {
    clearStoredInput();
    this.reload();
  };

  handleResetAll = () => {
    clearStoredData();
    this.reload();
  };

  private reload() {
    // A plain reload keeps a share-link hash, which would re-decode into the same crash.
    (this.props.onReload ?? (() => location.replace(location.pathname + location.search)))();
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The visualizer hit an unexpected error. Saved input may be corrupted — resetting it usually fixes this. Your
          saved scenarios are kept.
        </p>
        <button
          type="button"
          onClick={this.handleResetInput}
          className="mt-4 rounded-md bg-foreground px-3 py-1.5 text-sm text-background"
        >
          Reset current input &amp; reload
        </button>
        <div>
          <button
            type="button"
            onClick={this.handleResetAll}
            className="mt-3 text-xs text-muted-foreground underline underline-offset-2"
          >
            Delete saved scenarios too &amp; reload
          </button>
        </div>
      </div>
    );
  }
}
