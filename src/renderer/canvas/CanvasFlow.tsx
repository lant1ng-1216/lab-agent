import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  ConnectionMode,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { AgentPermissionPrompt, AgentToolTrace, AgentWorkSegment, ChatMessage, CodingMirrorEvent, LoopStatus, SupervisorCommand } from "@shared/protocol";
import LabNode, { type LabFlowNode, type LabNodeKind } from "./LabNode";
import TermNode, { type TermFlowNode } from "./TermNode";

const nodeTypes = { labAgent: LabNode, termAgent: TermNode };
type AnyFlowNode = LabFlowNode | TermFlowNode;

const MAGNET_RADIUS = 64;
const MAGNET_PULL = 11;

export interface AgentState {
  status: LoopStatus;
  messages: ChatMessage[];
  streaming: ChatMessage | null;
  /** When true, streaming text is final — typewriter then flush to messages */
  streamComplete?: boolean;
  mirror?: CodingMirrorEvent[];
  commands?: SupervisorCommand[];
  approval?: { headline: string; detail: string } | null;
  engine?: string;
  /** Real tool traces for Thinking / ToolChips (normal-mode bridge) */
  tools?: AgentToolTrace[];
  statusLabel?: string;
  /** Pending tool permission from Lab Coding stdio control_request */
  permission?: AgentPermissionPrompt | null;
  /** Model reasoning / thinking stream (collapsed when idle) */
  thinkingText?: string;
  /** Chronological thinking → tools → reply segments for the live turn. */
  timeline?: AgentWorkSegment[];
}

interface Props {
  lab: AgentState;
  coding: AgentState;
  nodes: LabNodeKind[];
  target: LabNodeKind;
  onSelectTarget: (kind: LabNodeKind) => void;
  onOpenDetail: (kind: LabNodeKind) => void;
  onAddNode: (kind: LabNodeKind) => void;
  onRemoveNode: (kind: LabNodeKind) => void;
}

const SPAWN_POS: Record<LabNodeKind, { x: number; y: number }> = {
  lab: { x: 120, y: 140 },
  coding: { x: 820, y: 200 },
};

