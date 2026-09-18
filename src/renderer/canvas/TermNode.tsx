import { memo, useEffect, useRef, useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { LoopStatus } from "@shared/protocol";
import type { LabNodeKind } from "./LabNode";
import LoadingState from "../harness/beautiful-ui/LoadingState";

export interface TermNodeData {
  kind: LabNodeKind;
  engine?: string;
  status?: LoopStatus;
  active?: boolean;
  interactive?: boolean;
  onSelect?: (kind: LabNodeKind) => void;
  onOpenDetail?: (kind: LabNodeKind) => void;
  onEnterInteractive?: (kind: LabNodeKind) => void;
  onRemove?: (kind: LabNodeKind) => void;
  [key: string]: unknown;
}

export type TermFlowNode = Node<TermNodeData, "termAgent">;

const SIZE: Record<LabNodeKind, { w: number; h: number }> = {
  lab: { w: 620, h: 420 },
  coding: { w: 700, h: 460 },
};

const HANDLE_CSS = `
.term-node .lab-handle {
  --hx: 0px; --hy: 0px;
  width: 18px !important; height: 18px !important; min-width: 18px !important; min-height: 18px !important;
  border-radius: 999px !important; background: var(--lab-surface-solid) !important;
  border: 1px solid var(--lab-border) !important; box-shadow: 0 2px 8px rgba(0,0,0,0.35);
  display: flex !important; align-items: center; justify-content: center;
  opacity: 0; transform: scale(0.8) translate(var(--hx), var(--hy)); pointer-events: none;
  transition: opacity 0.14s ease, transform 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease; z-index: 6;
}
.term-node .lab-handle::after { content: '+'; color: var(--lab-ink); font-size: 12px; font-weight: 600; line-height: 1; margin-top: -1px; pointer-events: none; }
.react-flow__node:hover .lab-handle,
.react-flow__node.selected .lab-handle,
.react-flow.connecting .lab-handle,
.term-node .lab-handle.lab-handle-near {
  opacity: 1; transform: scale(1) translate(var(--hx), var(--hy)); pointer-events: all;
}
.term-node .lab-handle.lab-handle-near {
  border-color: var(--lab-accent) !important;
  box-shadow: 0 0 0 3px var(--lab-accent-soft), 0 2px 10px rgba(0,0,0,0.35);
  transform: scale(1.08) translate(var(--hx), var(--hy));
}
.term-node .lab-handle-left { left: -22px !important; }
.term-node .lab-handle-right { right: -22px !important; }
.term-node .xterm { padding: 6px 8px; height: 100%; }
.term-node .xterm-viewport { background: transparent !important; }
.term-node.term-display .xterm { pointer-events: none; }
.term-node.term-interactive .xterm { pointer-events: auto; }
.term-node.term-interactive { outline: 2px solid var(--lab-accent); outline-offset: 2px; }
`;

function TermNodeInner({ data, selected }: NodeProps<TermFlowNode>) {
  const size = SIZE[data.kind];
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<{ dispose: () => void; focus: () => void } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const title = data.kind === "lab" ? "Lab Agent" : "Coding Agent";
  const isMacPlatform = window.lab?.platform === "darwin";
  // Lab supervisor uses a shell PTY; Coding uses the selected coding engine.
  // Older saved canvases may still contain the removed Claude Code placeholder.
  // Keep those terminals inside Lab Agent instead of launching an external CLI.
  const savedEngineId = data.engine ?? "lab-deepseek";
  const engineId = data.kind === "lab" ? "shell" : savedEngineId === "claude-code" ? "lab-deepseek" : savedEngineId;
  const engineName =
    engineId === "lab-deepseek" ? "Lab Coding" : engineId.charAt(0).toUpperCase() + engineId.slice(1);
  const subtitle = data.kind === "lab" ? "监工 · 终端" : `终端 · ${engineName}`;
  const interactive = Boolean(data.interactive);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      const bridge = window.lab;
      const host = hostRef.current;
      if (!host) return;
      if (!bridge?.ptySpawn) {
        // Browser preview: quiet empty surface (no red spawn errors)
        setReady(false);
        setErr(null);
        return;
      }
      const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        import("@xterm/addon-web-links"),
      ]);
      if (disposed) return;

      const term = new Terminal({
        cursorBlink: true,
        fontSize: 12.5,
        fontFamily: "var(--lab-mono)",
        theme: {
          background: "#00000000",
          foreground: "#f2f2f2",
          cursor: "#f2f2f2",
          cursorAccent: "#000000",
          selectionBackground: "#ffffff33",
          black: "#1c1c1e",
          red: "#ff5f57",
          green: "#28c840",
          yellow: "#febc2e",
          blue: "#5aa7ff",
          magenta: "#ff7ab2",
          cyan: "#5ac8fa",
          white: "#e8e8e8",
          brightBlack: "#6e6e73",
          brightRed: "#ff6961",
          brightGreen: "#34d058",
          brightYellow: "#ffd60a",
          brightBlue: "#7cb3ff",
          brightMagenta: "#ff9ecd",
          brightCyan: "#79e0f2",
          brightWhite: "#ffffff",
        },
        allowProposedApi: true,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.loadAddon(new WebLinksAddon());
      term.open(host);
      requestAnimationFrame(() => {
        try { fit.fit(); } catch { /* ignore */ }
      });
      termRef.current = term;

      const offData = bridge.onPtyData((id, d) => {
        if (id === data.kind) term.write(d);
      });
      const offExit = bridge.onPtyExit((id) => {
        if (id === data.kind) term.write("\r\n\x1b[90m[进程已退出]\x1b[0m\r\n");
      });
      const sub = term.onData((d) => bridge.ptyWrite(data.kind, d));

      const spawn = () => {
        const cols = term.cols || 80;
        const rows = term.rows || 24;
        void bridge.ptySpawn(data.kind, engineId, cols, rows).then((r) => {
          if (!r.ok) {
            setErr(r.error ?? "启动失败");
            // Soft notice — avoid giant red walls; keep terminal usable
            term.write(`\x1b[90m[终端未就绪] ${r.error ?? "启动失败"}\x1b[0m\r\n`);
          } else {
            setErr(null);
            setReady(true);
          }
        });
      };
      spawn();

      const ro = new ResizeObserver(() => {
        try {
          fit.fit();
          bridge.ptyResize(data.kind, term.cols, term.rows);
        } catch { /* ignore */ }
      });
      ro.observe(host);

      cleanup = () => {
        offData();
        offExit();
        sub.dispose();
        ro.disconnect();
        bridge.ptyKill(data.kind);
        term.dispose();
      };
    })();

    return () => {
      disposed = true;
      cleanup?.();
      termRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.kind, engineId]);

  // focus terminal when entering interactive mode
  useEffect(() => {
    if (interactive) {
      termRef.current?.focus();
    }
  }, [interactive]);

  const handleClick = () => {
    data.onSelect?.(data.kind);
  };

  const handleDoubleClick = () => {
    data.onEnterInteractive?.(data.kind);
    data.onOpenDetail?.(data.kind);
  };

  return (
    <div
      className={`term-node ${interactive ? "term-interactive" : "term-display"}`}
      style={{
        width: size.w,
        height: size.h,
        position: "relative",
        borderRadius: 10,
        border: `1px solid ${selected || data.active ? "var(--lab-edge-strong)" : "var(--lab-border)"}`,
        background: "var(--lab-surface-solid)",
        boxShadow: selected ? "var(--lab-node-shadow-selected)" : "var(--lab-node-shadow)",
        overflow: "visible",
        fontFamily: "var(--lab-font)",
        display: "flex",
        flexDirection: "column",
        cursor: interactive ? "default" : "pointer",
        transition: "outline 0.15s ease",
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      title={interactive ? "交互态 · Esc 退出" : "双击进入终端"}
    >
      <style>{HANDLE_CSS}</style>

      {/* Keep the terminal card chrome neutral on Windows/Linux; only macOS
          uses the traffic-light affordance. */}
      <div
        className="flex shrink-0 items-center gap-2 border-b border-[var(--lab-border-soft)] px-2.5 py-1.5"
        style={{ background: "var(--lab-bg-raised)" }}
      >
        {isMacPlatform ? (
          <span className="flex gap-1.5">
            <i className="block size-[11px] rounded-full bg-[#ff5f57]" />
            <i className="block size-[11px] rounded-full bg-[#febc2e]" />
            <i className="block size-[11px] rounded-full bg-[#28c840]" />
          </span>
        ) : (
          <span className="rounded bg-[var(--lab-hover)] px-1.5 py-0.5 text-[9px] text-[var(--lab-ink-3)]">TERMINAL</span>
        )}
        <div className="min-w-0 flex-1 text-center font-[var(--lab-mono)]">
          <span className="truncate text-[11px] text-[var(--lab-ink-2)]">
            {title} — {subtitle}
          </span>
        </div>
        {interactive ? (
          <span className="rounded-sm bg-[var(--lab-accent)] px-1 text-[8px] font-semibold leading-[1.4] text-white">EDIT</span>
        ) : null}
        <span
          className="size-1.5 rounded-full"
          style={{ background: err ? "#ff5f57" : ready ? "#28c840" : "#febc2e" }}
          title={err ?? (ready ? "running" : "starting")}
        />
        <button
          type="button"
          className="ml-1 rounded px-1 text-[11px] text-[var(--lab-ink-3)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-red)]"
          title="删除节点"
          onClick={(e) => {
            e.stopPropagation();
            data.onRemove?.(data.kind);
          }}
        >
          ×
        </button>
      </div>
      {data.status === "thinking" ? (
        <div className="border-b border-[var(--lab-border-soft)] px-2.5 py-1.5">
          <LoadingState variant="Drive" label={data.kind === "lab" ? "监工思考中" : "Coding 思考中"} />
        </div>
      ) : null}

      {/* real terminal surface */}
      <div
        ref={hostRef}
        className="min-h-0 flex-1"
        style={{ background: "var(--lab-term-bg)", cursor: interactive ? "text" : "default" }}
      />

      <Handle type="target" position={Position.Left} className="lab-handle lab-handle-left" isConnectable />
      <Handle type="source" position={Position.Right} className="lab-handle lab-handle-right" isConnectable />
    </div>
  );
}

export default memo(TermNodeInner);
