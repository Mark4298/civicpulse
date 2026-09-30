import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    void _error;
    void _info;
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-error-screen" role="alert">
          <section className="app-error-content">
            <span className="app-error-icon">
              <AlertTriangle size={20} />
            </span>
            <p className="app-error-kicker">CIVICPULSE</p>
            <h1>We hit a rough patch.</h1>
            <p className="app-error-copy">
              Your reports are safe. Refresh the page to reconnect with CivicPulse.
            </p>
            <button type="button" onClick={() => window.location.reload()}>
              <RotateCcw size={16} /> Reload CivicPulse
            </button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
