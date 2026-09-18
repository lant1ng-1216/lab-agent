import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AgentState } from "../canvas/CanvasFlow";
import type { AgentToolTrace, ChatMessage } from "@shared/protocol";
import StreamingText from "../harness/beautiful-ui/StreamingText";
import LoadingState from "../harness/beautiful-ui/LoadingState";
import ToolChips from "../harness/beautiful-ui/ToolChips";
import ThinkingAdapter from "./ThinkingAdapter";
import ThinkingBand from "./ThinkingBand";
import MarkdownBody from "./MarkdownBody";
import type { FilePreviewPayload } from "./FileInspectSidebar";
import BloubAvatar, { type BloubMood, type BloubMotion } from "../mascot/bloub/BloubAvatar";
import { UserBubble } from "@harness";
import { toolsToChips, toolsToThinkingRows } from "../lib/agentTurn";
import { TurnTokenFooter } from "./TokenUsageMeter";
import AppearancePickCards from "./AppearancePickCards";
import type { AppearanceState } from "../lib/appearance";
import { avatarMotionForTurn, isAgentTurnWorking } from "@shared/agentPresentation";
import PermissionModal, { type PermissionAction } from "./PermissionModal";
import {
  CHAT_FOLLOW_RESUME_DELAY_MS,
  isIntentionalChatBrowse,
  isNearChatBottom,
} from "@shared/chatScroll";

export const NORMAL_SUGGESTIONS = [
  { title: "从设计稿搭 UI", desc: "把一帧设计落到这个仓库里的可运行界面。" },
  { title: "先出实现方案", desc: "写代码前先对齐步骤与边界。" },
  { title: "排查一个 Bug", desc: "定位根因并给出可验证的修复。" },
  { title: "解释这段代码", desc: "讲清楚模块职责、调用链和风险点。" },
];

const AVATAR = 38;
const AVATAR_COL = 42;

type Props = {
  state: AgentState;
  sessionName: string;
  sessionKey?: string | null;
  emptyHero?: boolean;
  /** Space reserved below the scroll content for the floating composer. */
  bottomInset?: number;
  workdir?: string | null;
  appearance?: AppearanceState;
  onAppearanceChange?: (next: AppearanceState) => void;
  onSuggestion?: (text: string) => void;
  onStreamingSettled?: () => void;
  /** Open file in the app-level inspect sidebar */
  onFilePreview?: (preview: FilePreviewPayload) => void;
  /** Insert selected assistant text into the composer as a quoted follow-up context. */
  onQuoteSelection?: (text: string) => void;
  /**
   * Inline edit & resend from a user bubble (after Stop).
   * Replaces that turn in UI and starts a fresh engine session.
   */
  onResendFromUser?: (userId: string, text: string) => void;
  /** Drop this user message and everything after, restoring its text to the composer. */
  onWithdrawUser?: (userId: string, text: string) => void;
  onPermissionAction?: (action: PermissionAction) => void;
};

function looksLikePlan(text: string): boolean {
  const t = text.trim();
  if (t.length < 80) return false;
  const bullets = (t.match(/^[\s]*[-*•]\s+/gm) || []).length;
  const numbered = (t.match(/^\s*\d+\.\s+/gm) || []).length;
  return bullets + numbered >= 3 || /我(将|会|计划)|步骤|方案|包括：/.test(t);
}

function resolvePath(workdir: string | null | undefined, file: string): string {
  if (!file) return file;
  if (/^([a-zA-Z]:[\\/]|\/|\\\\)/.test(file)) return file;
  if (!workdir) return file;
  return `${workdir.replace(/[/\\]$/, "")}/${file.replace(/^[/\\]/, "")}`;
}

type UserMessageSegment = { kind: "text" | "quote"; text: string };

function parseUserMessageSegments(text: string): UserMessageSegment[] {
  const lines = text.split(/\r?\n/);
  const segments: UserMessageSegment[] = [];
  let currentKind: UserMessageSegment["kind"] | null = null;
  let currentLines: string[] = [];
  let hasQuote = false;

  const flush = () => {
    if (!currentKind) return;
    segments.push({ kind: currentKind, text: currentLines.join("\n") });
    currentKind = null;
    currentLines = [];
  };

  for (const line of lines) {
    const quoteLine = /^\s*>\s?(.*)$/.exec(line);
    const kind = quoteLine ? "quote" : "text";
    if (kind === "quote") hasQuote = true;
    if (currentKind !== kind) {
      flush();
      currentKind = kind;
    }
    currentLines.push(quoteLine ? quoteLine[1] : line);
  }
  flush();

  if (!hasQuote) return [{ kind: "text", text }];

  return segments
    .map((segment) => {
      if (segment.kind === "quote") return segment;
      const proseLines = segment.text.split("\n");
      while (proseLines.length && !proseLines[0].trim()) proseLines.shift();
      while (proseLines.length && !proseLines[proseLines.length - 1].trim()) proseLines.pop();
      return { ...segment, text: proseLines.join("\n") };
    })
    .filter((segment) => segment.kind === "quote" || segment.text.length > 0);
}

