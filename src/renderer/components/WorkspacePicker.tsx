import { useEffect, useMemo, useRef, useState } from "react";
import { loadWorkdirRecents, removeWorkdirRecent, workdirLabel } from "../lib/workdirRecents";

export interface WorkspacePickerProps {
  workdir: string | null;
  /** browser-only preview (no Electron bridge) */
  preview?: boolean;
  onPickMac: () => void;
  onSelectRecent: (dir: string) => void;
  /** Remove path from Recents only — does not clear active workspace / sessions */
  onRemoveRecent: (dir: string) => void;
  onRemote: () => void;
  onStartScratch: () => void;
  onUseExisting: () => void;
  onNewFolder: () => void;
}

function IconFolder() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconLaptop() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="4" width="20" height="14" rx="2" />
      <path d="M2 18h20M6 22h12" />
    </svg>
  );
}

function IconCloud() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconFolderPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <path d="M12 11v6M9 14h6" />
    </svg>
  );
}

function IconChevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

/**
 * Cursor-style workspace picker anchored above the PromptBar.
 */
export default function WorkspacePicker({
  workdir,
  preview = false,
  onPickMac,
  onSelectRecent,
  onRemoveRecent,
  onRemote,
  onStartScratch,
  onUseExisting,
  onNewFolder,
}: WorkspacePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState<string[]>(() => loadWorkdirRecents());
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setRecents(loadWorkdirRecents());
    setQuery("");
    const t = window.setTimeout(() => searchRef.current?.focus(), 30);
    const onDoc = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("pointerdown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const list =
      workdir && !recents.includes(workdir) ? [workdir, ...recents] : recents;
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((d) => d.toLowerCase().includes(q) || workdirLabel(d).toLowerCase().includes(q));
  }, [recents, query, workdir]);

  const closeThen = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={rootRef} className="relative mb-2 flex justify-start">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
        aria-expanded={open}
        title={workdir ?? "选择工作目录"}
      >
        <span className="text-[var(--lab-ink-2)]"><IconFolder /></span>
        <span className="truncate text-[12.5px] font-medium text-[var(--lab-ink)]">{workdirLabel(workdir)}</span>
        {preview ? (
          <span className="shrink-0 rounded-md bg-[var(--lab-hover)] px-1.5 py-0.5 text-[9px] font-medium tracking-wide text-[var(--lab-ink-3)]">
            仅预览
          </span>
        ) : null}
        <span className="shrink-0 text-[var(--lab-ink-3)]">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>

      {open ? (
        <div
          className="absolute bottom-full left-0 z-30 mb-2 w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-[12px] border border-[var(--lab-border)] bg-[var(--lab-surface-solid)] shadow-[0_16px_48px_rgba(0,0,0,0.28)]"
          style={{ animation: "pop-in 160ms cubic-bezier(0.23,1,0.32,1) both", transformOrigin: "bottom left" }}
        >
          <div className="border-b border-[var(--lab-border-soft)] p-2">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search repos, cloud environments…"
              className="w-full rounded-lg border border-[var(--lab-border)] bg-[var(--lab-inset)] px-2.5 py-1.5 text-[12px] text-[var(--lab-ink)] outline-none placeholder:text-[var(--lab-ink-3)] focus:border-[var(--lab-ink-3)]"
            />
          </div>

          <div className="max-h-[280px] overflow-y-auto p-1.5">
            <div className="px-2 pb-1 pt-1 text-[10px] font-semibold tracking-[0.08em] text-[var(--lab-ink-3)]">Recents</div>
            {filtered.length === 0 ? (
              <div className="px-2 py-2 text-[11.5px] text-[var(--lab-ink-3)]">暂无最近目录</div>
            ) : (
              filtered.map((dir) => {
                const active = workdir === dir;
                return (
                  <div
                    key={dir}
                    className="group flex w-full items-center gap-1 rounded-lg hover:bg-[var(--lab-hover)]"
                  >
                    <button
                      type="button"
                      onClick={() => closeThen(() => onSelectRecent(dir))}
                      className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
                      title={dir}
                    >
                      <span className="text-[var(--lab-ink-2)]"><IconFolder /></span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--lab-ink)]">{workdirLabel(dir)}</span>
                      {active ? <span className="text-[12px] text-[var(--lab-accent)]">✓</span> : null}
                    </button>
                    <button
                      type="button"
                      aria-label={`从 Recents 移除 ${workdirLabel(dir)}`}
                      title="从 Recents 移除"
                      className="mr-1.5 flex size-6 shrink-0 items-center justify-center rounded-md text-[var(--lab-ink-3)] opacity-60 hover:bg-[var(--lab-inset)] hover:text-[var(--lab-ink)] group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRecents(removeWorkdirRecent(dir));
                        onRemoveRecent(dir);
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                );
              })
            )}

            <div className="my-1.5 border-t border-[var(--lab-border-soft)]" />
            <div className="px-2 pb-1 pt-0.5 text-[10px] font-semibold tracking-[0.08em] text-[var(--lab-ink-3)]">Repos</div>
            <button type="button" onClick={() => closeThen(onPickMac)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--lab-hover)]">
              <span className="text-[var(--lab-ink-2)]"><IconLaptop /></span>
              <span className="flex-1 text-[12.5px] text-[var(--lab-ink)]">On This Mac</span>
              <span className="text-[var(--lab-ink-3)]"><IconChevron /></span>
            </button>
            <button type="button" onClick={() => closeThen(onRemote)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--lab-hover)]">
              <span className="text-[var(--lab-ink-2)]"><IconCloud /></span>
              <span className="flex-1 text-[12.5px] text-[var(--lab-ink)]">Remote</span>
              <span className="text-[var(--lab-ink-3)]"><IconChevron /></span>
            </button>
            <button type="button" onClick={() => closeThen(onStartScratch)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--lab-hover)]">
              <span className="text-[var(--lab-ink-2)]"><IconPlus /></span>
              <span className="flex-1 text-[12.5px] text-[var(--lab-ink)]">Start from scratch</span>
            </button>

            <div className="my-1.5 border-t border-[var(--lab-border-soft)]" />
            <button type="button" onClick={() => closeThen(onUseExisting)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--lab-hover)]">
              <span className="text-[var(--lab-ink-2)]"><IconFolder /></span>
              <span className="flex-1 text-[12.5px] text-[var(--lab-ink)]">Use Existing…</span>
              <span className="text-[var(--lab-ink-3)]"><IconChevron /></span>
            </button>
            <button type="button" onClick={() => closeThen(onNewFolder)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--lab-hover)]">
              <span className="text-[var(--lab-ink-2)]"><IconFolderPlus /></span>
              <span className="flex-1 text-[12.5px] text-[var(--lab-ink)]">New Folder</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
