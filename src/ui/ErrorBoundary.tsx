import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
  }

  override render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="absolute inset-0 z-[9999] flex flex-col items-center justify-center bg-[#04070d] p-4">
          <div className="w-[min(460px,94vw)]">
            <div className="hud-panel panel-red p-6 text-center sm:p-8">
              <h2 className="font-display mb-4 text-2xl tracking-[0.1em] text-[#ff3b52] sm:text-3xl">
                SYSTEM FAILURE
              </h2>
              <div className="mb-4 text-[13px] leading-5 text-[#9db4d6]">
                <p className="mb-2">A critical error occurred in the application.</p>
                <code className="block w-full overflow-x-auto rounded bg-[#0a0408] p-3 text-left font-mono text-[11px] text-[#ff5c54]">
                  {this.state.error.message}
                </code>
              </div>

              {process.env.NODE_ENV === "development" && (
                <div className="mb-4 text-left">
                  <div className="hud-label mb-2 text-[10px] tracking-[0.2em] text-[#ff5c54]">
                    STACK TRACE
                  </div>
                  <pre className="max-h-40 overflow-y-auto rounded bg-[#0a0408] p-3 font-mono text-[10px] leading-4 text-[#7dff9e]/70">
                    {this.state.error.stack}
                  </pre>
                </div>
              )}

              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.reload();
                }}
                className="clip-btn px-8 py-3 text-sm transition-colors hover:bg-[#ff3b52]/30"
                style={{
                  background: "#ff3b52",
                  color: "#fff",
                  border: "none",
                  clipPath: "polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)",
                }}
              >
                RESTART
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
