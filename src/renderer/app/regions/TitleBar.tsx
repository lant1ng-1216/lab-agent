import type { ChatMessage } from "@shared/protocol";
import { SectionTokenMeter } from "../components/TokenUsageMeter";
import { NewChatGlyph, SidebarToggleGlyph } from "./glyphs";

/**
 * Window chrome row: sidebar/new-chat buttons, breadcrumb and token meter.
 * Moved verbatim out of App.tsx — same markup, same props, no behaviour change.
 */
export default function TitleBar({
  skinOn,
  isMacPlatform,
  isNormal,
  sessionName,
  activeWorkspace,
  sidebarCollapsed,
  onToggleSidebar,
  onNewChat,
  tokenTotals,
  compactHint,
}: {
  skinOn: boolean;
  isMacPlatform: boolean;
  isNormal: boolean;
  sessionName: string | null;
  activeWorkspace: string | null;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onNewChat: () => void;
  tokenTotals?: ChatMessage["usage"];
  compactHint: string | null;
}) {
  return (
    <div
      className={`titlebar-drag relative z-[4] flex h-11 shrink-0 items-center border-b border-[var(--lab-border-soft)] ${
        skinOn ? "lab-skin-glass" : ""
      }`}
      style={{
        background: skinOn
          ? "color-mix(in srgb, var(--lab-surface-solid) 72%, transparent)"
          : "var(--lab-main)",
      }}
    >
      <div className={`flex min-w-0 flex-1 items-center gap-1.5 pr-3 ${isMacPlatform ? "pl-[78px]" : "pl-2"}`}>
        <button
          type="button"
          className="titlebar-no-drag flex size-8 shrink-0 items-center justify-center rounded-[9px] text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
          aria-label={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
        >
          <SidebarToggleGlyph collapsed={sidebarCollapsed} />
        </button>
        <button
          type="button"
          className="titlebar-no-drag flex size-8 shrink-0 items-center justify-center rounded-[9px] text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
          onClick={onNewChat}
          title="新对话"
          aria-label="新对话"
        >
          <NewChatGlyph />
        </button>
        <span className="mx-1 h-5 w-px shrink-0 bg-[var(--lab-border)]" aria-hidden />
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px]">
          <span className="shrink-0 text-[var(--lab-ink-3)]">{isNormal ? "对话" : "实验"}</span>
          <span className="shrink-0 text-[var(--lab-ink-3)]">/</span>
          <span className="truncate font-medium text-[var(--lab-ink)]">
            {sessionName ?? (isNormal ? "新对话" : "新实验")}
          </span>
          {activeWorkspace ? (
            <span
              className="ml-1 truncate font-[var(--lab-mono)] text-[11px] text-[var(--lab-ink-3)]"
              title={activeWorkspace}
            >
              {activeWorkspace.split(/[/\\]/).filter(Boolean).pop()}
            </span>
          ) : null}
          {isNormal ? (
            <SectionTokenMeter totals={tokenTotals} compactHint={compactHint} variant="titlebar" />
          ) : null}
        </div>
      </div>
    </div>
  );
}
