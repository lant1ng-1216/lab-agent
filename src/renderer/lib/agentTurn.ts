import type {
  AgentBridgeEvent,
  AgentToolTrace,
  AgentWorkSegment,
  ChatMessage,
  CodingMirrorEvent,
  LoopStatus,
} from "@shared/protocol";
import type { AgentState } from "../canvas/CanvasFlow";
import type { ThinkingRow } from "../harness/beautiful-ui/Thinking";
import type { ToolDiff, ToolDiffLine, ToolStep } from "../harness/beautiful-ui/ToolChips";

function newWorkSegment(phase: AgentWorkSegment["phase"]): AgentWorkSegment {
  return {
    id: `work-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    phase,
    tools: [],
    ts: Date.now(),
  };
}

function hasVisibleReply(segment: AgentWorkSegment | undefined): boolean {
  return Boolean(segment?.content?.trim());
}

function updateCurrentSegment(
  timeline: AgentWorkSegment[] | undefined,
  phase: AgentWorkSegment["phase"],
  splitWhen: (current: AgentWorkSegment | undefined) => boolean,
): { timeline: AgentWorkSegment[]; current: AgentWorkSegment } {
  const next = (timeline ?? []).map((segment) => ({
    ...segment,
    tools: segment.tools ? [...segment.tools] : [],
  }));
  const previous = next[next.length - 1];
  const current = !previous || splitWhen(previous) ? newWorkSegment(phase) : { ...previous, phase };
  if (!previous || current.id !== previous.id) next.push(current);
  else next[next.length - 1] = current;
  return { timeline: next, current };
}

function replaceToolInTimeline(timeline: AgentWorkSegment[], tool: AgentToolTrace): AgentWorkSegment[] {
  const next = timeline.map((segment) => ({
    ...segment,
    tools: segment.tools ? [...segment.tools] : [],
  }));
  for (let i = next.length - 1; i >= 0; i--) {
    const tools = next[i]!.tools ?? [];
    const index = tools.findIndex((item) => item.id === tool.id);
    if (index < 0) continue;
    tools[index] = tool;
    next[i] = { ...next[i], tools };
    return next;
  }
  const last = next[next.length - 1];
  if (last) next[next.length - 1] = { ...last, tools: [...(last.tools ?? []), tool] };
  return next;
}

function syncTimelineTools(timeline: AgentWorkSegment[], tools: AgentToolTrace[]): AgentWorkSegment[] {
  const byId = new Map(tools.map((tool) => [tool.id, tool]));
  return timeline.map((segment) => ({
    ...segment,
    tools: segment.tools?.map((tool) => byId.get(tool.id) ?? tool) ?? [],
  }));
}

function finishTimeline(
  timeline: AgentWorkSegment[] | undefined,
  tools: AgentToolTrace[],
  text: string,
  error: boolean,
): AgentWorkSegment[] {
  const next = syncTimelineTools(timeline ?? [], tools);
  if (!next.length) {
    const segment = newWorkSegment(error ? "error" : "done");
    segment.content = text;
    return [segment];
  }
  const last = next[next.length - 1]!;
  const hasSegmentContent = next.some((segment) => Boolean(segment.content?.trim()));
  next[next.length - 1] = {
    ...last,
    phase: error ? "error" : "done",
    content: hasSegmentContent ? last.content : text || last.content,
  };
  return next.map((segment) => ({ ...segment, phase: error ? "error" : segment.id === last.id ? segment.phase : "done" }));
}

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
    case "heartbeat":
      return {
        ...state,
        activity: {
          phase: event.phase,
          toolName: event.toolName,
          toolUseId: event.toolUseId,
          elapsedMs: event.elapsedMs,
          detail: event.detail,
          ts: event.ts,
        },
        status: state.permission
          ? "waiting"
          : event.phase === "tool"
            ? "tool"
            : event.phase === "streaming"
              ? "streaming"
              : event.phase === "waiting"
                ? "waiting"
                : "thinking",
      };
    case "assistant_text": {
      const prev = state.streaming?.content ?? "";
      const nextContent = event.partial ? prev + event.text : event.text;
      const segmentUpdate = updateCurrentSegment(
        state.timeline,
        "reply",
        (current) => !current || current.phase === "done" || current.phase === "error",
      );
      const current = segmentUpdate.current;
      current.content = event.partial ? `${current.content ?? ""}${event.text}` : event.text;
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
          timeline: segmentUpdate.timeline,
        },
        timeline: segmentUpdate.timeline,
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

      const segmentUpdate = updateCurrentSegment(
        state.timeline,
        "tools",
        (current) => Boolean(
          current && (
            hasVisibleReply(current) ||
            current.phase === "done" ||
            current.phase === "error"
          ),
        ),
      );
      const timeline = replaceToolInTimeline(segmentUpdate.timeline, row);
      const current = timeline[timeline.length - 1]!;
      current.tools = current.tools?.some((tool) => tool.id === row.id)
        ? current.tools
        : [...(current.tools ?? []), row];

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
        timeline,
        streaming: state.streaming ? { ...state.streaming, timeline } : state.streaming,
        mirror,
      };
    }
    case "thinking_text": {
      const prev = state.thinkingText ?? "";
      const segmentUpdate = updateCurrentSegment(
        state.timeline,
        "thinking",
        (current) => Boolean(
          current && (
            hasVisibleReply(current) ||
            current.phase === "done" ||
            current.phase === "error"
          ),
        ),
      );
      const current = segmentUpdate.current;
      current.thinking = event.partial ? `${current.thinking ?? ""}${event.text}` : event.text;
      return {
        ...state,
        thinkingText: event.partial ? prev + event.text : event.text,
        timeline: segmentUpdate.timeline,
        streaming: state.streaming ? { ...state.streaming, timeline: segmentUpdate.timeline } : state.streaming,
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
      {
        const segmentUpdate = updateCurrentSegment(
          state.timeline,
          "waiting",
          (current) => Boolean(current && (current.phase === "reply" || current.phase === "done" || current.phase === "error")),
        );
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
          questions: event.questions,
        },
        timeline: segmentUpdate.timeline,
        streaming: state.streaming ? { ...state.streaming, timeline: segmentUpdate.timeline } : state.streaming,
      };
      }
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
      const timeline = finishTimeline(state.timeline, tools, text, Boolean(event.isError && !interrupted));
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
        peakContextUsage: event.peakContextUsage || state.streaming?.peakContextUsage,
        contextRequestCount: event.contextRequestCount ?? state.streaming?.contextRequestCount,
        timeline,
      };
      // Keep streaming so typewriter can finish; UI flushes via commitStreamingReveal
      return {
        ...state,
        streaming: msg,
        streamComplete: true,
        activity: null,
        permission: null,
        status: (event.isError ? "error" : "idle") as LoopStatus,
        statusLabel: undefined,
        tools,
        timeline,
      };
    }
    case "compact": {
      return {
        ...state,
        statusLabel: event.text || "已压缩上下文",
      };
    }
    case "error": {
      const tools = (state.tools ?? []).map((t) =>
        t.state === "running" ? { ...t, state: "error" as const } : t,
      );
      const timeline = finishTimeline(state.timeline, tools, `⚠ ${event.text}`, true);
      const msg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: `⚠ ${event.text}`,
        ts: Date.now(),
        tools: tools.length ? tools : undefined,
        thinking: state.thinkingText?.trim() || undefined,
        error: true,
        timeline,
      };
      return {
        ...state,
        streaming: msg,
        streamComplete: true,
        activity: null,
        permission: null,
        status: "error",
        statusLabel: undefined,
        tools,
        timeline,
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
    activity: null,
    tools: [],
    thinkingText: undefined,
    timeline: [],
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
