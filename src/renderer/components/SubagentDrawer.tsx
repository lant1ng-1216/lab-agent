import { useEffect, useMemo, useRef, useState } from "react";
import type { SubagentTrace } from "@shared/protocol";

/**
 * Sub-agent drawer (Codex-style): a persistent top-right pill showing how many
 * child agents are working, and a compact right-hand panel that lists each
 * sub-agent with live progress (last tool, tool count, elapsed, tokens).
 *
 * The panel is a real pane, not a modal: it reserves its own column so the
 * transcript never sits underneath it. Auto-opens on the first running
 * sub-agent and auto-closes once every sub-agent is terminal — unless the
 * user pinned it open.
 */

const PIN_KEY = "lab.subagentDrawer.pinned";

export function loadSubagentPin(): boolean {
  try {
    return localStorage.getItem(PIN_KEY) === "1";
  } catch {
    return false;
  }
}

function saveSubagentPin(pinned: boolean): void {
  try {
    localStorage.setItem(PIN_KEY, pinned ? "1" : "0");
  } catch {
    /* ignore quota / private-mode failures */
  }
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m < 60) return `${m}m ${String(s).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function statusMeta(status: SubagentTrace["status"]): { dot: string; label: string; text: string } {
  switch (status) {
    case "running":
      return { dot: "bg-[var(--lab-accent)] motion-safe:animate-pulse", label: "运行中", text: "text-[var(--lab-accent)]" };
    case "completed":
      return { dot: "bg-[var(--lab-green,#3ecf8e)]", label: "已完成", text: "text-[var(--lab-green,#3ecf8e)]" };
    case "failed":
      return { dot: "bg-[var(--lab-red)]", label: "失败", text: "text-[var(--lab-red)]" };
    default:
      return { dot: "bg-[var(--lab-ink-3)]", label: "已停止", text: "text-[var(--lab-ink-3)]" };
  }
}

function SubagentRow({ agent, now }: { agent: SubagentTrace; now: number }) {
  const meta = statusMeta(agent.status);
  const running = agent.status === "running";
  const elapsed = running
    ? (agent.durationMs ?? 0) + Math.max(0, now - agent.ts)
    : (agent.durationMs ?? 0);
  const detail =
    agent.lastToolName && running
      ? `正在 ${agent.lastToolName}`
      : agent.summary || (agent.taskType ? agent.taskType : "");

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-[var(--lab-border-soft)] bg-[var(--lab-surface-solid)] px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span className={`size-1.5 shrink-0 rounded-full ${meta.dot}`} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--lab-ink)]" title={agent.description}>
          {agent.description}
        </span>
        {agent.taskType ? (
          <span className="shrink-0 rounded border border-[var(--lab-border-soft)] px-1 py-px text-[9px] uppercase tracking-wide text-[var(--lab-ink-3)]">
            {agent.taskType}
          </span>
        ) : null}
      </div>
      {detail ? (
        <div className="truncate pl-3.5 font-[var(--lab-mono)] text-[10.5px] text-[var(--lab-ink-3)]" title={detail}>
          {detail}
        </div>
      ) : null}
      <div className="flex items-center gap-2 pl-3.5 text-[10px] tabular-nums text-[var(--lab-ink-3)]">
        <span className={meta.text}>{meta.label}</span>
        <span className="ml-auto">{formatDuration(elapsed)}</span>
        {agent.toolUses ? <span>{agent.toolUses} 工具</span> : null}
        {agent.totalTokens ? <span>{formatTokens(agent.totalTokens)} tok</span> : null}
      </div>
    </div>
  );
}

export default function SubagentDrawer({
  subagents,
  open,
  pinned,
  onTogglePin,
}: {
  subagents: SubagentTrace[];
  open: boolean;
  pinned: boolean;
  onTogglePin: (pinned: boolean) => void;
}) {
  const runningCount = useMemo(
    () => subagents.filter((s) => s.status === "running").length,
    [subagents],
  );
  const [now, setNow] = useState(() => Date.now());

  // Live elapsed ticker — only while something is running.
  useEffect(() => {
    if (!runningCount) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [runningCount, subagents]);

  // Close-on-Escape is handled in NormalChatView so the drawer can stay dumb.

  const togglePin = () => {
    const next = !pinned;
    saveSubagentPin(next);
    onTogglePin(next);
  };

  if (!subagents.length) return null;

  const total = subagents.length;

  // Collapsed rail: a slim column so the pill never overlaps the pane.
  if (!open) {
    return (
      <div className="titlebar-no-drag relative flex h-full w-11 shrink-0 flex-col items-center border-l border-[var(--lab-border-soft)] bg-[var(--lab-surface-solid)] py-2" data-lab-glass>
        <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto px-0.5 py-1">
          {subagents.map((agent) => {
            const meta = statusMeta(agent.status);
            return (
              <span
                key={agent.id}
                title={`${meta.label} · ${agent.description}`}
                className={`size-2 shrink-0 rounded-full ${meta.dot}`}
                aria-hidden
              />
            );
          })}
        </div>
        <span className="mt-1 shrink-0 text-[9px] tabular-nums text-[var(--lab-ink-3)]" style={{ writingMode: "vertical-rl" }}>
          {runningCount > 0 ? `${runningCount} 运行中` : `${total} 子 agent`}
        </span>
      </div>
    );
  }

  return (
    <aside
      className="titlebar-no-drag relative flex h-full w-[252px] max-w-[40vw] shrink-0 flex-col border-l border-[var(--lab-border)] bg-[var(--lab-surface-solid)]"
      data-lab-glass
      aria-label="子 agent 面板"
    >
      <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-[var(--lab-border-soft)] px-2.5">
        <button
          type="button"
          onClick={togglePin}
          className={`flex size-6 shrink-0 items-center justify-center rounded-md border text-[11px] ${
            pinned
              ? "border-[var(--lab-accent)]/40 bg-[var(--lab-accent)]/10 text-[var(--lab-accent)]"
              : "border-[var(--lab-border-soft)] text-[var(--lab-ink-3)] hover:text-[var(--lab-ink)]"
          }`}
          title={pinned ? "已钉住：全部完成后不自动收起" : "钉住面板"}
          aria-pressed={pinned}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 17v5" />
            <path d="M9 10.8V4h6v6.8l1.6 2.4H7.4z" />
          </svg>
        </button>
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[var(--lab-ink)]">
          子 agent
          <span className="ml-1.5 text-[11px] font-normal text-[var(--lab-ink-3)]">
            {runningCount ? `${runningCount}/${total} 运行中` : `${total} 个`}
          </span>
        </span>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
        {subagents.map((agent) => (
          <SubagentRow key={agent.id} agent={agent} now={now} />
        ))}
      </div>
    </aside>
  );
}
