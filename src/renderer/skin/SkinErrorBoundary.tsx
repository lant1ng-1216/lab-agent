/**
 * Isolates 璃 / Glass WebGL|WebGPU failures so the shell stays usable.
 */
import { Component, type ReactNode } from "react";

type Props = { children: ReactNode; mode: "light" | "dark" };
type State = { error: Error | null };

export default class SkinErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error("[SkinErrorBoundary]", error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    // Allow retry when user flips day/night or re-enters skin
    if (prev.mode !== this.props.mode && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      const night = this.props.mode === "dark";
      return (
        <div
          className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center px-6 text-center text-[12px]"
          style={{
            background: night ? "#0a0a0c" : "#f3f1ec",
            color: night ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.4)",
          }}
          aria-hidden
        >
          璃皮肤暂时不可用（已回退为纯色背景）。切回默认皮肤或切换昼夜可重试。
        </div>
      );
    }
    return this.props.children;
  }
}
