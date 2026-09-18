import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CaretDown,
  CaretRight,
  DotsThree,
  FolderSimple,
  FolderSimplePlus,
  FunnelSimple,
  MagnifyingGlass,
  Plus,
} from "@phosphor-icons/react";
import type { LoopStatus } from "@shared/protocol";
import type { Experiment } from "../lib/sessionStores";
import { workdirLabel } from "../lib/workdirRecents";

type Props = {
  experiments: Experiment[];
  activeExp: string | null;
  activeWorkspace: string | null;
  isNormal: boolean;
  collapsed: boolean;
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
};

function activeStatus(e: Experiment, isNormal: boolean): LoopStatus {
  if (isNormal) return e.coding.status;
  const a = e.lab.status;
  const b = e.coding.status;
  const rank = (s: LoopStatus) =>
    s === "error" ? 5 : s === "waiting" ? 4 : s === "tool" ? 3 : s === "streaming" || s === "thinking" ? 2 : 1;
  return rank(a) >= rank(b) ? a : b;
}

function statusDotClass(status: LoopStatus, selected: boolean): string {
  if (status === "error") return "bg-[var(--lab-red)]";
  if (status === "waiting") return "bg-amber-500";
  if (status === "thinking" || status === "streaming" || status === "tool") {
    return "bg-[var(--lab-accent)] animate-pulse";
  }
  return selected ? "bg-[var(--lab-accent)]" : "bg-[var(--lab-ink-3)]/45";
}

function relativeTime(ts: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return `${Math.max(1, sec)}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d`;
  return `${Math.floor(day / 30)}mo`;
}

/** Sidebar chrome — Phosphor regular for weight at 14–16px */
const I = { weight: "regular" as const, "aria-hidden": true };

type FolderEntry = {
  key: string;
  path: string | null;
  label: string;
  items: Experiment[];
  fromRecentOnly: boolean;
};

