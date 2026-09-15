import { memo, useEffect, useRef, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { ChatMessage, CodingMirrorEvent, LoopStatus, SupervisorCommand } from "@shared/protocol";
import { StreamText } from "@harness";

export type LabNodeKind = "lab" | "coding";

export interface LabNodeData {
  kind: LabNodeKind;
  status: LoopStatus;
  messages: ChatMessage[];
  streaming: ChatMessage | null;
  mirror?: CodingMirrorEvent[];
  commands?: SupervisorCommand[];
  approval?: { headline: string; detail: string } | null;
  engine?: string;
  active?: boolean;
  onSelect?: (kind: LabNodeKind) => void;
  onOpenDetail?: (kind: LabNodeKind) => void;
  [key: string]: unknown;
}

export type LabFlowNode = Node<LabNodeData, "labAgent">;

const KIND_SIZE: Record<LabNodeKind, { w: number; h: number }> = {
  lab: { w: 320, h: 300 },
  coding: { w: 400, h: 320 },
};

const HANDLE_CSS = `
.lab-node .lab-handle {
  width: 18px !important;
  height: 18px !important;
  min-width: 18px !important;
  min-height: 18px !important;
  border-radius: 999px !important;
  background: var(--lab-surface-solid) !important;
  border: 1px solid var(--lab-border) !important;
  box-shadow: 0 2px 8px rgba(0,0,0,0.35);
  display: flex !important;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transform: scale(0.8);
  pointer-events: none;
  transition: opacity 0.14s ease, transform 0.14s ease;
  z-index: 6;
}
.lab-node .lab-handle::after {
  content: '+';
  color: var(--lab-ink);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  margin-top: -1px;
  pointer-events: none;
}
.react-flow__node:hover .lab-handle,
.react-flow__node.selected .lab-handle,
.react-flow.connecting .lab-handle {
  opacity: 1;
  transform: scale(1);
  pointer-events: all;
}
.lab-node .lab-handle:hover { transform: scale(1.08); }
.lab-node .lab-handle-left { left: -9px !important; }
.lab-node .lab-handle-right { right: -9px !important; }
`;

const stop = (e: ReactMouseEvent | ReactPointerEvent) => e.stopPropagation();

function lastText(data: LabNodeData): string {
  if (data.streaming?.content) return data.streaming.content;
  for (let i = data.messages.length - 1; i >= 0; i--) {
    const m = data.messages[i];
    if (m.role === "assistant" && m.content.trim()) return m.content;
  }
  return "idle";
}

function LabNodeInner({ data, selected }: NodeProps<LabFlowNode>) {
  const isLab = data.kind === "lab";
  const size = KIND_SIZE[data.kind];
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [data.messages, data.streaming, data.status, data.mirror]);

  const title = isLab ? "Lab Agent" : "Coding Agent";
  const subtitle = isLab ? "监工 · 不写代码" : `engine · ${data.engine ?? "DeepSeek"}`;
  const accent = isLab ? "var(--lab-accent)" : "var(--lab-green)";
  const preview = lastText(data);

  return (
    <div
      className="lab-node cursor-pointer"
      style={{
        width: size.w,
        height: size.h,
        position: "relative",
        borderRadius: 12,
        border: `1px solid ${selected || data.active ? "var(--lab-edge-strong)" : "var(--lab-border)"}`,
        background: "var(--lab-surface-solid)",
        boxShadow: selected
          ? "0 0 0 1px rgba(255,255,255,0.06), 0 18px 44px rgba(0,0,0,0.55)"
          : "0 12px 30px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.03) inset",
        overflow: "hidden",
        fontFamily: "var(--lab-font)",
      }}
      onClick={() => {
        data.onSelect?.(data.kind);
        data.onOpenDetail?.(data.kind);
      }}
    >
      <style>{HANDLE_CSS}</style>

      {/* native terminal chrome */}
      <div
        className="flex items-center gap-2 border-b border-[var(--lab-border-soft)] px-2.5 py-1.5"
        style={{ background: "var(--lab-bg-raised)" }}
      >
        <span className="flex gap-1">
          <i className="block size-[9px] rounded-full bg-[#ee5c61]" />
          <i className="block size-[9px] rounded-full bg-[#e8a23a]" />
          <i className="block size-[9px] rounded-full bg-[#3dbb72]" />
        </span>
        <span className="size-1.5 rounded-full" style={{ background: accent }} />
        <div className="min-w-0 flex-1 font-[var(--lab-mono)]">
          <div className="truncate text-[10.5px] font-semibold text-[var(--lab-ink)]">{title}</div>
          <div className="truncate text-[9px] text-[var(--lab-ink-3)]">{subtitle}</div>
        </div>
        <span className="rounded-full border border-[var(--lab-border)] px-1.5 py-0.5 font-[var(--lab-mono)] text-[9px] text-[var(--lab-ink-3)]">
          {data.status}
        </span>
      </div>

      {/* summary-only body */}
      <div className="flex h-[calc(100%-31px)] flex-col">
        {isLab && data.mirror && data.mirror.length > 0 ? (
          <div className="shrink-0 border-b border-[var(--lab-border-soft)] bg-[var(--lab-inset)] px-2 py-1">
            <div className="font-[var(--lab-mono)] text-[8.5px] tracking-[0.06em] text-[var(--lab-ink-3)]">
              mirror · {data.mirror[0]?.kind} · {(data.mirror[0]?.summary ?? "").slice(0, 48)}
            </div>
          </div>
        ) : null}

        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
          {data.status === "thinking" ? (
            <div className="mb-1 font-[var(--lab-mono)] text-[10.5px] text-[var(--lab-ink-3)]">
              <span className="mr-1.5 inline-block size-1.5 rounded-full bg-[var(--lab-accent)]" style={{ animation: "lab-pulse 1.4s ease-in-out infinite" }} />
              thinking…
            </div>
          ) : null}

          {data.streaming ? (
            <div className="font-[var(--lab-mono)] text-[11px] leading-[1.5] text-[var(--lab-ink)]">
              <StreamText text={data.streaming.content.slice(0, 300)} />
            </div>
          ) : (
            <pre className="whitespace-pre-wrap font-[var(--lab-mono)] text-[11px] leading-[1.5] text-[var(--lab-ink-2)]">
              {preview.slice(0, 400)}
            </pre>
          )}
        </div>

        <div className="shrink-0 border-t border-[var(--lab-border-soft)] px-2.5 py-1.5">
          <div className="flex items-center gap-1.5 font-[var(--lab-mono)] text-[9.5px] text-[var(--lab-ink-3)]">
            <span>点击查看详情</span>
            {data.approval ? <span className="text-[var(--lab-warn)]">· 待确认</span> : null}
            {!isLab && data.commands?.length ? (
              <span>· {data.commands.length} 指令</span>
            ) : null}
          </div>
        </div>
      </div>

      <Handle type="target" position={Position.Left} className="lab-handle lab-handle-left" isConnectable />
      <Handle type="source" position={Position.Right} className="lab-handle lab-handle-right" isConnectable />
    </div>
  );
}

export default memo(LabNodeInner);
