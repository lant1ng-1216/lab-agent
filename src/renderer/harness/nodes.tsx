import { useEffect, useMemo, useState, type ReactNode } from "react";

const WORD_MS = 18;

export function StreamText({ text, onDone }: { text: string; onDone?: () => void }) {
  const tokens = useMemo(() => text.split(/(\s+)/).filter((t) => t.length > 0), [text]);
  const [count, setCount] = useState(0);
  const done = count >= tokens.length;

  useEffect(() => setCount(0), [text]);
  useEffect(() => {
    if (done) {
      onDone?.();
      return;
    }
    const t = setTimeout(() => setCount((c) => c + 1), WORD_MS);
    return () => clearTimeout(t);
  }, [count, done, onDone, tokens.length]);

  return (
    <p className="whitespace-pre-wrap text-[13.5px] leading-[1.55] text-[var(--lab-ink)]">
      {tokens.slice(0, count).map((token, i) => (
        <span
          key={`${i}-${token}`}
          className="inline"
          style={{ animation: "lab-stream-in 360ms var(--lab-ease) both" }}
        >
          {token}
        </span>
      ))}
      {!done ? (
        <span className="ml-0.5 inline-block h-[13px] w-[2px] translate-y-[2px] rounded-full bg-[var(--lab-ink)]" />
      ) : null}
    </p>
  );
}

