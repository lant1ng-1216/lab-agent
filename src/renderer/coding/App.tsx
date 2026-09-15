import { useEffect, useRef, useState } from "react";
import type { ChatMessage, LoopStatus, SupervisorCommand } from "@shared/protocol";
import {
  AppFrame,
  SidebarRail,
  SidebarItem,
  ConversationShell,
  Composer,
  TitleBar,
  UserBubble,
  AssistantBlock,
  ThinkingRow,
  ToolRow,
  StreamText,
} from "../harness";

export default function CodingApp() {
  const [status, setStatus] = useState<LoopStatus>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Coding 就绪。在此对话，或等监工经指令通道派活。",
      ts: Date.now(),
    },
  ]);
  const [streamingMsg, setStreamingMsg] = useState<ChatMessage | null>(null);
  const [commands, setCommands] = useState<SupervisorCommand[]>([]);
  const [tools, setTools] = useState<{ id: string; title: string; summary: string; state: "running" | "done" }[]>([]);
  const [rightOpen, setRightOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const pendingStream = useRef(false);

  useEffect(() => {
    document.documentElement.classList.add("dark");
    const offChat = window.lab.onChatStream((msg) => {
      if (msg.role === "user") {
        setMessages((prev) => [...prev, msg]);
        return;
      }
      pendingStream.current = true;
      setStreamingMsg(msg);
      setStatus("streaming");
    });
    const offCmd = window.lab.onCommand((cmd) => {
      setCommands((prev) => [cmd, ...prev].slice(0, 20));
      setTools((prev) => [
        {
          id: cmd.id,
          title: cmd.type,
          summary: cmd.payload.slice(0, 120),
          state: "done",
        },
        ...prev,
      ].slice(0, 30));
    });
    const offStatus = window.lab.onLoopStatus((s) => {
      if (s === "idle" && pendingStream.current) return;
      setStatus(s);
      if (s === "tool") {
        setTools((prev) => [
          {
            id: `tool-${Date.now()}`,
            title: "tool",
            summary: "agent tool call",
            state: "running",
          },
          ...prev.filter((t) => t.state !== "running"),
        ].slice(0, 30));
      }
      if (s === "idle") {
        setTools((prev) => prev.map((t) => (t.state === "running" ? { ...t, state: "done" } : t)));
      }
    });
    return () => {
      offChat();
      offCmd();
      offStatus();
    };
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamingMsg, status, tools]);

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
    <div className="lab-root">
      <AppFrame
        header={
          <TitleBar
            title="Lab Agent · Coding"
            status={status}
            trailing={
              <button
                type="button"
                className="titlebar-no-drag rounded-md px-2 py-1 text-[11px] text-[var(--lab-ink-3)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
                onClick={() => setRightOpen((v) => !v)}
              >
                {rightOpen ? "收起预览" : "预览"}
              </button>
            }
          />
        }
        sidebarWidth={200}
        rightbarOpen={rightOpen}
        rightbarWidth={300}
        sidebar={
          <SidebarRail
            brand={
              <div>
                <div className="text-[12.5px] font-medium text-[var(--lab-ink)]">Workspace</div>
                <div className="text-[11px] text-[var(--lab-ink-3)]">本机项目 · 待绑定</div>
              </div>
            }
            sections={[
              {
                title: "SESSIONS",
                body: <SidebarItem active>Current coding loop</SidebarItem>,
              },
              {
                title: "FILES",
                body: (
                  <div className="px-2 py-1.5 text-[12px] text-[var(--lab-ink-3)]">尚无打开文件</div>
                ),
              },
              {
                title: "COMMANDS",
                body:
                  commands.length === 0 ? (
                    <div className="px-2 py-1.5 text-[12px] text-[var(--lab-ink-3)]">指令通道空闲</div>
                  ) : (
                    commands.slice(0, 6).map((c) => (
                      <SidebarItem key={c.id}>
                        <span className="truncate">
                          [{c.type}] {c.payload.slice(0, 28)}
                        </span>
                      </SidebarItem>
                    ))
                  ),
              },
            ]}
          />
        }
        conversation={
          <>
            <ConversationShell scrollerRef={scroller}>
              {messages.map((msg) =>
                msg.role === "user" ? (
                  <UserBubble key={msg.id}>{msg.content}</UserBubble>
                ) : (
                  <AssistantBlock key={msg.id} name="Coding" role="agent">
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </AssistantBlock>
                ),
              )}

              {tools.length > 0 ? (
                <div className="space-y-1 border-y border-[var(--lab-border-soft)] py-2">
                  {tools.slice(0, 8).map((t) => (
                    <ToolRow key={t.id} title={t.title} summary={t.summary} state={t.state} />
                  ))}
                </div>
              ) : null}

              {status === "thinking" ? <ThinkingRow label="Coding thinking" /> : null}

              {streamingMsg ? (
                <AssistantBlock name="Coding" role="agent">
                  <StreamText
                    text={streamingMsg.content}
                    onDone={() => {
                      const finalized = streamingMsg;
                      pendingStream.current = false;
                      setMessages((prev) => [...prev, finalized]);
                      setStreamingMsg(null);
                      setStatus("idle");
                    }}
                  />
                </AssistantBlock>
              ) : null}
            </ConversationShell>

            <Composer
              value={draft}
              onChange={setDraft}
              onSend={send}
              placeholder="跟 Coding 说…（Enter 发送，Shift+Enter 换行）"
              disabled={busy}
              canSend={canSend}
              footerLeft={
                commands[0] ? (
                  <span className="truncate text-[11px] text-[var(--lab-ink-3)]">
                    最近指令 · [{commands[0].type}]
                  </span>
                ) : (
                  <span className="text-[11px] text-[var(--lab-ink-3)]">DeepSeek · coding loop</span>
                )
              }
            />
          </>
        }
        rightbar={
          <div className="flex h-full flex-col">
            <div className="border-b border-[var(--lab-border-soft)] px-3 py-2 text-[12px] font-medium text-[var(--lab-ink)]">
              Preview
            </div>
            <div className="flex flex-1 items-center justify-center px-4 text-center text-[12.5px] text-[var(--lab-ink-3)]">
              Diff / 文件预览将出现在这里（有产出时自动打开）
            </div>
          </div>
        }
      />
    </div>
  );
}