export default function CanvasFlow({
  lab,
  coding,
  nodes: kinds,
  target,
  onSelectTarget,
  onOpenDetail,
  onAddNode,
  onRemoveNode,
}: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<AnyFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [interactiveNode, setInteractiveNode] = useState<LabNodeKind | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const handleRemoveNode = useCallback(
    (kind: LabNodeKind) => {
      setInteractiveNode((cur) => (cur === kind ? null : cur));
      onRemoveNode(kind);
    },
    [onRemoveNode],
  );

  // sync node set from kinds
  useEffect(() => {
    setNodes((prev) => {
      const existing = new Set(prev.map((n) => n.id));
      const next: AnyFlowNode[] = prev.filter((n) => kinds.includes(n.id as LabNodeKind));
      for (const kind of kinds) {
        if (!existing.has(kind)) {
          next.push({
            id: kind,
            type: "termAgent",
            position: SPAWN_POS[kind],
            data: {
              kind,
              onSelect: onSelectTarget,
              onOpenDetail,
              onEnterInteractive: setInteractiveNode,
              onRemove: handleRemoveNode,
            },
          } as AnyFlowNode);
        }
      }
      return next;
    });
  }, [kinds, onSelectTarget, onOpenDetail, handleRemoveNode, setNodes]);

  // live data sync into nodes
  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) => {
        const kind = n.id as LabNodeKind;
        const src = kind === "lab" ? lab : coding;
        return {
          ...n,
          data: {
            ...n.data,
            status: src.status,
            engine: src.engine,
            active: target === kind,
            interactive: interactiveNode === kind,
            onSelect: onSelectTarget,
            onOpenDetail,
            onEnterInteractive: setInteractiveNode,
            onRemove: handleRemoveNode,
          },
        };
      }),
    );
  }, [lab, coding, target, interactiveNode, onSelectTarget, onOpenDetail, handleRemoveNode, setNodes]);

  // auto-link lab->coding when both exist
  useEffect(() => {
    if (kinds.includes("lab") && kinds.includes("coding")) {
      setEdges((eds) => {
        if (eds.some((e) => e.id === "e-lab-coding")) return eds;
        return [
          ...eds,
          { id: "e-lab-coding", source: "lab", target: "coding", animated: false, style: { stroke: "var(--lab-edge)", strokeWidth: 2 } },
        ];
      });
    } else {
      setEdges((eds) => eds.filter((e) => e.id !== "e-lab-coding"));
    }
  }, [kinds, setEdges]);

  // Magnetic handles: near-cursor pull + reveal within radius
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const resetHandle = (h: HTMLElement) => {
      h.style.setProperty("--hx", "0px");
      h.style.setProperty("--hy", "0px");
      h.classList.remove("lab-handle-near");
    };

    const onMove = (e: MouseEvent) => {
      const handles = el.querySelectorAll<HTMLElement>(".lab-handle");
      handles.forEach((h) => {
        const rect = h.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const dist = Math.hypot(dx, dy);
        if (dist < MAGNET_RADIUS && dist > 0.5) {
          const t = 1 - dist / MAGNET_RADIUS;
          const pull = MAGNET_PULL * t * t;
          h.style.setProperty("--hx", `${(dx / dist) * pull}px`);
          h.style.setProperty("--hy", `${(dy / dist) * pull}px`);
          h.classList.add("lab-handle-near");
        } else {
          resetHandle(h);
        }
      });
    };

    const onLeave = () => {
      el.querySelectorAll<HTMLElement>(".lab-handle").forEach(resetHandle);
    };

    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [kinds.length]);

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge({ ...c, animated: false, style: { stroke: "var(--lab-edge)", strokeWidth: 2 } }, eds)),
    [setEdges],
  );

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      for (const n of deleted) {
        const kind = n.id as LabNodeKind;
        if (kind === "lab" || kind === "coding") handleRemoveNode(kind);
      }
    },
    [handleRemoveNode],
  );

  const styledEdges = useMemo(
    () =>
      edges.map((e) => ({
        ...e,
        type: "bezier",
        style: e.selected ? { stroke: "var(--lab-edge-strong)", strokeWidth: 3 } : { stroke: "var(--lab-edge)", strokeWidth: 2 },
      })),
    [edges],
  );

  // dblclick on pane to open add menu
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const pane = el.querySelector(".react-flow__pane");
    if (!pane) return;
    const onDbl = (e: Event) => {
      const target = e.target as HTMLElement;
      // ignore if dblclick originated inside a node
      if (target.closest(".term-node") || target.closest(".react-flow__node")) return;
      const rect = el.getBoundingClientRect();
      const me = e as MouseEvent;
      setCtxMenu({ x: me.clientX - rect.left, y: me.clientY - rect.top });
    };
    pane.addEventListener("dblclick", onDbl);
    return () => pane.removeEventListener("dblclick", onDbl);
  }, []);

  // click pane to exit interactive mode + close menu
  const onPaneClick = useCallback(() => {
    setCtxMenu(null);
    setInteractiveNode(null);
  }, []);

  // Esc to exit interactive
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInteractiveNode(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const addFromMenu = (kind: LabNodeKind) => {
    onAddNode(kind);
    setCtxMenu(null);
  };

  const openAddMenu = useCallback(() => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCtxMenu({ x: rect.width / 2 - 88, y: rect.height / 2 - 20 });
  }, []);

  const canAddLab = !kinds.includes("lab");
  const canAddCoding = !kinds.includes("coding");

  return (
    <div ref={wrapRef} className="relative h-full w-full">
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={styledEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodesDelete={onNodesDelete}
          onPaneClick={onPaneClick}
          onMoveStart={() => setCtxMenu(null)}
          nodeTypes={nodeTypes}
          connectionMode={ConnectionMode.Loose}
          connectionRadius={MAGNET_RADIUS}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          minZoom={0.3}
          maxZoom={1.6}
          zoomOnScroll
          zoomOnPinch
          zoomOnDoubleClick={false}
          panOnScroll={false}
          noPanClassName="nopan"
          noDragClassName="nodrag"
          noWheelClassName="nowheel"
          proOptions={{ hideAttribution: true }}
          style={{ background: "var(--lab-canvas)" }}
          fitView
          fitViewOptions={{ padding: 0.3, maxZoom: 1, minZoom: 0.7 }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.3} color="var(--lab-dot)" />
        </ReactFlow>
      </ReactFlowProvider>

      {/* empty state */}
      {kinds.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="pointer-events-auto rounded-2xl border border-dashed border-[var(--lab-border)] bg-[var(--lab-surface)]/60 px-8 py-10 text-center backdrop-blur">
            <div className="mb-2 text-[15px] font-medium text-[var(--lab-ink)]">空画布</div>
            <div className="mb-4 text-[12px] leading-relaxed text-[var(--lab-ink-3)]">
              双击空白处，或点下方按钮，添加一个 Agent 节点
              <br />
              （无实验时会自动新建一场）
            </div>
            <button
              type="button"
              onClick={openAddMenu}
              className="rounded-lg bg-[var(--lab-ink)] px-4 py-2 text-[12px] font-medium text-[var(--lab-bg)] hover:opacity-90"
            >
              ＋ 添加 Agent
            </button>
          </div>
        </div>
      ) : null}

      {/* dbl-click add menu */}
      {ctxMenu ? (
        <div
          className="absolute inset-0 z-30"
          onClick={() => setCtxMenu(null)}
          onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }}
        >
          <div
            className="absolute w-44 rounded-lg border border-[var(--lab-border)] bg-[var(--lab-surface-solid)] p-1 shadow-[0_12px_32px_#000a]"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-2 py-1 text-[9.5px] font-semibold tracking-[0.08em] text-[var(--lab-ink-3)]">添加 Agent</div>
            {(
              [
                { kind: "lab" as const, label: "Lab 监工", desc: "拆需求 · 派活", enabled: canAddLab },
                { kind: "coding" as const, label: "Coding Agent", desc: "真终端 · 写代码", enabled: canAddCoding },
              ]
            ).map((o) => (
              <button
                key={o.kind}
                type="button"
                disabled={!o.enabled}
                onClick={() => addFromMenu(o.kind)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)] disabled:opacity-35"
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ background: o.kind === "lab" ? "var(--lab-accent)" : "var(--lab-green)" }}
                />
                <span className="flex-1">{o.label}</span>
                <span className="text-[9.5px] text-[var(--lab-ink-3)]">{o.enabled ? o.desc : "已添加"}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
