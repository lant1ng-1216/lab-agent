import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, CodingMirrorEvent, LoopStatus } from "@shared/protocol";
import {
  ConversationShell,
  Composer,
  TitleBar,
  UserBubble,
  AssistantBlock,
  ThinkingRow,
  ToolRow,
  StreamText,
  ApprovalPanel,
} from "../harness";

export default function SupervisorApp() {
  const [status, setStatus] = useState<LoopStatus>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "我是 Lab 监工。先说清楚你要做什么；确认后我会经指令通道派给 Coding。",
      ts: Date.now(),
    },
  ]);
  const [streamingMsg, setStreamingMsg] = useState<ChatMessage | null>(null);
  const [mirror, setMirror] = useState<CodingMirrorEvent[]>([]);
  const [approval, setApproval] = useState<{ headline: string; detail: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasSavedKey, setHasSavedKey] = useState(false);
  const [keySaveStatus, setKeySaveStatus] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const pendingStream = useRef(false);

  useEffect(() => {
    document.documentElement.classList.add("dark");
    void window.lab.getMirrorSnapshot().then(setMirror);
    void window.lab.getSettings().then((settings) => setHasSavedKey(settings.hasKey));
    const offChat = window.lab.onChatStream((msg) => {
      if (msg.role === "user") {
        setMessages((prev) => [...prev, msg]);
        return;
      }
      pendingStream.current = true;
      setStreamingMsg(msg);
      setStatus("streaming");
    });
    const offMirror = window.lab.onMirrorEvent((ev) => {
      setMirror((prev) => [ev, ...prev].slice(0, 40));
    });
    const offStatus = window.lab.onLoopStatus((s) => {
      if (s === "idle" && pendingStream.current) return;
      setStatus(s);
    });
    return () => {
      offChat();
      offMirror();
      offStatus();
    };
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamingMsg, status, approval, mirror]);

  const mirrorRows = useMemo(() => mirror.slice(0, 5), [mirror]);
  const busy = status === "thinking" || Boolean(streamingMsg);
  const canSend = draft.trim().length > 0 && status === "idle" && !streamingMsg;

  const send = () => {
    if (!canSend) return;
    const text = draft.trim();
    setDraft("");
    setStatus("thinking");
    void window.lab.sendChat(text);
  };

  return (
    <div className="lab-root flex flex-col">
      <TitleBar title="Lab · 监工" status={status} />

      <ConversationShell scrollerRef={scroller}>
        {/* Read-only coding mirror strip — like harness trajectory crumbs */}
        <div className="rounded-xl border border-[var(--lab-border-soft)] bg-[var(--lab-inset)] px-2.5 py-2">
          <div className="mb-1 text-[10px] font-semibold tracking-[0.08em] text-[var(--lab-ink-3)]">
            CODING MIRROR · READ-ONLY
          </div>
          {mirrorRows.length === 0 ? (
            <div className="text-[11.5px] text-[var(--lab-ink-3)]">尚无镜像事件</div>
          ) : (
            <div className="space-y-0.5">
              {mirrorRows.map((m) => (
                <ToolRow key={m.id} title={m.kind} summary={m.summary} state="done" />
              ))}
            </div>
          )}
        </div>

        {messages.map((msg) =>
          msg.role === "user" ? (
            <UserBubble key={msg.id}>{msg.content}</UserBubble>
          ) : (
            <AssistantBlock key={msg.id} name="Lab" role="监工">
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </AssistantBlock>
          ),
        )}

        {status === "thinking" ? <ThinkingRow label="监工梳理意图" /> : null}

        {streamingMsg ? (
          <AssistantBlock name="Lab" role="监工">
            <StreamText
              text={streamingMsg.content}
              onDone={() => {
                const finalized = streamingMsg;
                pendingStream.current = false;
                setMessages((prev) => [...prev, finalized]);
                setStreamingMsg(null);
                setStatus("idle");
                if (/确认|PRD|验收|打回|偏离|派/.test(finalized.content)) {
                  setApproval({
                    headline: "确认后派发 Coding",
                    detail: finalized.content.slice(0, 280),
                  });
                }
              }}
            />
          </AssistantBlock>
        ) : null}

        {approval ? (
          <ApprovalPanel
            headline={approval.headline}
            detail={approval.detail}
            onDismiss={() => setApproval(null)}
            onReject={() => {
              window.lab.sendCommand({
                id: `cmd-${Date.now()}`,
                type: "reject",
                payload: approval.detail,
                ts: Date.now(),
              });
              setApproval(null);
            }}
            onApprove={() => {
              window.lab.sendCommand({
                id: `cmd-${Date.now()}`,
                type: "instruction",
                payload: approval.detail,
                ts: Date.now(),
              });
              setApproval(null);
            }}
          />
        ) : null}
      </ConversationShell>

      <Composer
        value={draft}
        onChange={setDraft}
        onSend={send}
        placeholder="跟监工说…"
        disabled={busy}
        canSend={canSend}
        footerLeft={
          <div className="flex min-w-0 items-center gap-1">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setKeySaveStatus("");
              }}
              placeholder={hasSavedKey ? "本机已有加密 Key；输入新 Key 可替换" : "DeepSeek Key"}
              className="min-w-0 flex-1 rounded-md border border-[var(--lab-border)] bg-[var(--lab-inset)] px-1.5 py-1 text-[10.5px] text-[var(--lab-ink-2)] outline-none"
            />
            <button
              type="button"
              className="shrink-0 rounded-md px-1.5 py-1 text-[10.5px] text-[var(--lab-ink-3)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
              onClick={() => {
                if (!apiKey.trim()) return;
                void window.lab.setApiKey(apiKey.trim()).then((saved) => {
                  setKeySaveStatus(saved ? "已加密保存" : "系统凭据加密不可用，未保存");
                  if (saved) {
                    setHasSavedKey(true);
                    setApiKey("");
                  }
                });
              }}
            >
              {keySaveStatus || "保存"}
            </button>
          </div>
        }
      />
    </div>
  );
}