function UserMessageContent({ text }: { text: string }) {
  const segments = parseUserMessageSegments(text);
  if (!segments.some((segment) => segment.kind === "quote")) {
    return <span className="whitespace-pre-wrap break-words">{text}</span>;
  }

  return (
    <div className="space-y-2.5">
      {segments.map((segment, index) =>
        segment.kind === "quote" ? (
          <blockquote
            key={`quote-${index}`}
            className="rounded-r-md border-l-2 border-[var(--lab-border)] bg-[var(--lab-hover)]/35 px-2.5 py-1.5"
          >
            <div className="mb-1 text-[9.5px] font-medium tracking-wide text-[var(--lab-ink-3)]">引用内容</div>
            <p className="whitespace-pre-wrap break-words text-[12.5px] leading-[1.55] text-[var(--lab-ink-2)]">
              {segment.text}
            </p>
          </blockquote>
        ) : (
          <p key={`text-${index}`} className="whitespace-pre-wrap break-words">
            {segment.text}
          </p>
        ),
      )}
    </div>
  );
}

function bloubMood(state: AgentState): BloubMood {
  if (state.status === "error") return "error";
  // The engine has finished even if the typewriter is still revealing its final text.
  if (state.streamComplete) return "idle";
  if (state.status === "waiting" || state.permission) return "waiting";
  if (state.status === "tool" || state.tools?.some((t) => t.state === "running")) return "tool";
  if (state.status === "thinking" || state.thinkingText) return "thinking";
  if (state.status === "streaming" && !state.streamComplete) return "thinking";
  return "idle";
}

