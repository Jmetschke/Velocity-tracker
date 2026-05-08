import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { Component, type ReactNode } from "react";
import { Link } from "wouter";

interface Props {
  children: ReactNode;
  /** Optional label shown in the error card (e.g. "Dashboard", "Upload Data"). */
  pageName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Per-page error boundary.
 *
 * Unlike the global ErrorBoundary that covers the entire app, this renders
 * a contained error card *inside* the dashboard layout so the sidebar and
 * navigation remain functional. The user can retry the failed page or
 * navigate away without a full page reload.
 */
class PageErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const label = this.props.pageName ?? "This page";

    return (
      <div className="flex items-center justify-center p-8 min-h-[60vh]">
        <div className="flex flex-col items-center w-full max-w-lg text-center">
          <div className="rounded-full bg-destructive/10 p-4 mb-5">
            <AlertTriangle size={32} className="text-destructive" />
          </div>

          <h2 className="text-lg font-semibold mb-2">
            {label} encountered an error
          </h2>

          <p className="text-sm text-muted-foreground mb-4">
            Something went wrong while rendering this page. You can try again
            or navigate to a different section.
          </p>

          <details className="w-full mb-6 text-left">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              Technical details
            </summary>
            <div className="mt-2 p-3 rounded bg-muted overflow-auto max-h-48">
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                {this.state.error?.message}
                {"\n\n"}
                {this.state.error?.stack}
              </pre>
            </div>
          </details>

          <div className="flex gap-3">
            <button
              onClick={this.handleRetry}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer transition-opacity"
              )}
            >
              <RotateCcw size={14} />
              Try Again
            </button>

            <Link
              href="/"
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
                "border border-border bg-background text-foreground",
                "hover:bg-accent cursor-pointer transition-colors"
              )}
            >
              <Home size={14} />
              Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }
}

export default PageErrorBoundary;
