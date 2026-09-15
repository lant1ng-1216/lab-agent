import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, CodingMirrorEvent, LoopStatus, SupervisorCommand } from "@shared/protocol";
import {
  ApprovalPanel,
  AssistantBlock,
  StreamText,
  ThinkingRow,
  ToolRow,
  UserBubble,
} from "@harness";

export type AgentId = "lab" | "coding";
export type AgentLoopStatus = LoopStatus;

export interface AgentSnapshot {
  id: AgentId;
  status: AgentLoopStatus;
  messages: ChatMessage[];
  streaming: ChatMessage | null;
  mirror?: CodingMirrorEvent[];
  commands?: SupervisorCommand[];
  approval?: { headline: string; detail: string } | null;
  engine?: string;
}

interface AgentNodeProps {
  snap: AgentSnapshot;
  onSend: (text: string) => void;
  onApproval?: (action: "approve" | "reject", detail: string) => void;
  onDismissApproval?: () => void;
}

export default function AgentNode({ snap, onSend, onApproval, onDismissApproval }: AgentNodeProps) {
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const isLab = snap.id === "lab";
  const busy = snap.status === "thinking" || Boolean(snap.streaming);
  const canSend = draft.trim().length > 0 && snap.status === "idle" && !snap.streaming;

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [snap.messages, snap.streaming, snap.status, snap.mirror, snap.approval]);

  const accent = isLab ? "var(--lab-accent)" : "var(--lab-green)";
  const title = isLab ? "Lab Agent" : "Coding Agent";
  const subtitle = isLab ? "监工 · 不写代码" : `engine · ${snap.engine ?? "DeepSeek"}`;

  const send = () => {
    if (!canSend) return;
    const text = draft.trim();
    setDraft("");
    onSend(text);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--lab-border-soft)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: accent }} />
          <div>
            <div className="text-[12.5px] font-semibold text-[var(--lab-ink)]">{title}</div>
            <div className="text-[10.5px] text-[var(--lab-ink-3)]">{subtitle}</div>
          </div>
        </div>
        <span className="rounded-full border border-[var(--lab-border)] px-2 py-0.5 text-[10px] text-[var(--lab-ink-3)]">
          {snap.status}
        </span>
      </header>

      {isLab && snap.mirror && snap.mirror.length > 0 ? (
        <div className="shrink-0 border-b border-[var(--lab-border-soft)] bg-[var(--lab-inset)] px-3 py-2">
          <div className="mb-1 text-[9px] font-semibold tracking-[0.08em] text-[var(--lab-ink-3)]">
            CODING MIRROR · READ-ONLY
          </div>
          <div className="space-y-0.5">
            {snap.mirror.slice(0, 3).map((m) => (
              <ToolRow key={m.id} title={m.kind} summary={m.summary} state="done" />
            ))}
          </div>
        </div>
      ) : null}

      <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-3">
        {snap.messages.map((msg) =>
          msg.role === "user" ? (
            <UserBubble key={msg.id}>{msg.content}</UserBubble>
          ) : (
            <AssistantBlock key={msg.id} name={title} role={isLab ? "监工" : "coding"}>
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </AssistantBlock>
          ),
        )}

        {!isLab && snap.commands && snap.commands.length > 0 ? (
          <div className="space-y-1 border-y border-[var(--lab-border-soft)] py-2">
            {snap.commands.slice(0, 4).map((c) => (
              <ToolRow key={c.id} title={c.type} summary={c.payload} state="done" />
            ))}
          </div>
        ) : null}

        {snap.status === "thinking" ? <ThinkingRow label={isLab ? "监工梳理意图" : "Coding thinking"} /> : null}

        {snap.streaming ? (
          <AssistantBlock name={title} role={isLab ? "监工" : "coding"}>
            <StreamText text={snap.streaming.content} />
          </AssistantBlock>
        ) : null}

        {snap.approval ? (
          <ApprovalPanel
            headline={snap.approval.headline}
            detail={snap.approval.detail}
            onDismiss={onDismissApproval}
            onReject={() => snap.approval && onApproval?.("reject", snap.approval.detail)}
            onApprove={() => snap.approval && onApproval?.("approve", snap.approval.detail)}
          />
        ) : null}
      </div>

      <div className="shrink-0 border-t border-[var(--lab-border-soft)] bg-[var(--lab-surface)] p-2.5">
        <div className="rounded-xl border border-[var(--lab-border)] bg-[var(--lab-composer-bg)] p-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder={isLab ? "跟监工说…" : "跟 Coding 说…"}
            disabled={busy}
            className="max-h-24 w-full resize-none bg-transparent text-[13px] leading-[1.45] text-[var(--lab-ink)] outline-none placeholder:text-[var(--lab-ink-3)] disabled:opacity-50"
          />
          <div className="mt-1 flex justify-end">
            <button
              type="button"
              disabled={!canSend}
              onClick={send}
              className="flex size-7 items-center justify-center rounded-lg enabled:active:scale-[0.96] disabled:opacity-40"
              style={{
                background: canSend ? "var(--lab-ink)" : "var(--lab-hover)",
                color: canSend ? "var(--lab-bg)" : "var(--lab-ink-3)",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
