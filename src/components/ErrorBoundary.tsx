import { Component, type ReactNode } from "react";

interface Props {
  fallback?: (error: Error, reset: () => void) => ReactNode;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }
      return (
        <div className="p-6 m-2 rounded-lg bg-red-950/40 border border-red-900 text-red-200">
          <p className="text-sm font-medium mb-2">
            このセクションでエラーが発生しました
          </p>
          <p className="text-xs text-red-300/80 mb-3 break-words">
            {this.state.error.message}
          </p>
          <button
            onClick={this.reset}
            className="text-xs px-3 py-1.5 rounded bg-red-900/60 hover:bg-red-900 text-white transition-colors"
          >
            再読み込み
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
