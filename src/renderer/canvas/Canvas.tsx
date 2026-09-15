import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

export type CanvasNodeId = "lab" | "coding";

export interface CanvasNodeState {
  id: CanvasNodeId;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface CanvasProps {
  nodes: CanvasNodeState[];
  setNodes: React.Dispatch<React.SetStateAction<CanvasNodeState[]>>;
  renderNode: (n: CanvasNodeState) => ReactNode;
  edge?: { from: CanvasNodeId; to: CanvasNodeId };
  onBackgroundDoubleClick?: () => void;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 1.6;

export default function Canvas({ nodes, setNodes, renderNode, edge, onBackgroundDoubleClick }: CanvasProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 0.9 });
  const panRef = useRef<{ id: number; startX: number; startY: number; vx: number; vy: number } | null>(null);
  const dragRef = useRef<{ id: CanvasNodeId; startX: number; startY: number; nx: number; ny: number } | null>(null);

  const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      const el = ref.current;
      if (!el) return { x: sx, y: sy };
      const r = el.getBoundingClientRect();
      return { x: (sx - r.left - view.x) / view.scale, y: (sy - r.top - view.y) / view.scale };
    },
    [view],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const delta = -e.deltaY * 0.0018;
        setView((v) => {
          const next = clampScale(v.scale * (1 + delta));
          return { ...v, scale: next };
        });
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onCanvasPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-node]")) return;
    panRef.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, vx: view.x, vy: view.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onCanvasPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (pan && pan.id === e.pointerId) {
      setView((v) => ({ ...v, x: pan.vx + (e.clientX - pan.startX), y: pan.vy + (e.clientY - pan.startY) }));
    }
    const drag = dragRef.current;
    if (drag) {
      const w = screenToWorld(e.clientX, e.clientY);
      setNodes((prev) =>
        prev.map((n) => (n.id === drag.id ? { ...n, x: drag.nx + (w.x - drag.startX), y: drag.ny + (w.y - drag.startY) } : n)),
      );
    }
  };

  const endGesture = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (panRef.current?.id === e.pointerId) panRef.current = null;
    if (dragRef.current) dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const startNodeDrag = (e: ReactPointerEvent<HTMLDivElement>, n: CanvasNodeState) => {
    if (e.button !== 0) return;
    const w = screenToWorld(e.clientX, e.clientY);
    dragRef.current = { id: n.id, startX: w.x, startY: w.y, nx: n.x, ny: n.y };
    (e.currentTarget.parentElement?.parentElement as HTMLElement | null)?.setPointerCapture(e.pointerId);
    e.stopPropagation();
  };

  const edgePath = useMemo(() => {
    if (!edge) return null;
    const a = nodes.find((n) => n.id === edge.from);
    const b = nodes.find((n) => n.id === edge.to);
    if (!a || !b) return null;
    const aRight = { x: a.x + a.w, y: a.y + a.h / 2 };
    const aLeft = { x: a.x, y: a.y + a.h / 2 };
    const bRight = { x: b.x + b.w, y: b.y + b.h / 2 };
    const bLeft = { x: b.x, y: b.y + b.h / 2 };
    const aIsLeft = a.x + a.w / 2 <= b.x + b.w / 2;
    const p1 = aIsLeft ? aRight : aLeft;
    const p2 = aIsLeft ? bLeft : bRight;
    const dx = Math.max(80, Math.abs(p2.x - p1.x) * 0.5);
    const c1x = aIsLeft ? p1.x + dx : p1.x - dx;
    const c2x = aIsLeft ? p2.x - dx : p2.x + dx;
    return `M ${p1.x} ${p1.y} C ${c1x} ${p1.y}, ${c2x} ${p2.y}, ${p2.x} ${p2.y}`;
  }, [nodes, edge]);

  return (
    <div
      ref={ref}
      className="relative h-full w-full overflow-hidden bg-[var(--lab-bg)]"
      style={{
        backgroundImage:
          "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.045) 1px, transparent 0)",
        backgroundSize: "26px 26px",
      }}
      onPointerDown={onCanvasPointerDown}
      onPointerMove={onCanvasPointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
      onDoubleClick={onBackgroundDoubleClick}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      >
        {edgePath ? (
          <svg
            className="pointer-events-none absolute left-0 top-0 overflow-visible"
            width="1"
            height="1"
            style={{ overflow: "visible" }}
          >
            <path
              d={edgePath}
              fill="none"
              stroke="var(--lab-accent)"
              strokeWidth="1.6"
              strokeLinecap="round"
              opacity="0.85"
            />
            <path
              d={edgePath}
              fill="none"
              stroke="rgba(77,163,255,0.25)"
              strokeWidth="6"
              strokeLinecap="round"
              opacity="0.4"
            />
          </svg>
        ) : null}

        {nodes.map((n) => (
          <div
            key={n.id}
            data-node={n.id}
            className="absolute select-none"
            style={{ left: n.x, top: n.y, width: n.w, height: n.h }}
          >
            <div
              className="absolute -top-2 left-4 z-10 flex h-5 cursor-grab items-center rounded-full border border-[var(--lab-border)] bg-[var(--lab-surface)] px-2 text-[10px] text-[var(--lab-ink-3)] active:cursor-grabbing"
              onPointerDown={(e) => startNodeDrag(e, n)}
            >
              drag
            </div>
            <div className="h-full w-full overflow-hidden rounded-[18px] border border-[var(--lab-border)] bg-[var(--lab-surface)] shadow-[0_18px_50px_#000a]">
              {renderNode(n)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
