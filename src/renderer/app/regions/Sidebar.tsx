import type { ReactNode } from "react";
import type { AgentState, LoopStatus } from "@shared/protocol";
import type { Experiment, ShellMode } from "../../lib/sessionStores";
import { SIDEBAR_RAIL } from "../shell";
import SidebarSessionList from "../../components/SidebarSessionList";
import ShellModeToggle from "../../components/ShellModeToggle";
import LineFaceAvatar from "../../components/LineFaceAvatar";
import type { LocalProfile } from "../shell";

type LabNodeKind = "lab" | "coding";

/**
 * Left sidebar column: brand row, session list, supervisor-only agent rows and
 * the bottom user/settings/theme block. Moved verbatim out of App.tsx; the
 * resize handle stays in App because it owns the drag state.
 */
export default function Sidebar({
  skinOn,
  collapsed,
  width,
  labAppIcon,
  shellMode,
  onSupervisorToggle,
  experiments,
  activeExp,
  activeWorkspace,
  isNormal,
  renaming,
  recents,
  onNew,
  onNewInWorkspace,
  onPickWorkspace,
  onRemoveWorkspace,
  onRenameStart,
  onRenameCommit,
  onRenameCancel,
  onSwitch,
  onDeleteAsk,
  onTogglePin,
  onToggleArchive,
  onSelectWorkspace,
  onOpenSkills,
  onOpenSkillsMarket,
  onOpenAgents,
  showAgentRows,
  lab,
  coding,
  nodes,
  inspector,
  onPickAgent,
  profile,
  onOpenProfile,
  onOpenSettings,
  theme,
  onToggleTheme,
  resizeHandle,
}: {
  skinOn: boolean;
  collapsed: boolean;
  width: number;
  labAppIcon: string;
  shellMode: ShellMode;
  onSupervisorToggle: () => void;
  experiments: Experiment[];
  activeExp: string | null;
  activeWorkspace: string | null;
  isNormal: boolean;
  renaming: string | null;
  recents: string[];
  onNew: () => void;
  onNewInWorkspace: (dir: string) => void;
  onPickWorkspace: () => void;
  onRemoveWorkspace: (dir: string) => void;
  onRenameStart: (id: string) => void;
  onRenameCommit: (id: string, name: string) => void;
  onRenameCancel: () => void;
  onSwitch: (id: string) => void;
  onDeleteAsk: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleArchive: (id: string) => void;
  onSelectWorkspace: (dir: string) => void;
  onOpenSkills: () => void;
  onOpenSkillsMarket: () => void;
  onOpenAgents: () => void;
  showAgentRows: boolean;
  lab: AgentState;
  coding: AgentState;
  nodes: LabNodeKind[];
  inspector: LabNodeKind | null;
  onPickAgent: (kind: LabNodeKind) => void;
  profile: LocalProfile;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  theme: string;
  onToggleTheme: () => void;
  resizeHandle: ReactNode;
}) {
  return (
    <aside
      className={`titlebar-drag relative z-[1] flex shrink-0 flex-col border-r border-[var(--lab-border-soft)] bg-[var(--lab-sidebar)] ${
        skinOn ? "lab-skin-glass" : ""
      }`}
      style={{ width: collapsed ? SIDEBAR_RAIL : width, transition: collapsed ? "width 0.18s ease" : undefined }}
    >
      {!collapsed ? (
        <div className="shrink-0 border-b border-[var(--lab-border-soft)]">
          <div className="flex h-[52px] items-center gap-2 px-3">
            <img
              src={labAppIcon}
              alt="Lab Agent"
              width={27}
              height={27}
              draggable={false}
              className="size-[27px] shrink-0 rounded-[7px] object-contain"
            />
            <ShellModeToggle mode={shellMode} onToggle={onSupervisorToggle} />
          </div>
        </div>
      ) : null}

      <div className="titlebar-no-drag min-h-0 flex-1 overflow-y-auto px-2 py-2.5">
        {/* session / experiment list */}
        <SidebarSessionList
          experiments={experiments}
          activeExp={activeExp}
          activeWorkspace={activeWorkspace}
          isNormal={isNormal}
          collapsed={collapsed}
          renaming={renaming}
          recents={recents}
          onNew={onNew}
          onNewInWorkspace={onNewInWorkspace}
          onPickWorkspace={onPickWorkspace}
          onRemoveWorkspace={onRemoveWorkspace}
          onRenameStart={onRenameStart}
          onRenameCommit={onRenameCommit}
          onRenameCancel={onRenameCancel}
          onSwitch={onSwitch}
          onDeleteAsk={onDeleteAsk}
          onTogglePin={onTogglePin}
          onToggleArchive={onToggleArchive}
          onSelectWorkspace={onSelectWorkspace}
          onOpenSkills={onOpenSkills}
          onOpenSkillsMarket={onOpenSkillsMarket}
          onOpenAgents={onOpenAgents}
        />

        {/* supervisor-only: current experiment agent rows */}
        {showAgentRows ? (
          <div className="mb-3">
            {!collapsed ? (
              <div className="mb-1 px-1.5 text-[10px] font-semibold tracking-[0.08em] text-[var(--lab-ink-3)]">当前实验</div>
            ) : null}
            {(
              [
                { kind: "lab" as const, label: `Lab · ${lab.status}`, state: lab },
                { kind: "coding" as const, label: `Coding · ${coding.status}`, state: coding },
              ]
            ).map((row) => (
              <button
                key={row.kind}
                type="button"
                onClick={() => onPickAgent(row.kind)}
                className={`mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] ${
                  inspector === row.kind
                    ? "bg-[var(--lab-hover)] text-[var(--lab-ink)]"
                    : "text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
                }`}
                title={collapsed ? row.label : undefined}
              >
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: row.kind === "lab" ? "var(--lab-accent)" : "var(--lab-green)" }} />
                {collapsed ? row.label.slice(0, 1) : row.label}
                {!collapsed && nodes.includes(row.kind) ? <span className="ml-auto text-[9px] text-[var(--lab-ink-3)]">画布</span> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* 底部：用户占位（左）+ 设置（右）+ 主题切换 */}
      <div className="titlebar-no-drag shrink-0 border-t border-[var(--lab-border-soft)] p-2">
        <div className={`mb-2 flex items-center ${collapsed ? "flex-col gap-1.5" : "gap-1.5"}`}>
          <button
            type="button"
            onClick={onOpenProfile}
            className={`flex min-w-0 items-center gap-2 rounded-[10px] text-left hover:bg-[var(--lab-hover)] ${
              collapsed ? "size-8 justify-center p-0" : "flex-1 px-1.5 py-1"
            }`}
            title="个性化（登录即将接入）"
          >
            <LineFaceAvatar seed={profile.avatarSeed} size={collapsed ? 28 : 28} />
            {!collapsed ? (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium text-[var(--lab-ink)]">
                  {profile.displayName.trim() || "未登录"}
                </span>
                <span className="block truncate text-[10px] text-[var(--lab-ink-3)]">点击个性化</span>
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className="flex size-8 shrink-0 items-center justify-center rounded-[10px] text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
            onClick={onOpenSettings}
            title="设置 (⌘,)"
            aria-label="设置"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={theme === "light"}
          aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
          title={theme === "dark" ? "切到纯白" : "切到纯黑"}
          onClick={onToggleTheme}
          className={`relative flex h-8 items-center rounded-full p-0.5 transition-colors ${
            collapsed ? "mx-auto w-8 justify-center overflow-hidden" : "w-full"
          }`}
          style={{ background: "var(--lab-hover)" }}
        >
          {!collapsed ? (
            <>
              <span className="relative z-[1] flex h-7 w-1/2 items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={theme === "light" ? "text-[var(--lab-ink)]" : "text-[var(--lab-ink-3)]"}>
                  <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                </svg>
              </span>
              <span className="relative z-[1] flex h-7 w-1/2 items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={theme === "dark" ? "text-[var(--lab-ink)]" : "text-[var(--lab-ink-3)]"}>
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              </span>
              <span
                className="pointer-events-none absolute top-0.5 z-0 h-7 rounded-full bg-[var(--lab-surface-solid)] shadow-[0_1px_3px_rgba(0,0,0,0.18)] transition-[left] duration-200 ease-out"
                style={{
                  width: "calc(50% - 2px)",
                  left: theme === "light" ? 2 : "calc(50% + 0px)",
                }}
                aria-hidden
              />
            </>
          ) : (
            <span className="flex size-7 items-center justify-center rounded-full bg-[var(--lab-surface-solid)] text-[var(--lab-ink)] shadow-[0_1px_3px_rgba(0,0,0,0.18)]">
              {theme === "dark" ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              )}
            </span>
          )}
        </button>
      </div>

      {resizeHandle}
    </aside>
  );
}