export function UserBubble({ children, editable = false }: { children: ReactNode; editable?: boolean }) {
  return (
    <div className="flex justify-end pl-10">
      <div
        className={`max-w-[92%] lab-msg-bubble rounded-2xl px-3 py-2 text-[13.5px] leading-[1.5] text-[var(--lab-ink)] ${
          editable
            ? "border border-[var(--lab-border)] bg-[var(--lab-surface)] shadow-sm transition-[background-color,border-color,box-shadow] duration-150 group-hover:border-[var(--lab-ink-3)] group-hover:shadow-md group-focus-within:border-[var(--lab-ink-3)] group-focus-within:shadow-md"
            : "bg-[var(--lab-inset)]"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export function AssistantBlock({
  name,
  role,
  children,
}: {
  name: string;
  role?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-[11.5px]">
        <span className="font-medium text-[var(--lab-ink)]">{name}</span>
        {role ? <span className="text-[var(--lab-ink-3)]">{role}</span> : null}
      </div>
      <div className="text-[13.5px] leading-[1.55] text-[var(--lab-ink)]">{children}</div>
    </div>
  );
}

export function ThinkingRow({ label = "Thinking" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5 text-[12.5px] text-[var(--lab-ink-3)]">
      <span
        className="inline-block size-1.5 rounded-full bg-[var(--lab-accent)]"
        style={{ animation: "lab-pulse 1.4s ease-in-out infinite" }}
      />
      <span>{label}…</span>
    </div>
  );
}

/**
 * Tool summary row — morphology of dsh ToolRow: single-line title · summary,
 * running sweep glare.
 */
export function ToolRow({
  title,
  summary,
  state = "done",
}: {
  title: string;
  summary?: string;
  state?: "running" | "done" | "error";
}) {
  return (
    <div
      className="relative overflow-hidden rounded-md py-0.5"
      data-state={state}
    >
      {state === "running" ? (
        <span
          className="pointer-events-none absolute inset-y-0 w-[280px]"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--lab-bg) 55%, transparent) 55%, transparent 100%)",
            animation: "lab-tool-sweep 2.6s ease-out infinite",
          }}
        />
      ) : null}
      <div className="relative flex min-h-6 items-center gap-1.5 text-[12.5px]">
        <span
          className={`font-medium ${
            state === "error"
              ? "text-[var(--lab-red)]"
              : state === "running"
                ? "text-[var(--lab-accent)]"
                : "text-[var(--lab-ink-2)]"
          }`}
        >
          {title}
        </span>
        <span className="size-[2px] shrink-0 rounded-full bg-[var(--lab-ink-3)]" />
        <span className="min-w-0 flex-1 truncate text-[var(--lab-ink-3)]">
          {summary ?? (state === "running" ? "running…" : "done")}
        </span>
      </div>
    </div>
  );
}

/**
 * Approval panel — morphology of dsh ApprovalPanel (warn strip + card).
 */
export function ApprovalPanel({
  headline,
  detail,
  onApprove,
  onReject,
  onDismiss,
}: {
  headline: string;
  detail?: string;
  onApprove?: () => void;
  onReject?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div className="w-full overflow-hidden rounded-[16px] border border-[var(--lab-warn-border)] bg-[var(--lab-surface)] shadow-[0_8px_24px_#0006]">
      <div className="flex items-center gap-2 bg-[var(--lab-warn-soft)] px-3.5 py-2.5 text-[12.5px] text-[var(--lab-warn)]">
        <span className="size-2 rounded-full bg-[var(--lab-warn)]" />
        需要你确认
        {onDismiss ? (
          <button
            type="button"
            className="ml-auto text-[11px] text-[var(--lab-ink-3)] hover:text-[var(--lab-ink)]"
            onClick={onDismiss}
          >
            收起
          </button>
        ) : null}
      </div>
      <div className="space-y-1.5 px-3.5 pt-3">
        <div className="text-[14px] font-medium leading-6 text-[var(--lab-ink)]">{headline}</div>
        {detail ? (
          <pre className="whitespace-pre-wrap font-[var(--lab-mono)] text-[12px] leading-5 text-[var(--lab-ink-3)]">
            {detail}
          </pre>
        ) : null}
      </div>
      <div className="flex justify-end gap-2 px-3.5 py-3.5">
        <button
          type="button"
          onClick={onReject}
          className="rounded-lg border border-[var(--lab-border)] px-3 py-1.5 text-[12.5px] text-[var(--lab-ink-2)] hover:border-transparent hover:bg-[#ee5c6122] hover:text-[var(--lab-red)]"
        >
          打回
        </button>
        <button
          type="button"
          onClick={onApprove}
          className="rounded-lg bg-[var(--lab-ink)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--lab-bg)]"
        >
          确认派发
        </button>
      </div>
    </div>
  );
}

export function ConversationShell({
  children,
  scrollerRef,
}: {
  children: ReactNode;
  scrollerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[var(--lab-chat-max)] flex-col gap-4 px-4 py-4">
        {children}
      </div>
    </div>
  );
}

export function Composer({
  value,
  onChange,
  onSend,
  placeholder,
  disabled,
  canSend,
  footerLeft,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  placeholder: string;
  disabled?: boolean;
  canSend: boolean;
  footerLeft?: ReactNode;
}) {
  return (
    <div className="shrink-0 border-t border-[var(--lab-border-soft)] bg-[var(--lab-bg)] px-3 pb-3 pt-2">
      <div className="mx-auto w-full max-w-[var(--lab-chat-max)]">
        <div className="rounded-2xl border border-[var(--lab-border)] bg-[var(--lab-composer-bg)] p-2.5 shadow-[0_1px_0_#ffffff06_inset] focus-within:border-[var(--lab-border)]">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            rows={2}
            placeholder={placeholder}
            disabled={disabled}
            className="max-h-28 w-full resize-none bg-transparent text-[13.5px] leading-[1.45] text-[var(--lab-ink)] outline-none placeholder:text-[var(--lab-ink-3)] disabled:opacity-50"
          />
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">{footerLeft}</div>
            <button
              type="button"
              disabled={!canSend}
              onClick={onSend}
              className="flex size-8 shrink-0 items-center justify-center rounded-xl enabled:active:scale-[0.96] disabled:opacity-40"
              style={{
                background: canSend ? "var(--lab-ink)" : "var(--lab-hover)",
                color: canSend ? "var(--lab-bg)" : "var(--lab-ink-3)",
              }}
              aria-label="Send"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TitleBar({
  title,
  status,
  trailing,
}: {
  title: string;
  status?: string;
  trailing?: ReactNode;
}) {
  return (
    <header className="titlebar-drag flex h-11 shrink-0 items-center justify-between border-b border-[var(--lab-border-soft)] bg-[var(--lab-bg-raised)] pl-[78px] pr-3">
      <div className="text-[12.5px] font-semibold tracking-[-0.01em] text-[var(--lab-ink)]">{title}</div>
      <div className="titlebar-no-drag flex items-center gap-2">
        {trailing}
        {status ? (
          <span className="rounded-full border border-[var(--lab-border)] px-2 py-0.5 text-[10px] text-[var(--lab-ink-3)]">
            {status}
          </span>
        ) : null}
      </div>
    </header>
  );
}
