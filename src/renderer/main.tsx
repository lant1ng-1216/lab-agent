import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import App from "./App";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "monospace", color: "#eee", background: "#111", height: "100vh" }}>
          <div style={{ fontSize: 14, marginBottom: 8 }}>渲染出错</div>
          <pre style={{ fontSize: 12, whiteSpace: "pre-wrap", color: "#f88" }}>{String(this.state.error)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
