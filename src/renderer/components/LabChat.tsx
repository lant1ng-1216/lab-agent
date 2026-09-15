"use client";

/**
 * LabChat — visual structure from beautiful-ui/chat.tsx
 * Wired to Lab Agent IPC (messages + send).
 */
import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@shared/protocol";

function Section({
  label,
  sub,
  body,
}: {
  label: string;
  sub: string;
  body: string;
}) {
  return (
    <div
      className="flex w-full flex-col gap-1.5"
      style={{
        animation: "fade-up 400ms cubic-bezier(0.23,1,0.32,1) both",
      }}
    >
      <div className="flex items-center gap-1 text-[12px] leading-[1.3]">
        <span className="font-medium text-ink">{label}</span>
        <span className="text-ink-2">{sub}</span>
      </div>
      <p className="whitespace-pre-wrap text-[13px] leading-normal text-ink">{body}</p>
    </div>
  );
}

export default function LabChat({
  tabs,
  activeTab,
  onTabChange,
  messages,
  status,
  placeholder,
  onSend,
}: {
  tabs: string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  messages: ChatMessage[];
  status: string;
  placeholder: string;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const canSend = draft.trim().length > 0 && status !== "thinking";

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  const send = () => {
    if (!canSend) return;
    const text = draft.trim();
    setDraft("");
    onSend(text);
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[14px] bg-surface shadow-card">
      <div className="flex shrink-0 items-center justify-between border-b border-line p-1.5">
        <div className="flex items-center">
          {tabs.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={activeTab === item}
              onClick={() => onTabChange(item)}
              className={`rounded-[6px] px-2 py-[3px] text-[13px] text-ink transition-[background-color,opacity] duration-100 ${activeTab === item ? "bg-field" : "opacity-50 hover:opacity-75"}`}
            >
              {item}
            </button>
          ))}
        </div>
        <span className="rounded-full border border-line px-2 py-[2px] text-[10px] text-ink-2">
          {status}
        </span>
      </div>

      <div
        ref={scroller}
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 pt-2.5 pb-1"
      >
        {messages.map((msg) =>
          msg.role === "user" ? (
            <div key={msg.id} className="flex justify-end pl-10">
              <div className="rounded-xl bg-field px-3 py-1.5 text-[13px] leading-[1.4] text-ink">
                {msg.content}
              </div>
            </div>
          ) : (
            <Section
              key={msg.id}
              label={msg.role === "assistant" ? "Lab" : "System"}
              sub="Agent"
              body={msg.content}
            />
          ),
        )}
        {status === "thinking" ? (
          <div className="text-[12px] text-ink-3" style={{ animation: "fade-in 300ms ease-out both" }}>
            Thinking…
          </div>
        ) : null}
      </div>

      <div className="mt-auto shrink-0 p-1.5">
        <div
          role="presentation"
          onClick={() => inputRef.current?.focus()}
          className="flex cursor-text flex-col gap-2 rounded-control border border-line bg-field p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.035)] transition-[border-color,box-shadow] duration-150 focus-within:border-line-strong"
        >
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") send();
            }}
            placeholder={placeholder}
            aria-label="Chat prompt"
            className="min-h-4.5 bg-transparent text-[13px] leading-[1.4] text-ink outline-none placeholder:text-ink-3"
          />
          <div className="flex items-center justify-end">
            <button
              type="button"
              aria-label="Send"
              disabled={!canSend}
              onClick={send}
              className="flex size-7 items-center justify-center rounded-[8px] transition-[background-color,color,transform] duration-200 enabled:active:scale-[0.96]"
              style={{
                background: canSend ? "var(--ink)" : "var(--line-strong)",
                color: canSend ? "var(--surface)" : "var(--ink-2)",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
