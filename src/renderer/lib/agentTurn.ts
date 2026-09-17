import type { AgentBridgeEvent, AgentToolTrace, ChatMessage, CodingMirrorEvent, LoopStatus } from "@shared/protocol";
import type { AgentState } from "../canvas/CanvasFlow";
import type { ThinkingRow } from "../harness/beautiful-ui/Thinking";
import type { ToolDiff, ToolDiffLine, ToolStep } from "../harness/beautiful-ui/ToolChips";

export function applyAgentEvent(state: AgentState, event: AgentBridgeEvent): AgentState {
  switch (event.kind) {
    case "status":
      return {
        ...state,
        statusLabel: event.text,
        status: state.permission
          ? "waiting"
          : state.streaming && !state.streamComplete
            ? "streaming"
            : state.tools?.some((t) => t.state === "running")
              ? "tool"
              : "thinking",
      };
    case "assistant_text": {
      const prev = state.streaming?.content ?? "";
      const nextContent = event.partial ? prev + event.text : event.text;
      return {
        ...state,
        streamComplete: false,
        status: state.permission ? "waiting" : "streaming",
        streaming: {
          id: state.streaming?.id ?? `a-stream-${Date.now()}`,
          role: "assistant",
          content: nextContent,
          ts: state.streaming?.ts ?? Date.now(),
          tools: state.streaming?.tools,
        },
      };
    }
    case "tool": {
      const tools = [...(state.tools ?? [])];
      const idx = tools.findIndex((t) => t.id === event.id);
      const row: AgentToolTrace = {
        id: event.id,
        name: event.name,
        summary: event.summary,
        state: event.state,
        file: event.file,
        add: event.add,
        del: event.del,
        detailLines: event.detailLines,
        ts: Date.now(),
      };
      if (idx >= 0) {
        tools[idx] = event.state === "error" ? row : { ...tools[idx], ...row };
      } else tools.push(row);

      const mirrorEv: CodingMirrorEvent = {
        id: event.id,
        kind: event.add !== undefined || event.del !== undefined ? "diff" : "tool",
        summary: `${event.name} · ${event.summary}`,
        detail: event.state,
        ts: Date.now(),
      };
      const mirror = [mirrorEv, ...(state.mirror ?? []).filter((m) => m.id !== event.id)].slice(0, 40);

      return {
        ...state,
        status: state.permission ? "waiting" : event.state === "running" ? "tool" : state.streaming && !state.streamComplete ? "streaming" : "tool",
        tools,
        mirror,
      };
    }
    case "thinking_text": {
      const prev = state.thinkingText ?? "";
      return {
        ...state,
        thinkingText: event.partial ? prev + event.text : event.text,
        status: state.permission
          ? "waiting"
          : state.tools?.some((t) => t.state === "running")
            ? "tool"
            : state.streaming && !state.streamComplete
              ? "streaming"
              : "thinking",
      };
    }
    case "permission":
      return {
        ...state,
        status: "waiting",
        statusLabel: event.questions?.length ? "请选择后继续" : "等待你批准工具权限",
        permission: {
          requestId: event.requestId,
          toolName: event.toolName,
          toolUseId: event.toolUseId,
          description: event.description,
          inputPreview: event.inputPreview,
          file: event.file,
          expiresAt: event.expiresAt,
          timeoutMs: event.timeoutMs,
          questions: event.questions,
        },
      };
    case "result": {
      // Local Stop already cleared the turn — ignore bridge "已停止" echo
      if (
        event.isError &&
        /已停止/.test(event.text || "") &&
        state.status === "idle" &&
        !state.streaming
      ) {
        return state;
      }
      const streamed = state.streaming?.content?.trim() ?? "";
      const text = event.text?.trim() || streamed || (event.isError ? "请求失败" : "");
      const tools = (state.tools ?? []).map((t) =>
        t.state === "running" ? { ...t, state: "done" as const } : t,
      );
      const interrupted = Boolean(event.isError && /已停止/.test(event.text || ""));
      const msg: ChatMessage = {
        id: state.streaming?.id ?? `a-${Date.now()}`,
        role: "assistant",
        content: interrupted && !streamed ? "（已中断）" : text || "(无输出)",
        ts: Date.now(),
        tools: tools.length ? tools : undefined,
        thinking: state.thinkingText?.trim() || undefined,
        interrupted: interrupted || undefined,
        error: Boolean(event.isError && !interrupted),
        engineUuid: event.messageUuid || state.streaming?.engineUuid,
        usage: event.usage || state.streaming?.usage,
      };
      // Keep streaming so typewriter can finish; UI flushes via commitStreamingReveal
      return {
        ...state,
        streaming: msg,
        streamComplete: true,
        permission: null,
        status: (event.isError ? "error" : "idle") as LoopStatus,
        statusLabel: undefined,
        tools,
      };
    }
    case "compact": {
      return {
        ...state,
        statusLabel: event.text || "已压缩上下文",
      };
    }
    case "error": {
      const msg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: `⚠ ${event.text}`,
        ts: Date.now(),
        tools: (state.tools ?? []).length ? state.tools : undefined,
        thinking: state.thinkingText?.trim() || undefined,
        error: true,
      };
      return {
        ...state,
        streaming: msg,
        streamComplete: true,
        permission: null,
        status: "error",
        statusLabel: undefined,
        tools: (state.tools ?? []).map((t) =>
          t.state === "running" ? { ...t, state: "error" as const } : t,
        ),
      };
    }
    default:
      return state;
  }
}

