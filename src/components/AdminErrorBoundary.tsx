import React from 'react';
import { AlertCircle, RefreshCw, Home, RotateCcw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class AdminErrorBoundary extends React.Component<Props, State> {
  override state: State = {
    hasError: false,
    error: null
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("AdminErrorBoundary caught error:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  override render() {
    if (this.state.hasError) {
      const isDynamicImportError = this.state.error?.message?.includes('dynamically imported module') ||
                                   this.state.error?.message?.includes('Failed to fetch') ||
                                   this.state.error?.message?.includes('Loading chunk');

      return (
        <div className="min-h-[80vh] flex items-center justify-center p-6 bg-slate-950 text-white">
          <div className="p-8 bg-slate-900 border border-white/10 rounded-3xl max-w-lg w-full text-center space-y-5 shadow-2xl">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
              <AlertCircle className="w-7 h-7" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white">
                {isDynamicImportError ? 'Session Module Update Detected' : 'Admin Panel Temporarily Unavailable'}
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                {isDynamicImportError
                  ? 'A newer version of the management portal is available, or the module connection timed out. Refreshing will load the latest assets.'
                  : 'An error occurred while loading this administrative view.'}
              </p>
            </div>

            {this.state.error && (
              <pre className="p-3.5 bg-slate-950 rounded-xl overflow-x-auto text-[11px] font-mono text-rose-300 text-left border border-white/5 max-h-32">
                {this.state.error.message || this.state.error.toString()}
              </pre>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleRetry}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-500/20"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retry Loading</span>
              </button>

              <button
                type="button"
                onClick={this.handleReload}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-all flex items-center justify-center gap-2 border border-white/10 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload Page</span>
              </button>

              <button
                type="button"
                onClick={this.handleGoHome}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800/50 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Home className="w-3.5 h-3.5" />
                <span>Storefront</span>
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