function EditableUserBubble({
  msg,
  canRevise,
  needsConfirmation,
  onResend,
  onWithdraw,
}: {
  msg: ChatMessage;
  canRevise: boolean;
  needsConfirmation: boolean;
  onResend?: (userId: string, text: string) => void;
  onWithdraw?: (userId: string, text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.content);
  const [confirmResend, setConfirmResend] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(msg.content);
      setConfirmResend(false);
      setConfirmWithdraw(false);
      setConfirmDiscard(false);
    }
  }, [msg.content, editing]);

  const closeEditor = () => {
    if (draft !== msg.content) {
      setConfirmDiscard(true);
      setConfirmResend(false);
      setConfirmWithdraw(false);
      return;
    }
    setEditing(false);
  };

  const discardEdit = () => {
    setDraft(msg.content);
    setConfirmDiscard(false);
    setEditing(false);
  };

  useEffect(() => {
    if (!editing) return;
    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !editorRef.current?.contains(event.target)) {
        closeEditor();
      }
    };
    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, [editing, draft, msg.content]);

  const submitEdit = () => {
    const text = draft.trim();
    if (!text || !onResend) return;
    if (needsConfirmation && !confirmResend) {
      setConfirmResend(true);
      setConfirmWithdraw(false);
      setConfirmDiscard(false);
      return;
    }
    onResend(msg.id, text);
    setEditing(false);
  };

  const withdraw = () => {
    if (!onWithdraw) return;
    if (needsConfirmation && !confirmWithdraw) {
      setConfirmWithdraw(true);
      setConfirmResend(false);
      setConfirmDiscard(false);
      return;
    }
    onWithdraw(msg.id, msg.content);
    setEditing(false);
  };

  useEffect(() => {
    if (!editing) return;
    const el = areaRef.current;
    if (!el) return;
    el.focus();
    el.style.height = "0px";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 40), 160)}px`;
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, [editing]);

  if (editing) {
    return (
      <div ref={editorRef} className="flex justify-end pl-10">
        <div className="w-full max-w-[92%] rounded-2xl border border-[var(--lab-border)] bg-[var(--lab-surface-solid)] px-3 py-2 shadow-sm">
          <textarea
            ref={areaRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setConfirmResend(false);
              setConfirmWithdraw(false);
              setConfirmDiscard(false);
              const el = e.target;
              el.style.height = "0px";
              el.style.height = `${Math.min(Math.max(el.scrollHeight, 40), 160)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                closeEditor();
              }
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submitEdit();
              }
            }}
            className="w-full resize-none bg-transparent text-[13.5px] leading-[1.5] text-[var(--lab-ink)] outline-none"
            rows={2}
          />
          {confirmDiscard ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--lab-warn-soft)] px-2.5 py-2 text-[11.5px] leading-5 text-[var(--lab-warn)]">
              <span>放弃这次修改？未保存的文字将会丢失。</span>
              <span className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)]"
                  onClick={() => {
                    setConfirmDiscard(false);
                    areaRef.current?.focus();
                  }}
                >
                  继续编辑
                </button>
                <button
                  type="button"
                  className="rounded-md bg-[var(--lab-warn)] px-2 py-1 font-medium text-white"
                  onClick={discardEdit}
                >
                  放弃修改
                </button>
              </span>
            </div>
          ) : null}
          {(confirmResend || confirmWithdraw) ? (
            <p className="mt-2 rounded-lg bg-[var(--lab-warn-soft)] px-2.5 py-2 text-[11.5px] leading-5 text-[var(--lab-warn)]">
              {confirmWithdraw
                ? "撤回会移除此消息及后续对话，并把原文放回输入框。"
                : "修改会停止当前任务并从此消息重新执行，后续对话会被截断。"}
              {" 已完成的文件修改、命令或外部操作不会自动撤销。"}
            </p>
          ) : null}
          {!confirmDiscard ? (
            <div className="mt-2 flex items-center justify-end gap-1.5">
              <button
                type="button"
                className="rounded-md px-2 py-1 text-[11.5px] text-[var(--lab-ink-3)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
                onClick={closeEditor}
              >
                取消
              </button>
              {onWithdraw ? (
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-[11.5px] text-[var(--lab-ink-3)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-warn)]"
                  onClick={withdraw}
                >
                  {confirmWithdraw ? "确认撤回并带回输入框" : "撤回并带回输入框"}
                </button>
              ) : null}
              <button
                type="button"
                className="rounded-md bg-[var(--lab-ink)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--lab-main)] hover:opacity-90 disabled:opacity-40"
                disabled={!draft.trim()}
                onClick={submitEdit}
              >
                {confirmResend ? "确认并重跑" : needsConfirmation ? "修改并重跑" : "发送修改"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="group relative">
      <div
        role={canRevise ? "button" : undefined}
        tabIndex={canRevise ? 0 : undefined}
        aria-label={canRevise ? "点击编辑这条消息" : undefined}
        onClick={canRevise ? () => setEditing(true) : undefined}
        onKeyDown={canRevise ? (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setEditing(true);
          }
        } : undefined}
        className={canRevise ? "cursor-text rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--lab-border)]" : undefined}
      >
        <UserBubble editable={canRevise}>
          <UserMessageContent text={msg.content} />
        </UserBubble>
      </div>
      {confirmWithdraw ? (
        <div className="mt-2 rounded-xl border border-[var(--lab-warn-border)] bg-[var(--lab-warn-soft)] px-3 py-2.5 text-[11.5px] leading-5 text-[var(--lab-warn)]">
          <p>撤回会移除此消息及后续对话，并把原文放回输入框。已完成的文件修改、命令或外部操作不会自动撤销。</p>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmWithdraw(false)}
              className="rounded-md px-2 py-1 text-[11.5px] text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)]"
            >
              保留消息
            </button>
            <button
              type="button"
              onClick={withdraw}
              className="rounded-md bg-[var(--lab-warn)] px-2.5 py-1 text-[11.5px] font-medium text-white"
            >
              确认撤回并恢复草稿
            </button>
          </div>
        </div>
      ) : null}
      {canRevise ? (
        <div className="mt-0.5 flex justify-end gap-1">
          <button
            type="button"
            title="编辑消息"
            aria-label="编辑这条消息"
            className="inline-flex size-7 items-center justify-center rounded-md text-[var(--lab-ink-2)] transition-colors hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lab-ink-3)]"
            onClick={() => setEditing(true)}
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.9 2.6a1.5 1.5 0 0 1 2.1 2.1L6 11.7l-3 1 1-3 6.9-7.1Z" />
              <path d="M9.8 3.8 12.2 6.2" />
            </svg>
          </button>
          {onWithdraw ? (
            <button
              type="button"
              title="撤回并带回输入框"
              aria-label={confirmWithdraw ? "等待确认撤回" : "撤回并带回输入框"}
              className="inline-flex size-7 items-center justify-center rounded-md text-[var(--lab-ink-2)] transition-colors hover:bg-[var(--lab-warn-soft)] hover:text-[var(--lab-warn)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lab-ink-3)]"
              onClick={withdraw}
            >
              <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 4 2.5 7.5 6 11" />
                <path d="M2.5 7.5h7a4 4 0 0 1 4 4" />
              </svg>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function chipsFooter(tools: AgentToolTrace[], onFileOpen?: (file: string) => void) {
  const chips = toolsToChips(tools);
  return (
    <ToolChips
      revealAll
      hideMore
      steps={chips.steps}
      diffs={chips.diffs}
      diffLines={chips.diffLines}
      labels={{ header: chips.header, more: "" }}
      className="!min-h-0 !max-w-none"
      onFileOpen={onFileOpen}
    />
  );
}

function MessageTools({
  tools,
  working = false,
  onFileOpen,
}: {
  tools: AgentToolTrace[];
  working?: boolean;
  onFileOpen?: (file: string) => void;
}) {
  const thinkingRows = useMemo(() => toolsToThinkingRows(tools), [tools]);
  if (!tools.length) return null;
  return (
    <ThinkingAdapter
      variant="Coding"
      controlled
      working={working}
      label={working ? "Running tools" : "Tools"}
      doneLabel={`Ran ${tools.length} tool${tools.length === 1 ? "" : "s"}`}
      rows={thinkingRows}
      footer={chipsFooter(tools, onFileOpen)}
      onFileOpen={onFileOpen}
    />
  );
}

/** Chat-style row: avatar only when `showAvatar` (latest / live turn). */
function AssistantShell({
  children,
  mood = "idle",
  motion = "breathe",
  showAvatar = false,
  listenToken = 0,
}: {
  children: ReactNode;
  mood?: BloubMood;
  motion?: BloubMotion;
  /** Only the live turn or the latest assistant row should show Bloub. */
  showAvatar?: boolean;
  listenToken?: number;
}) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 pt-0.5" style={{ width: AVATAR_COL }}>
        {showAvatar ? (
          <BloubAvatar
            size={AVATAR}
            mood={mood}
            motion={motion}
            follow
            interactive
            listenToken={listenToken}
            className="block"
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px]">
          <span className="font-medium text-[var(--lab-ink)]">Lab Agent</span>
          <span className="text-[var(--lab-ink-3)]">coding</span>
        </div>
        <div className="flex flex-col gap-2 text-[14.5px] leading-[1.6] text-[var(--lab-ink)]">{children}</div>
      </div>
    </div>
  );
}

function AssistantMessageBody({
  msg,
  onFileOpen,
  onQuoteSelection,
  showAvatar = false,
}: {
  msg: ChatMessage;
  onFileOpen?: (file: string, tools?: AgentToolTrace[]) => void;
  onQuoteSelection?: (text: string) => void;
  showAvatar?: boolean;
}) {
  const thinking = msg.thinking?.trim();
  const open = (file: string) => onFileOpen?.(file, msg.tools);
  return (
    <AssistantShell mood={msg.error ? "error" : "idle"} showAvatar={showAvatar}>
      {thinking ? <ThinkingBand text={thinking} working={false} /> : null}
      {msg.tools?.length ? <MessageTools tools={msg.tools} working={false} onFileOpen={open} /> : null}
      <div className={msg.error ? "rounded-xl border border-[var(--lab-red)]/25 bg-[var(--lab-red)]/5 px-3 py-2.5 text-[var(--lab-red)]" : undefined}>
        {msg.interrupted ? (
          <div className="text-[11.5px] text-[var(--lab-ink-3)]">已中断 · 可编辑上一条后重发</div>
        ) : null}
        <SelectableAssistantContent onQuoteSelection={onQuoteSelection}>
          {looksLikePlan(msg.content) && !msg.interrupted ? (
            <details open className="group">
              <summary className="cursor-pointer list-none text-[11px] font-semibold tracking-[0.06em] text-[var(--lab-ink-3)]">
                计划 / 说明
                <span className="ml-2 font-normal text-[var(--lab-ink-3)] group-open:hidden">展开</span>
              </summary>
              <div className="mt-2">
                <MarkdownBody text={msg.content} />
              </div>
            </details>
          ) : (
            <MarkdownBody text={msg.content} />
          )}
        </SelectableAssistantContent>
      </div>
      <TurnTokenFooter usage={msg.usage} />
    </AssistantShell>
  );
}

function SelectableAssistantContent({
  children,
  onQuoteSelection,
}: {
  children: ReactNode;
  onQuoteSelection?: (text: string) => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [selectionAction, setSelectionAction] = useState<{ text: string; left: number; top: number } | null>(null);

  const updateSelectionAction = useCallback(() => {
    if (!onQuoteSelection || !contentRef.current) {
      setSelectionAction(null);
      return;
    }
    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    const focus = selection?.focusNode;
    const content = contentRef.current;
    if (!selection) {
      setSelectionAction(null);
      return;
    }
    // Preserve a captured excerpt if a streaming markdown update briefly invalidates
    // the live DOM Range. A deliberate pointer press clears it below.
    if (selection.isCollapsed) return;
    if (!anchor || !focus || !content.contains(anchor) || !content.contains(focus)) {
      setSelectionAction(null);
      return;
    }

    const text = selection.toString().trim();
    if (!text) {
      setSelectionAction(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const bounds = range.getBoundingClientRect();
    const firstRect = range.getClientRects()[0];
    const rect = bounds.width || bounds.height ? bounds : firstRect;
    if (!rect) return;

    const actionWidth = 136;
    const actionHeight = 34;
    const margin = 8;
    const left = Math.max(
      margin,
      Math.min(rect.left + rect.width / 2 - actionWidth / 2, window.innerWidth - actionWidth - margin),
    );
    const preferredTop = rect.top - actionHeight - 7;
    const top = Math.max(
      margin,
      Math.min(preferredTop >= margin ? preferredTop : rect.bottom + 7, window.innerHeight - actionHeight - margin),
    );
    setSelectionAction({ text, left, top });
  }, [onQuoteSelection]);

  useEffect(() => {
    const clearOnPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-quote-selection-action]")) return;
      setSelectionAction(null);
    };
    document.addEventListener("selectionchange", updateSelectionAction);
    document.addEventListener("pointerdown", clearOnPointerDown);
    window.addEventListener("scroll", updateSelectionAction, true);
    window.addEventListener("resize", updateSelectionAction);
    return () => {
      document.removeEventListener("selectionchange", updateSelectionAction);
      document.removeEventListener("pointerdown", clearOnPointerDown);
      window.removeEventListener("scroll", updateSelectionAction, true);
      window.removeEventListener("resize", updateSelectionAction);
    };
  }, [updateSelectionAction]);

  return (
    <>
      <div ref={contentRef} className="select-text" onMouseUp={updateSelectionAction} onKeyUp={updateSelectionAction}>
        {children}
      </div>
      {selectionAction && onQuoteSelection ? (
        <button
          type="button"
          data-quote-selection-action
          className="fixed z-[70] rounded-lg border border-[var(--lab-border)] bg-[var(--lab-surface-solid)] px-3 py-1.5 text-[12px] font-medium text-[var(--lab-ink)] shadow-[0_6px_20px_rgba(0,0,0,0.16)] transition-colors hover:bg-[var(--lab-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lab-accent)]"
          style={{ left: selectionAction.left, top: selectionAction.top }}
          title="把选中文字作为引用加入输入框"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onQuoteSelection(selectionAction.text);
            setSelectionAction(null);
            window.getSelection()?.removeAllRanges();
          }}
        >
          针对这段追问
        </button>
      ) : null}
    </>
  );
}

/**
 * Normal-mode conversation. File preview opens via `onFilePreview` (App chrome).
 */
export default function NormalChatView({
  state,
  sessionName,
  emptyHero = false,
  bottomInset = 144,
  workdir = null,
  appearance,
  onAppearanceChange,
  onSuggestion,
  onStreamingSettled,
  onFilePreview,
  onQuoteSelection,
  onResendFromUser,
  onWithdrawUser,
  onPermissionAction,
}: Props) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  const scrollFrame = useRef<number | null>(null);
  const followResumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualBrowse = useRef(false);
  const lastTouchY = useRef<number | null>(null);
  const shouldAutoScroll = useRef(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const tools = state.tools ?? [];
  const thinkingText = state.thinkingText?.trim() ?? "";
  const archivedOnStream = state.streaming?.thinking?.trim() ?? "";
  const liveThinking = thinkingText || archivedOnStream;
  const toolsWorking = tools.some((tool) => tool.state === "running");
  const [listenToken, setListenToken] = useState(0);
  const prevMsgLen = useRef(state.messages.length);

  const clearFollowResumeTimer = useCallback(() => {
    if (followResumeTimer.current !== null) {
      clearTimeout(followResumeTimer.current);
      followResumeTimer.current = null;
    }
  }, []);

  const scheduleAutoScroll = useCallback(() => {
    if (!shouldAutoScroll.current) return;
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null;
      const container = scrollContainerRef.current;
      if (container && shouldAutoScroll.current) {
        container.scrollTop = container.scrollHeight;
      }
    });
  }, []);

  const scrollToLatest = useCallback(() => {
    clearFollowResumeTimer();
    manualBrowse.current = false;
    shouldAutoScroll.current = true;
    setShowScrollToBottom(false);
    const container = scrollContainerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [clearFollowResumeTimer]);

  useEffect(() => {
    const len = state.messages.length;
    if (len > prevMsgLen.current) {
      const last = state.messages[len - 1];
      if (last?.role === "user") {
        clearFollowResumeTimer();
        manualBrowse.current = false;
        setListenToken((n) => n + 1);
        shouldAutoScroll.current = true;
        setShowScrollToBottom(false);
        scheduleAutoScroll();
      }
    }
    prevMsgLen.current = len;
  }, [state.messages, scheduleAutoScroll, clearFollowResumeTimer]);

  const turnWorking = isAgentTurnWorking({
    status: state.status,
    streamComplete: Boolean(state.streamComplete),
    hasStreamingMessage: Boolean(state.streaming),
    hasRunningTool: toolsWorking,
    hasPermission: Boolean(state.permission),
  });
  const busy = turnWorking;

  const scheduleFollowResume = useCallback(() => {
    clearFollowResumeTimer();
    if (!turnWorking || manualBrowse.current) return;

    followResumeTimer.current = setTimeout(() => {
      followResumeTimer.current = null;
      const container = scrollContainerRef.current;
      if (!container || manualBrowse.current) return;
      if (isIntentionalChatBrowse(container)) {
        manualBrowse.current = true;
        return;
      }
      // Re-arm only; the next streamed content/resize will perform the scroll.
      shouldAutoScroll.current = true;
    }, CHAT_FOLLOW_RESUME_DELAY_MS);
  }, [turnWorking, clearFollowResumeTimer]);

  const handleManualScrollInput = useCallback(
    (container: HTMLDivElement, deltaY: number) => {
      if (deltaY === 0) return;

      const metrics = {
        scrollHeight: container.scrollHeight,
        scrollTop: container.scrollTop,
        clientHeight: container.clientHeight,
      };
      if (isNearChatBottom(metrics) && deltaY > 0) {
        clearFollowResumeTimer();
        manualBrowse.current = false;
        shouldAutoScroll.current = true;
        setShowScrollToBottom(false);
        return;
      }

      shouldAutoScroll.current = false;
      setShowScrollToBottom(true);
      if (manualBrowse.current || isIntentionalChatBrowse(metrics, deltaY)) {
        clearFollowResumeTimer();
        manualBrowse.current = true;
        return;
      }

      scheduleFollowResume();
    },
    [clearFollowResumeTimer, scheduleFollowResume],
  );

  useEffect(() => {
    if (!turnWorking) clearFollowResumeTimer();
  }, [turnWorking, clearFollowResumeTimer]);
  const empty =
    state.messages.length === 0 && !busy && tools.length === 0 && !state.permission && !liveThinking;

  const showLoading =
    !state.streamComplete &&
    state.status === "thinking" &&
    !state.streaming?.content &&
    tools.length === 0 &&
    !state.permission &&
    !liveThinking;

  const showTools = tools.length > 0;
  const liveTurn = turnWorking || Boolean(state.streaming) || showTools || Boolean(liveThinking);
  const toolRows = useMemo(() => toolsToThinkingRows(tools), [tools]);
  const mood = bloubMood(state);
  const streamText = state.streaming?.content ?? "";

  const lastAssistantId = useMemo(() => {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      if (state.messages[i]?.role === "assistant") return state.messages[i]!.id;
    }
    return null;
  }, [state.messages]);

  const openFile = useCallback(
    async (file: string, fromTools?: AgentToolTrace[]) => {
      const path = resolvePath(workdir, file);
      const pool = fromTools?.length ? fromTools : tools.length ? tools : state.streaming?.tools;
      const hit = pool?.find(
        (t) => t.file === path || t.file === file || t.file?.endsWith(file) || path.endsWith(t.file || ""),
      );

      const lines =
        hit?.detailLines?.length && (hit.add !== undefined || hit.del !== undefined)
          ? hit.detailLines.map((l) => ({
              text: l.text,
              tone: (l.tone === "del" ? "del" : l.tone === "ctx" ? "ctx" : "add") as "add" | "del" | "ctx",
            }))
          : undefined;

      let content: string | undefined;
      let error: string | undefined;
      if (window.lab?.readFile) {
        const r = await window.lab.readFile(path);
        if (r.ok) content = r.content || "";
        else error = r.error || "读取失败";
      } else if (!lines) {
        error = "当前环境无法读取文件";
      }

      onFilePreview?.({
        path: hit?.file || path,
        content,
        error: content === undefined ? error : undefined,
        lines,
        preferredTab: lines?.length ? "diff" : "file",
      });
    },
    [workdir, tools, state.streaming?.tools, onFilePreview],
  );

  useEffect(() => {
    if (empty || !shouldAutoScroll.current) return;
    scheduleAutoScroll();
  }, [
    empty,
    bottomInset,
    state.messages.length,
    streamText,
    state.status,
    tools,
    liveThinking.length,
    state.permission?.requestId,
    scheduleAutoScroll,
  ]);

  useEffect(() => {
    const viewport = scrollContainerRef.current;
    const content = scrollContentRef.current;
    if (!viewport || !content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => scheduleAutoScroll());
    observer.observe(viewport);
    observer.observe(content);
    return () => observer.disconnect();
  }, [scheduleAutoScroll]);

  useEffect(() => {
    return () => {
      clearFollowResumeTimer();
      if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    };
  }, [clearFollowResumeTimer]);

  if (empty || emptyHero) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center px-4">
        <div className="mb-6 text-center">
          <div className="mb-3 flex justify-center">
            <BloubAvatar size={64} mood="idle" motion="full" interactive follow />
          </div>
          <div className="text-[26px] font-semibold tracking-[-0.03em] text-[var(--lab-ink)]">Lab Code</div>
          <div className="mt-2 text-[13px] text-[var(--lab-ink-3)]">
            {workdir ? (
              <>
                在{" "}
                <span className="font-[var(--lab-mono)] text-[var(--lab-ink-2)]">
                  {workdir.split(/[/\\]/).filter(Boolean).pop()}
                </span>{" "}
                里计划、构建、调试
              </>
            ) : (
              "Plan, build, debug — 选择工作区或直接提问"
            )}
          </div>
        </div>
        {appearance && onAppearanceChange ? (
          <AppearancePickCards appearance={appearance} onChange={onAppearanceChange} />
        ) : onSuggestion ? (
          <div className="mb-5 grid w-full max-w-[640px] grid-cols-1 gap-1 sm:grid-cols-2">
            {NORMAL_SUGGESTIONS.map((s) => (
              <button
                key={s.title}
                type="button"
                onClick={() => onSuggestion(s.title)}
                className="rounded-[12px] border border-[var(--lab-border-soft)] bg-[var(--lab-surface-solid)]/60 px-3 py-2.5 text-left transition-colors hover:bg-[var(--lab-hover)]"
              >
                <span className="block text-[12.5px] font-medium text-[var(--lab-ink)]">{s.title}</span>
                <span className="mt-0.5 block text-[11.5px] text-[var(--lab-ink-3)]">{s.desc}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0">
      <div
        ref={scrollContainerRef}
        className="h-full min-h-0 overflow-y-auto px-4 pt-4"
        style={{ paddingBottom: `${Math.max(16, bottomInset)}px` }}
        onWheel={(event) => {
          handleManualScrollInput(event.currentTarget, event.deltaY);
        }}
        onTouchStart={(event) => {
          lastTouchY.current = event.touches[0]?.clientY ?? null;
        }}
        onTouchMove={(event) => {
          const touchY = event.touches[0]?.clientY;
          const previousTouchY = lastTouchY.current;
          lastTouchY.current = touchY ?? null;
          if (touchY !== undefined && previousTouchY !== null) {
            handleManualScrollInput(event.currentTarget, previousTouchY - touchY);
          }
        }}
        onTouchEnd={() => {
          lastTouchY.current = null;
        }}
        onTouchCancel={() => {
          lastTouchY.current = null;
        }}
        onScroll={(event) => {
          const el = event.currentTarget;
          const atBottom = isNearChatBottom(el);
          if (atBottom) {
            clearFollowResumeTimer();
            manualBrowse.current = false;
            shouldAutoScroll.current = true;
          } else {
            if (shouldAutoScroll.current) {
              // Scrollbar/keyboard scrolling may not produce a wheel/touch event.
              clearFollowResumeTimer();
              manualBrowse.current = true;
            }
            shouldAutoScroll.current = false;
          }
          setShowScrollToBottom(!atBottom);
        }}
      >
        <div
          ref={scrollContentRef}
          className="mx-auto w-full max-w-[var(--lab-chat-max,920px)] space-y-4 pl-2 pr-3 sm:pl-3 sm:pr-4"
        >
          <div className="mb-1 px-1 text-[11px] text-[var(--lab-ink-3)]" style={{ paddingLeft: AVATAR_COL + 12 }}>
            {sessionName}
          </div>
          {state.messages.map((msg, i) =>
            msg.role === "user" ? (
              <div key={msg.id} style={{ paddingLeft: AVATAR_COL + 12 }}>
                <EditableUserBubble
                  msg={msg}
                  canRevise={Boolean(onResendFromUser || onWithdrawUser)}
                  needsConfirmation={turnWorking || i < state.messages.length - 1}
                  onResend={onResendFromUser}
                  onWithdraw={onWithdrawUser}
                />
              </div>
            ) : (
              <AssistantMessageBody
                key={msg.id}
                msg={msg}
                onFileOpen={openFile}
                onQuoteSelection={onQuoteSelection}
                showAvatar={!liveTurn && msg.id === lastAssistantId}
              />
            ),
          )}

          {liveTurn ? (
            <div style={{ animation: "fade-up 280ms cubic-bezier(0.23,1,0.32,1) both" }}>
              <AssistantShell
                mood={mood}
                motion={avatarMotionForTurn(turnWorking)}
                showAvatar
                listenToken={listenToken}
              >
                {showLoading ? (
                  <LoadingState variant="Drive" label={state.statusLabel || "Lab Agent 思考中"} />
                ) : null}

                {liveThinking ? (
                  <ThinkingBand text={liveThinking} working={turnWorking && !state.streamComplete} />
                ) : null}

                {/* Tools: fully expanded while running; collapse when tools settle */}
                {showTools ? (
                  <ThinkingAdapter
                    variant="Coding"
                    controlled
                    working={turnWorking}
                    label={
                      state.status === "waiting"
                        ? "等待批准…"
                        : toolsWorking || state.status === "tool"
                          ? "Running tools"
                          : "Tools"
                    }
                    doneLabel={`Ran ${tools.length} tool${tools.length === 1 ? "" : "s"}`}
                    rows={toolRows}
                    footer={chipsFooter(tools, openFile)}
                    onFileOpen={openFile}
                  />
                ) : null}

                {state.permission ? (
                  <PermissionModal
                    permission={state.permission}
                    onAction={(action) => onPermissionAction?.(action)}
                  />
                ) : null}

                {/* Text streams as soon as deltas arrive — not blocked on tools finishing */}
                {state.streaming && streamText ? (
                  <SelectableAssistantContent onQuoteSelection={onQuoteSelection}>
                    <StreamingText
                      mode="live"
                      liveText={streamText}
                      complete={Boolean(state.streamComplete)}
                      fill
                      sources={[]}
                      followUps={[]}
                      onDone={onStreamingSettled}
                    />
                  </SelectableAssistantContent>
                ) : null}
                {state.streamComplete ? (
                  <TurnTokenFooter usage={state.streaming?.usage} />
                ) : null}
              </AssistantShell>
            </div>
          ) : null}

        </div>
      </div>
      {showScrollToBottom ? (
        <button
          type="button"
          onClick={scrollToLatest}
          className="absolute left-1/2 z-10 -translate-x-1/2 rounded-full border border-[var(--lab-border)] bg-[var(--lab-surface-solid)] px-3 py-1.5 text-[11px] text-[var(--lab-ink-2)] shadow-md transition-colors hover:text-[var(--lab-ink)]"
          style={{ bottom: `${Math.max(8, bottomInset - 8)}px` }}
          aria-label="滚动到最新消息"
        >
          ↓ 回到底部
        </button>
      ) : null}
    </div>
  );
}