export default function SidebarSessionList({
  experiments,
  activeExp,
  activeWorkspace,
  isNormal,
  collapsed,
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
}: Props) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [folderMenu, setFolderMenu] = useState<string | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const searchRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!searchOpen) return;
    const t = window.setTimeout(() => searchRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [searchOpen]);

  useEffect(() => {
    if (!menuId && !folderMenu && !contextMenu) return;
    const close = () => {
      setMenuId(null);
      setContextMenu(null);
      setFolderMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuId, folderMenu, contextMenu]);

  useLayoutEffect(() => {
    if (!contextMenu) return;

    const reposition = () => {
      const menu = contextMenuRef.current;
      if (!menu) return;
      const { width, height } = menu.getBoundingClientRect();
      const margin = 8;
      const maxLeft = Math.max(margin, window.innerWidth - width - margin);
      const maxTop = Math.max(margin, window.innerHeight - height - margin);
      setContextMenuPosition({
        left: Math.max(margin, Math.min(contextMenu.x, maxLeft)),
        top: Math.max(margin, Math.min(contextMenu.y, maxTop)),
      });
    };

    reposition();
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [contextMenu]);

  useEffect(() => {
    if (!searchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  const q = query.trim().toLowerCase();

  const { pinned, folders, archived, searchHits } = useMemo(() => {
    const live = experiments.filter((e) => !e.archived);
    const arch = experiments.filter((e) => e.archived);
    const pin = live.filter((e) => e.pinned).sort((a, b) => b.ts - a.ts);

    const byPath = new Map<string, Experiment[]>();
    for (const e of live.filter((x) => !x.pinned)) {
      const k = e.workdir?.trim() || "";
      const list = byPath.get(k) ?? [];
      list.push(e);
      byPath.set(k, list);
    }
    for (const list of byPath.values()) list.sort((a, b) => b.ts - a.ts);

    const pathSet = new Set<string>();
    for (const k of byPath.keys()) if (k) pathSet.add(k);
    for (const r of recents) pathSet.add(r);

    const folderList: FolderEntry[] = [...pathSet]
      .sort((a, b) => workdirLabel(a).localeCompare(workdirLabel(b), "zh"))
      .map((path) => ({
        key: path,
        path,
        label: workdirLabel(path),
        items: byPath.get(path) ?? [],
        fromRecentOnly: !(byPath.get(path)?.length),
      }));

    // unbound sessions
    const unbound = byPath.get("") ?? [];
    if (unbound.length) {
      folderList.push({
        key: "",
        path: null,
        label: "未绑定目录",
        items: unbound,
        fromRecentOnly: false,
      });
    }

    const match = (e: Experiment) => {
      if (!q) return true;
      const folder = workdirLabel(e.workdir).toLowerCase();
      return e.name.toLowerCase().includes(q) || folder.includes(q) || (e.workdir ?? "").toLowerCase().includes(q);
    };

    const hits = {
      sessions: experiments.filter(match).slice(0, 40),
      workspaces: recents
        .filter((d) => workdirLabel(d).toLowerCase().includes(q) || d.toLowerCase().includes(q))
        .slice(0, 12),
    };

    return {
      pinned: pin,
      folders: folderList,
      archived: arch.sort((a, b) => b.ts - a.ts),
      searchHits: hits,
    };
  }, [experiments, recents, q]);

  const toggleFolder = (key: string) => {
    setCollapsedFolders((m) => ({ ...m, [key]: !m[key] }));
  };

  const openContextMenu = (id: string, x: number, y: number) => {
    setMenuId(null);
    setFolderMenu(null);
    setContextMenuPosition({ left: x, top: y });
    setContextMenu({ id, x, y });
  };

  const renderSession = (e: Experiment, nested: boolean) => {
    const selected = activeExp === e.id;
    const status = activeStatus(e, isNormal);
    const menuRows = [
      { label: "重命名", fn: () => onRenameStart(e.id) },
      { label: e.pinned ? "取消置顶" : "置顶", fn: () => onTogglePin(e.id) },
      { label: e.archived ? "取消归档" : "归档", fn: () => onToggleArchive(e.id) },
      { label: "删除", fn: () => onDeleteAsk(e.id), danger: true },
    ];
    const menuItems = menuRows.map((row) => (
      <button
        key={row.label}
        type="button"
        role="menuitem"
        className={`block w-full px-3 py-1.5 text-left text-[12px] hover:bg-[var(--lab-hover)] ${
          row.danger ? "text-[var(--lab-red)]" : "text-[var(--lab-ink)]"
        }`}
        onClick={(event) => {
          event.stopPropagation();
          setMenuId(null);
          setContextMenu(null);
          row.fn();
        }}
      >
        {row.label}
      </button>
    ));
    return (
      <div key={e.id} className={`group relative flex items-center ${nested ? "pl-5" : ""}`}>
        {renaming === e.id ? (
          <input
            autoFocus
            defaultValue={e.name}
            onBlur={(ev) => onRenameCommit(e.id, ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") onRenameCommit(e.id, (ev.target as HTMLInputElement).value);
              if (ev.key === "Escape") onRenameCancel();
            }}
            className="min-w-0 flex-1 rounded-md border border-[var(--lab-accent)] bg-[var(--lab-inset)] px-2 py-1.5 text-[12.5px] text-[var(--lab-ink)] outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => onSwitch(e.id)}
            onDoubleClick={() => onRenameStart(e.id)}
            onContextMenu={(event) => {
              event.preventDefault();
              openContextMenu(e.id, event.clientX, event.clientY);
            }}
            onKeyDown={(event) => {
              if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
              event.preventDefault();
              const rect = event.currentTarget.getBoundingClientRect();
              openContextMenu(e.id, rect.left + 12, rect.bottom);
            }}
            className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] ${
              selected
                ? "bg-[var(--lab-hover)] text-[var(--lab-ink)]"
                : "text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)]/70 hover:text-[var(--lab-ink)]"
            }`}
            title={`${e.name}（双击重命名；右键更多操作）`}
          >
            <span className={`size-1.5 shrink-0 rounded-full ${statusDotClass(status, selected)}`} />
            <span className="min-w-0 flex-1 truncate">{collapsed ? e.name.slice(-1) : e.name}</span>
            {!collapsed ? (
              <span className="shrink-0 tabular-nums text-[10px] text-[var(--lab-ink-3)]">{relativeTime(e.ts)}</span>
            ) : null}
          </button>
        )}
        {!collapsed && renaming !== e.id ? (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={(ev) => {
                ev.stopPropagation();
                setFolderMenu(null);
                setContextMenu(null);
                setMenuId((id) => (id === e.id ? null : e.id));
              }}
              className="flex size-6 items-center justify-center rounded-md text-[11px] tracking-widest text-[var(--lab-ink-3)] opacity-0 hover:bg-[var(--lab-inset)] hover:text-[var(--lab-ink)] group-hover:opacity-100"
              title="更多"
            >
              <DotsThree size={16} {...I} />
            </button>
            {menuId === e.id ? (
              <div
                className="absolute right-0 top-7 z-40 min-w-[128px] overflow-hidden rounded-lg border border-[var(--lab-border-soft)] bg-[var(--lab-surface-solid)] py-1 shadow-[0_10px_28px_rgba(0,0,0,0.14)]"
                onClick={(ev) => ev.stopPropagation()}
              >
                {menuItems}
              </div>
            ) : null}
          </div>
        ) : null}
        {contextMenu?.id === e.id
          ? createPortal(
              <div
                ref={contextMenuRef}
                role="menu"
                className="fixed z-[1000] min-w-[160px] overflow-hidden rounded-lg border border-[var(--lab-border-soft)] bg-[var(--lab-surface-solid)] py-1 shadow-[0_10px_28px_rgba(0,0,0,0.2)]"
                style={{
                  left: contextMenuPosition?.left ?? contextMenu.x,
                  top: contextMenuPosition?.top ?? contextMenu.y,
                }}
                onClick={(event) => event.stopPropagation()}
                onContextMenu={(event) => event.preventDefault()}
              >
                {menuItems}
              </div>,
              document.body,
            )
          : null}
      </div>
    );
  };

  if (collapsed) {
    return (
      <div className="mb-3 flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={onNew}
          className="flex size-8 items-center justify-center rounded-lg text-[var(--lab-ink)] hover:bg-[var(--lab-hover)]"
          title={isNormal ? "新对话" : "新实验"}
        >
          <Plus size={16} {...I} />
        </button>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex size-8 items-center justify-center rounded-lg text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
          title="搜索"
        >
          <MagnifyingGlass size={16} {...I} />
        </button>
        {experiments.filter((e) => !e.archived).slice(0, 14).map((e) => renderSession(e, false))}
      </div>
    );
  }

  return (
    <div className="mb-3">
      {/* Top actions — no duplicate 工作区 */}
      <div className="mb-3 space-y-0.5">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[12.5px] text-[var(--lab-ink)] hover:bg-[var(--lab-hover)]"
        >
          <span className="flex size-4 items-center justify-center text-[var(--lab-ink-2)]">
            <Plus size={15} {...I} />
          </span>
          {isNormal ? "新对话" : "新实验"}
        </button>
        <button
          type="button"
          onClick={() => {
            setQuery("");
            setSearchOpen(true);
          }}
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[12.5px] text-[var(--lab-ink)] hover:bg-[var(--lab-hover)]"
        >
          <span className="flex size-4 items-center justify-center text-[var(--lab-ink-2)]">
            <MagnifyingGlass size={15} {...I} />
          </span>
          搜索
        </button>
      </div>

      {/* Single Repositories-style block */}
      <div className="mb-1 flex items-center justify-between gap-1 px-2">
        <span className="text-[11px] font-medium text-[var(--lab-ink-2)]">工作区</span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className="rounded p-1 text-[var(--lab-ink-3)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
            title="筛选（即将）"
            disabled
          >
            <FunnelSimple size={14} {...I} />
          </button>
          <button
            type="button"
            onClick={onPickWorkspace}
            className="rounded p-1 text-[var(--lab-ink-3)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
            title="添加工作区"
          >
            <FolderSimplePlus size={14} {...I} />
          </button>
        </div>
      </div>

      {pinned.length > 0 ? (
        <div className="mb-2">
          <div className="mb-0.5 px-2 text-[10px] text-[var(--lab-ink-3)]">置顶</div>
          {pinned.map((e) => renderSession(e, false))}
        </div>
      ) : null}

      {folders.length === 0 && experiments.length === 0 ? (
        <div className="mx-1 rounded-lg border border-dashed border-[var(--lab-border)] px-2 py-3 text-[11px] text-[var(--lab-ink-3)]">
          点右上角 + 添加工作区，或开始{isNormal ? "新对话" : "新实验"}
        </div>
      ) : null}

      {folders.map((g) => {
        const id = g.key || "__none";
        const closed = Boolean(collapsedFolders[id]);
        const focused =
          Boolean(g.path) &&
          Boolean(activeWorkspace) &&
          g.path!.replace(/[/\\]+$/, "") === activeWorkspace!.replace(/[/\\]+$/, "");
        return (
          <div key={id} className="mb-0.5">
            <div className="group relative flex items-center">
              <button
                type="button"
                onClick={() => {
                  if (g.path) onSelectWorkspace(g.path);
                  else toggleFolder(id);
                }}
                className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[12px] hover:bg-[var(--lab-hover)]/70 hover:text-[var(--lab-ink)] ${
                  focused
                    ? "bg-[var(--lab-hover)] text-[var(--lab-ink)]"
                    : "text-[var(--lab-ink-2)]"
                }`}
                title={g.path ?? undefined}
              >
                <span
                  className="flex w-3 shrink-0 items-center justify-center text-[var(--lab-ink-3)]"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    toggleFolder(id);
                  }}
                  role="presentation"
                >
                  {closed ? <CaretRight size={12} {...I} /> : <CaretDown size={12} {...I} />}
                </span>
                <span className="text-[var(--lab-ink-3)]">
                  <FolderSimple size={15} weight="duotone" aria-hidden />
                </span>
                <span className="min-w-0 flex-1 truncate">{g.label}</span>
                {g.items.length > 0 ? (
                  <span className="text-[10px] tabular-nums text-[var(--lab-ink-3)] opacity-100 group-hover:opacity-0">
                    {g.items.length}
                  </span>
                ) : null}
              </button>
              {g.path ? (
                <div className="relative flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setMenuId(null);
                      setFolderMenu(null);
                      onNewInWorkspace(g.path!);
                    }}
                    className="flex size-6 items-center justify-center rounded-md text-[var(--lab-ink-3)] opacity-0 hover:bg-[var(--lab-inset)] hover:text-[var(--lab-ink)] group-hover:opacity-100"
                    title={isNormal ? "在此工作区新建对话" : "在此工作区新建实验"}
                  >
                    <Plus size={14} {...I} />
                  </button>
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setMenuId(null);
                      setFolderMenu((x) => (x === g.path ? null : g.path));
                    }}
                    className="flex size-6 items-center justify-center rounded-md text-[var(--lab-ink-3)] opacity-0 hover:bg-[var(--lab-inset)] hover:text-[var(--lab-ink)] group-hover:opacity-100"
                    title="工作区选项"
                  >
                    <DotsThree size={16} {...I} />
                  </button>
                  {folderMenu === g.path ? (
                    <div
                      className="absolute right-0 top-7 z-40 min-w-[148px] overflow-hidden rounded-lg border border-[var(--lab-border-soft)] bg-[var(--lab-surface-solid)] py-1 shadow-[0_10px_28px_rgba(0,0,0,0.14)]"
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="block w-full px-3 py-1.5 text-left text-[12px] text-[var(--lab-ink)] hover:bg-[var(--lab-hover)]"
                        onClick={() => {
                          onSelectWorkspace(g.path!);
                          setFolderMenu(null);
                        }}
                      >
                        设为当前工作区
                      </button>
                      <button
                        type="button"
                        className="block w-full px-3 py-1.5 text-left text-[12px] text-[var(--lab-red)] hover:bg-[var(--lab-hover)]"
                        onClick={() => {
                          onRemoveWorkspace(g.path!);
                          setFolderMenu(null);
                        }}
                      >
                        移除工作区及会话
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            {!closed ? g.items.map((e) => renderSession(e, true)) : null}
          </div>
        );
      })}

      {archived.length > 0 ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="mb-0.5 flex w-full items-center gap-1 px-2 text-left text-[10px] font-medium text-[var(--lab-ink-3)] hover:text-[var(--lab-ink-2)]"
          >
            <span>已归档 · {archived.length}</span>
            {showArchived ? <CaretDown size={11} {...I} /> : <CaretRight size={11} {...I} />}
          </button>
          {showArchived ? archived.map((e) => renderSession(e, false)) : null}
        </div>
      ) : null}

      {/* Search modal */}
      {searchOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-start justify-center bg-black/25 px-4 pt-[12vh] backdrop-blur-[1px]"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-[var(--lab-border-soft)] bg-[var(--lab-surface-solid)] shadow-[0_24px_64px_rgba(0,0,0,0.22)]"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-[var(--lab-border-soft)] px-3 py-2.5">
              <span className="text-[var(--lab-ink-3)]">
                <MagnifyingGlass size={16} {...I} />
              </span>
              <input
                ref={searchRef}
                value={query}
                onChange={(ev) => setQuery(ev.target.value)}
                placeholder="搜索会话或工作区…"
                className="min-w-0 flex-1 bg-transparent text-[14px] text-[var(--lab-ink)] outline-none placeholder:text-[var(--lab-ink-3)]"
              />
              <kbd className="rounded border border-[var(--lab-border-soft)] px-1.5 py-0.5 text-[10px] text-[var(--lab-ink-3)]">
                esc
              </kbd>
            </div>
            <div className="max-h-[min(52vh,420px)] overflow-y-auto py-1.5">
              {!q ? (
                <div className="px-4 py-6 text-center text-[12px] text-[var(--lab-ink-3)]">输入关键字筛选会话 / 工作区</div>
              ) : (
                <>
                  {searchHits.workspaces.length > 0 ? (
                    <div className="mb-1">
                      <div className="px-3 py-1 text-[10px] font-medium text-[var(--lab-ink-3)]">工作区</div>
                      {searchHits.workspaces.map((dir) => (
                        <button
                          key={dir}
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[var(--lab-ink)] hover:bg-[var(--lab-hover)]"
                          onClick={() => {
                            onSelectWorkspace(dir);
                            setSearchOpen(false);
                          }}
                        >
                          <FolderSimple size={14} weight="duotone" aria-hidden />
                          <span className="min-w-0 flex-1 truncate">{workdirLabel(dir)}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {searchHits.sessions.length > 0 ? (
                    <div>
                      <div className="px-3 py-1 text-[10px] font-medium text-[var(--lab-ink-3)]">会话</div>
                      {searchHits.sessions.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[var(--lab-ink)] hover:bg-[var(--lab-hover)]"
                          onClick={() => {
                            onSwitch(e.id);
                            setSearchOpen(false);
                          }}
                        >
                          <span className="min-w-0 flex-1 truncate">{e.name}</span>
                          <span className="shrink-0 text-[10px] text-[var(--lab-ink-3)]">{relativeTime(e.ts)}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {searchHits.workspaces.length === 0 && searchHits.sessions.length === 0 ? (
                    <div className="px-4 py-6 text-center text-[12px] text-[var(--lab-ink-3)]">无匹配结果</div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