/** Move finished streaming bubble into messages (after typewriter catches up). */
export function commitStreamingReveal(state: AgentState): AgentState {
  if (!state.streaming || !state.streamComplete) return state;
  const msg = state.streaming;
  const already = state.messages.some((m) => m.id === msg.id);
  return {
    ...state,
    streaming: null,
    streamComplete: false,
    tools: [],
    thinkingText: undefined,
    messages: already ? state.messages : [...state.messages, msg],
  };
}

export function toolsToThinkingRows(tools: AgentToolTrace[]): ThinkingRow[] {
  return tools.map((t) => {
    const file = t.file ? t.file.replace(/^.*[/\\]/, "") : undefined;
    const failed = t.state === "error";
    return {
      primary: prettyToolName(t.name),
      secondary: file || t.summary,
      mono: Boolean(file) || /bash|shell|run/i.test(t.name),
      add: failed ? undefined : t.add,
      del: failed ? undefined : t.del,
      running: t.state === "running",
      error: failed,
      file: t.file,
    };
  });
}

export function toolsToChips(tools: AgentToolTrace[]): {
  steps: ToolStep[];
  diffs: ToolDiff[];
  diffLines: Record<string, ToolDiffLine[]>;
  header: string;
} {
  const steps: ToolStep[] = tools.map((t) => {
    const icon = toolIcon(t.name);
    const base = t.file ? t.file.replace(/^.*[/\\]/, "") : "";
    const detail: ToolStep["detail"] =
      t.detailLines?.map((l) => ({
        text: l.text,
        tone: l.tone === "add" ? ("add" as const) : undefined,
      })) ??
      (t.summary ? [{ text: t.summary }] : [{ text: t.state }]);
    return {
      icon,
      label: prettyToolName(t.name),
      chip: base || t.summary.slice(0, 80) || t.name,
      mono: Boolean(base) || icon === "run",
      detailMono: icon === "write" || icon === "run" || icon === "read",
      detail,
      filePath: t.file,
    };
  });

  const diffs: ToolDiff[] = [];
  const diffLines: Record<string, ToolDiffLine[]> = {};
  for (const t of tools) {
    if (t.state === "error") continue;
    if (!t.file) continue;
    if (t.add === undefined && t.del === undefined) continue;
    const base = t.file.replace(/^.*[/\\]/, "");
    diffs.push({ file: t.file, label: base, add: t.add ?? 0, del: t.del ?? 0 });
    if (t.detailLines?.length) {
      diffLines[t.file] = t.detailLines.map((l) => ({
        text: l.text,
        tone: l.tone === "del" ? "del" : l.tone === "ctx" ? "ctx" : "add",
      }));
    }
  }

  const running = tools.filter((t) => t.state === "running").length;
  const header =
    running > 0
      ? `${tools.length} tools · ${running} running`
      : `${tools.length} tool call${tools.length === 1 ? "" : "s"}${diffs.length ? ` · ${diffs.length} file${diffs.length === 1 ? "" : "s"}` : ""}`;

  return { steps, diffs, diffLines, header };
}

function prettyToolName(name: string): string {
  const n = name.replace(/Tool$/, "");
  if (/^read$/i.test(n)) return "Read";
  if (/edit|strreplace|replace/i.test(n)) return "Edit";
  if (/write|create/i.test(n)) return "Write";
  if (/bash|shell|run/i.test(n)) return "Run";
  if (/glob/i.test(n)) return "Glob";
  if (/grep/i.test(n)) return "Grep";
  return n.charAt(0).toUpperCase() + n.slice(1);
}

function toolIcon(name: string): string {
  if (/write|create|edit|strreplace|replace/i.test(name)) return "write";
  if (/bash|shell|run/i.test(name)) return "run";
  if (/read|view|glob|grep/i.test(name)) return "read";
  return "think";
}
