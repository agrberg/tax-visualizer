import { Component, type ErrorInfo, type ReactNode } from 'react'
import { clearStoredData } from '@/storage'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Last-resort backstop: renders a recoverable fallback instead of a blank screen if
 * any child throws while rendering. The "Reset saved data" action clears the
 * localStorage that could be feeding a persistent crash, so a corrupted saved input
 * can't wedge the app across reloads.
 *
 * This is a class (not a function component) on purpose: error boundaries rely on
 * `getDerivedStateFromError` / `componentDidCatch`, which have no hook equivalent —
 * React provides no way to catch render errors from a function component. The only
 * functional-looking alternative is the `react-error-boundary` library, which just
 * wraps this same class API; we keep the dependency-free class instead.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Uncaught error in tax-visualizer:', error, info)
  }

  handleReset = () => {
    clearStoredData()
    location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The visualizer hit an unexpected error. Saved input may be corrupted — resetting it
          usually fixes this.
        </p>
        <button
          type="button"
          onClick={this.handleReset}
          className="mt-4 rounded-md bg-foreground px-3 py-1.5 text-sm text-background"
        >
          Reset saved data &amp; reload
        </button>
      </div>
    )
  }
}
