/**
 * Dual session buckets — normal ↔ supervisor must NOT share lists.
 * Future optional merge lives behind SessionBridge (default off).
 */

import type { AgentState } from "../canvas/CanvasFlow";
import type { LabNodeKind } from "../canvas/LabNode";

export type ShellMode = "normal" | "supervisor";

export interface Experiment {
  id: string;
  name: string;
  ts: number;
  workdir: string | null;
  /** Pin to top of sidebar */
  pinned?: boolean;
  /** Soft-hide from main list */
  archived?: boolean;
  /** Last Lab Code engine session UUID (resume across Desktop restarts; purge on hard-delete) */
  engineSessionId?: string | null;
  /** After withdraw/edit: next prompt uses --resume-session-at this uuid */
  engineResumeAt?: string | null;
  /** Fallback when tip uuid unknown: cut JSONL before this user text on next prompt */
  engineCutBefore?: string | null;
  /** Cumulative token usage for this section */
  tokenTotals?: import("@shared/protocol").SectionTokenTotals | null;
  /** Latest turn usage (context fill %) */
  lastTurnUsage?: import("@shared/protocol").TokenUsageSnapshot | null;
  nodes: LabNodeKind[];
  lab: AgentState;
  coding: AgentState;
}

export type SessionBucket = { experiments: Experiment[]; activeId: string | null };

const LEGACY_KEY = "lab.experiments.v1";
const NORMAL_KEY = "lab.sessions.normal.v1";
const SUPERVISOR_KEY = "lab.sessions.supervisor.v1";

function storeKey(mode: ShellMode) {
  return mode === "normal" ? NORMAL_KEY : SUPERVISOR_KEY;
}

export function loadSessionBucket(mode: ShellMode): SessionBucket {
  try {
    const raw = localStorage.getItem(storeKey(mode));
    if (raw) {
      const d = JSON.parse(raw);
      return sanitizeBucket({
        experiments: d.experiments ?? [],
        activeId: d.activeId ?? null,
      });
    }
  } catch {}

  // One-time: legacy shared store → supervisor only (never into normal)
  if (mode === "supervisor") {
    try {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const d = JSON.parse(legacy);
        const bucket = sanitizeBucket({
          experiments: d.experiments ?? [],
          activeId: d.activeId ?? null,
        });
        saveSessionBucket("supervisor", bucket);
        localStorage.removeItem(LEGACY_KEY);
        return bucket;
      }
    } catch {}
  }

  return { experiments: [], activeId: null };
}

/** Clear ghost busy state after crash / kill / reload */
export function sanitizeAgentState(state: AgentState | undefined | null): AgentState {
  const base: AgentState = state ?? {
    status: "idle",
    messages: [],
    streaming: null,
    tools: [],
  };
  const tools = (base.tools ?? []).map((t) =>
    t.state === "running"
      ? { ...t, state: "error" as const, summary: `${t.summary} · 已中断`, add: undefined, del: undefined }
      : t,
  );
  const busyStatus =
    base.status === "thinking" ||
    base.status === "streaming" ||
    base.status === "tool" ||
    base.status === "waiting";
  return {
    ...base,
    tools,
    streaming: null,
    streamComplete: false,
    permission: null,
    approval: null,
    status: busyStatus || base.streaming ? "idle" : base.status,
    statusLabel: undefined,
  };
}

function sanitizeBucket(bucket: SessionBucket): SessionBucket {
  return {
    activeId: bucket.activeId,
    experiments: (bucket.experiments ?? []).map((e) => ({
      ...e,
      lab: sanitizeAgentState(e.lab),
      coding: sanitizeAgentState(e.coding),
    })),
  };
}

/** Local Stop / unlock without waiting for bridge events */
export function interruptAgentState(state: AgentState): AgentState {
  const tools = (state.tools ?? []).map((t) =>
    t.state === "running"
      ? { ...t, state: "error" as const, summary: `${t.summary} · 已停止`, add: undefined, del: undefined }
      : t,
  );
  const streamed = state.streaming?.content?.trim();
  const archivedTools = tools.length ? tools : state.streaming?.tools;
  const thinking = state.thinkingText?.trim() || state.streaming?.thinking;
  const shouldArchive = Boolean(streamed || archivedTools?.length || thinking);
  const messages = shouldArchive
    ? [
        ...state.messages,
        {
          id: state.streaming?.id ?? `stop-${Date.now()}`,
          role: "assistant" as const,
          content: streamed || "（已中断）",
          ts: Date.now(),
          tools: archivedTools,
          thinking,
          interrupted: true,
        },
      ]
    : state.messages;
  return {
    ...state,
    tools: [],
    streaming: null,
    streamComplete: false,
    permission: null,
    approval: null,
    status: "idle",
    statusLabel: undefined,
    thinkingText: undefined,
    messages,
  };
}

export function saveSessionBucket(mode: ShellMode, bucket: SessionBucket) {
  try {
    localStorage.setItem(storeKey(mode), JSON.stringify(bucket));
  } catch {}
}

/**
 * Reserved for a future update that may optionally sync/migrate sessions
 * across shell modes. Must stay disabled until product explicitly turns it on.
 */
export const SessionBridge = {
  enabled: false as const,
  /** @deprecated placeholder — do not call in production paths */
  transfer(_from: ShellMode, _to: ShellMode, _sessionId: string): never {
    throw new Error("SessionBridge is reserved for a future update and is disabled.");
  },
};
