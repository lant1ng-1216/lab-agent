import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentToolTrace } from "@shared/protocol";
import { loadFileRecents, pushFileRecent } from "../lib/fileRecents";
import {
  FILE_SIDEBAR_DEFAULT_WIDTH,
  FILE_SIDEBAR_RAIL,
  type FilePreviewPayload,
} from "./FileInspectSidebar";

type BrowseTab = "tree" | "turn" | "recent";

type Props = {
  workdir: string | null;
  sessionKey: string | null;
  /** Live + streaming tool traces for「本次」 */
  tools: AgentToolTrace[];
  preview: FilePreviewPayload | null;
  open: boolean;
  width: number;
  onWidthChange: (w: number) => void;
  onCollapse: () => void;
  onExpand: () => void;
  onPreview: (preview: FilePreviewPayload) => void;
};

const WIDTH_MIN = 360;
const WIDTH_MAX = 720;

type Entry = { name: string; type: string; size: number };

function fileName(path: string) {
  return path.split(/[/\\]/).filter(Boolean).pop() || path;
}

function joinPath(root: string, rel: string) {
  return `${root.replace(/[/\\]$/, "")}/${rel.replace(/^[/\\]/, "")}`;
}

function relToWorkdir(workdir: string | null, abs: string) {
  if (!workdir) return abs;
  const w = workdir.replace(/[/\\]$/, "");
  if (abs.startsWith(w + "/") || abs.startsWith(w + "\\")) return abs.slice(w.length + 1);
  return abs;
}

/**
 * The engine reports absolute Windows paths with `\`, while the tree builds
 * child paths with `/`. Normalise both sides so activity/touched lookups match.
 * No-op on macOS/Linux.
 */
function normPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "");
}

/** Live per-file activity derived from the current turn's tool traces. */
type FileActivity = {
  status: "created" | "modified" | "read";
  add: number;
  del: number;
  state: AgentToolTrace["state"];
};

const ACTIVITY_RANK = { read: 1, modified: 2, created: 3 } as const;

/**
 * Classify a file tool by what it does to the file it reports: `write`
 * creates, `edit` modifies, `null` means read-only (or not a file tool).
 */
function toolWriteKind(name: string | undefined): "write" | "edit" | null {
  const n = (name || "").toLowerCase();
  if (n.includes("write") || n.includes("createfile")) return "write";
  if (n.includes("edit") || n.includes("replace")) return "edit";
  return null;
}

function collectFileActivity(tools: AgentToolTrace[]): Map<string, FileActivity> {
  const map = new Map<string, FileActivity>();
  for (const t of tools) {
    if (!t.file) continue;
    const name = (t.name || "").toLowerCase();
    const write = toolWriteKind(t.name);
    const isRead = name.includes("read") || name.includes("view") || name.includes("glob") || name.includes("grep");
    if (!write && !isRead) continue;
    const next: FileActivity["status"] = write === "write" ? "created" : write === "edit" ? "modified" : "read";
    const key = normPath(t.file);
    const prev = map.get(key);
    map.set(key, {
      // Keep the strongest thing the agent did to this file this turn.
      status: prev && ACTIVITY_RANK[prev.status] > ACTIVITY_RANK[next] ? prev.status : next,
      add: (prev?.add ?? 0) + (t.add ?? 0),
      del: (prev?.del ?? 0) + (t.del ?? 0),
      state: t.state,
    });
  }
  return map;
}

function activityLabel(act: FileActivity): string {  if (act.status === "read") return "读";
  if (act.status === "created") return "新";
  const parts: string[] = [];
  if (act.add) parts.push(`+${act.add}`);
  if (act.del) parts.push(`−${act.del}`);
  return parts.join(" ") || "改";
}

function activityTone(act: FileActivity): string {
  if (act.state === "error") return "border-[var(--lab-red)]/40 text-[var(--lab-red)]";
  if (act.state === "running") return "border-[var(--lab-accent)]/40 text-[var(--lab-accent)] motion-safe:animate-pulse";
  if (act.status === "read") return "border-[var(--lab-border)] text-[var(--lab-ink-3)]";
  return "border-[var(--lab-green,#3ecf8e)]/40 text-[var(--lab-green,#3ecf8e)]";
}

/** Directories from `root` down to (and including) the parent of `abs`. */
function ancestorDirs(root: string, abs: string): string[] {
  const r = normPath(root);
  const a = normPath(abs);
  if (a !== r && !a.startsWith(r + "/")) return [];
  const parts = a.slice(r.length).split("/").filter(Boolean);
  parts.pop();
  const out = [root];
  let cur = root;
  for (const p of parts) {
    cur = joinPath(cur, p);
    out.push(cur);
  }
  return out;
}

const FOLLOW_KEY = "lab.fileFollow";

/**
 * Collapse a burst of agent writes into a single preview open — long enough to
 * skip over the intermediate files of a multi-file edit, short enough to feel
 * live.
 */
const FOLLOW_PREVIEW_DELAY_MS = 180;

function loadFollow(): boolean {
  try {
    return localStorage.getItem(FOLLOW_KEY) !== "0";
  } catch {
    return true;
  }
}

function CodeLines({ content }: { content: string }) {
  const lines = useMemo(() => {
    const raw = content.length > 120_000 ? `${content.slice(0, 120_000)}\n…` : content;
    return (raw || "(空文件)").split(/\r?\n/);
  }, [content]);
  const gutter = String(lines.length).length;

  return (
    <div className="font-[var(--lab-mono)] text-[12.5px] leading-[1.65]">
      {lines.map((line, i) => (
        <div
          key={i}
          className={`flex min-w-0 ${i % 2 === 0 ? "bg-transparent" : "bg-[color-mix(in_srgb,var(--lab-ink)_2.5%,transparent)]"} hover:bg-[var(--lab-hover)]`}
        >
          <span
            className="sticky left-0 shrink-0 select-none border-r border-[var(--lab-border-soft)] bg-[var(--lab-inset)] px-2.5 text-right text-[11px] tabular-nums text-[var(--lab-ink-3)]"
            style={{ minWidth: `${gutter + 1.8}ch` }}
          >
            {i + 1}
          </span>
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words px-3 text-[var(--lab-ink)]">
            {line || " "}
          </span>
        </div>
      ))}
    </div>
  );
}

function DiffLines({ lines }: { lines: NonNullable<FilePreviewPayload["lines"]> }) {
  const add = lines.filter((l) => l.tone === "add").length;
  const del = lines.filter((l) => l.tone === "del").length;
  const gutter = String(lines.length).length;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 px-3 font-[var(--lab-mono)] text-[11.5px]">
        <span className="text-[var(--lab-green,#3ecf8e)]">+{add}</span>
        <span className="text-[var(--lab-red,#ee5c61)]">−{del}</span>
        <span className="text-[var(--lab-ink-3)]">· {lines.length} 行片段</span>
      </div>
      <div className="font-[var(--lab-mono)] text-[12.5px] leading-[1.65]">
        {lines.map((l, i) => {
          const fg =
            l.tone === "add"
              ? "text-[var(--lab-green,#3ecf8e)]"
              : l.tone === "del"
                ? "text-[var(--lab-red,#ee5c61)]"
                : "text-[var(--lab-ink-3)]";
          const rowStyle =
            l.tone === "add"
              ? { background: "color-mix(in srgb, #3ecf8e 12%, transparent)" }
              : l.tone === "del"
                ? { background: "color-mix(in srgb, #ee5c61 12%, transparent)" }
                : undefined;
          return (
            <div key={i} className="flex min-w-0" style={rowStyle}>
              <span
                className="sticky left-0 shrink-0 select-none border-r border-[var(--lab-border-soft)] bg-[var(--lab-inset)] px-2.5 text-right text-[11px] tabular-nums text-[var(--lab-ink-3)]"
                style={{ minWidth: `${gutter + 1.5}ch` }}
              >
                {i + 1}
              </span>
              <span className={`w-4 shrink-0 select-none text-center opacity-70 ${fg}`}>
                {l.tone === "add" ? "+" : l.tone === "del" ? "−" : " "}
              </span>
              <span className={`min-w-0 flex-1 whitespace-pre-wrap break-words pr-2 ${fg}`}>
                {l.text || " "}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WorkspaceTree({
  root,
  selected,
  activity,
  follow,
  onOpen,
}: {
  root: string;
  selected: string | null;
  activity: Map<string, FileActivity>;
  follow: boolean;
  onOpen: (absPath: string) => void;
}) {
  const [children, setChildren] = useState<Record<string, Entry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([root]));
  const [loading, setLoading] = useState(true);
  const treeRef = useRef<HTMLDivElement | null>(null);

  const loadDir = useCallback(async (dir: string) => {
    const list = (await window.lab?.listFiles(dir)) ?? [];
    setChildren((prev) => ({ ...prev, [dir]: list }));
  }, []);

  useEffect(() => {
    setChildren({});
    setExpanded(new Set([root]));
    setLoading(true);
    void loadDir(root).finally(() => setLoading(false));
  }, [root, loadDir]);

  const toggle = async (dir: string) => {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(dir)) n.delete(dir);
      else n.add(dir);
      return n;
    });
    if (!children[dir]) await loadDir(dir);
  };

  // Follow the agent: when a touched file's parent dirs are not loaded yet,
  // fetch them (once) so we can reveal + highlight the file in the tree.
  const revealKey = useMemo(() => [...activity.keys()].sort().join("|"), [activity]);
  useEffect(() => {
    if (!follow || !revealKey) return;
    const touched = revealKey.split("|").filter(Boolean);
    let cancelled = false;
    void (async () => {
      const need = new Set<string>();
      for (const file of touched) {
        for (const dir of ancestorDirs(root, file)) {
          if (dir !== root && children[dir] === undefined) need.add(dir);
        }
      }
      if (!need.size) return;
      const dirs = [...need];
      const lists = await Promise.all(
        dirs.map(async (dir) => [dir, (await window.lab?.listFiles(dir)) ?? []] as const),
      );
      if (cancelled) return;
      setChildren((prev) => {
        const next = { ...prev };
        for (const [dir, list] of lists) if (next[dir] === undefined) next[dir] = list;
        return next;
      });
      setExpanded((s) => new Set([...s, ...dirs]));
    })();
    return () => {
      cancelled = true;
    };
  }, [follow, revealKey, root, children]);

  // Scroll the most recently touched file into view.
  const firstTouched = useMemo(() => {
    for (const t of [...activity.entries()].reverse()) return t[0];
    return null;
  }, [activity]);
  useEffect(() => {
    if (!follow || !firstTouched) return;
    const el = treeRef.current?.querySelector<HTMLElement>(`[data-file="${CSS.escape(firstTouched)}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [follow, firstTouched, children, expanded]);
  const renderDir = (dir: string, depth: number) => {
    const list = children[dir] ?? [];
    return list.map((f) => {
      const abs = joinPath(dir, f.name);
      const isDir = f.type === "dir";
      const isOpen = expanded.has(abs);
      const active = !isDir && (selected === abs || selected?.endsWith("/" + f.name));
      const act = !isDir ? activity.get(normPath(abs)) : undefined;
      return (
        <div key={abs}>
          <button
            type="button"
            title={abs}
            data-file={!isDir ? normPath(abs) : undefined}
            onClick={() => (isDir ? void toggle(abs) : onOpen(abs))}
            className={`flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-[12px] ${
              active
                ? "bg-[var(--lab-hover)] text-[var(--lab-ink)]"
                : act
                  ? "bg-[var(--lab-accent)]/[0.06] text-[var(--lab-ink)]"
                  : "text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
            }`}
            style={{ paddingLeft: 8 + depth * 12 }}
          >
            <span className="w-3 shrink-0 text-[10px] text-[var(--lab-ink-3)]">
              {isDir ? (isOpen ? "▾" : "▸") : "·"}
            </span>
            <span className="min-w-0 flex-1 truncate">{f.name}</span>
            {act ? (
              <span
                className={`shrink-0 rounded border px-1 py-px text-[9px] leading-none ${activityTone(act)}`}
                title={act.status === "created" ? "本轮新建" : act.status === "modified" ? "本轮修改" : "本轮读取"}
              >
                {activityLabel(act)}
              </span>
            ) : null}
          </button>
          {isDir && isOpen ? renderDir(abs, depth + 1) : null}
        </div>
      );
    });
  };

  if (loading && !children[root]) {
    return <div className="px-3 py-3 text-[11.5px] text-[var(--lab-ink-3)]">加载中…</div>;
  }

  const list = children[root] ?? [];
  if (!list.length) {
    return <div className="px-3 py-3 text-[11.5px] text-[var(--lab-ink-3)]">空目录</div>;
  }

  return <div className="py-1" ref={treeRef}>{renderDir(root, 0)}</div>;
}

function FileList({
  paths,
  workdir,
  selected,
  empty,
  onOpen,
  badges,
}: {
  paths: string[];
  workdir: string | null;
  selected: string | null;
  empty: string;
  onOpen: (absPath: string) => void;
  badges?: Record<string, string>;
}) {
  if (!paths.length) {
    return <div className="px-3 py-3 text-[11.5px] text-[var(--lab-ink-3)]">{empty}</div>;
  }
  return (
    <div className="py-1">
      {paths.map((p) => {
        const active = selected === p;
        return (
          <button
            key={p}
            type="button"
            title={p}
            onClick={() => onOpen(p)}
            className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] ${
              active
                ? "bg-[var(--lab-hover)] text-[var(--lab-ink)]"
                : "text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
            }`}
          >
            <span className="min-w-0 flex-1 truncate font-[var(--lab-mono)] text-[11.5px]">
              {relToWorkdir(workdir, p)}
            </span>
            {badges?.[p] ? (
              <span className="shrink-0 rounded bg-[var(--lab-inset)] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[var(--lab-ink-3)]">
                {badges[p]}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Normal-mode Cursor-style file workspace: 树 / 本次 / 最近 + content preview.
 * Always available (collapsed rail when shut); not gated on having opened a file.
 */
export default function FileWorkspaceSidebar({
  workdir,
  sessionKey,
  tools,
  preview,
  open,
  width,
  onWidthChange,
  onCollapse,
  onExpand,
  onPreview,
}: Props) {
  const [browse, setBrowse] = useState<BrowseTab>("tree");
  const [viewTab, setViewTab] = useState<"file" | "diff">("file");
  const [recents, setRecents] = useState<string[]>([]);
  const [follow, setFollow] = useState(loadFollow);
  const drag = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(FOLLOW_KEY, follow ? "1" : "0");
    } catch {
      /* ignore quota / private-mode failures */
    }
  }, [follow]);

  useEffect(() => {
    setRecents(loadFileRecents(sessionKey));
  }, [sessionKey]);

  useEffect(() => {
    if (!preview) return;
    if (preview.preferredTab) setViewTab(preview.preferredTab);
    else if (preview.lines?.length) setViewTab("diff");
    else setViewTab("file");
  }, [preview?.path, preview?.preferredTab, preview?.lines?.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCollapse();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCollapse]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!drag.current) return;
      const delta = drag.current.startX - e.clientX;
      onWidthChange(Math.max(WIDTH_MIN, Math.min(WIDTH_MAX, drag.current.startW + delta)));
    };
    const onUp = () => {
      drag.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [onWidthChange]);

  const turnFiles = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tools) {
      if (!t.file) continue;
      const label = (t.name || "tool").replace(/^.*\./, "").slice(0, 12);
      if (!map.has(t.file)) map.set(t.file, label);
    }
    return [...map.entries()].map(([path, badge]) => ({ path, badge }));
  }, [tools]);

  const fileActivity = useMemo(() => collectFileActivity(tools), [tools]);

  /**
   * Newest *finished* write/edit this turn — what「跟随」should surface in the
   * preview. Returns null while that newest write is still running, so we only
   * ever read a file the agent has stopped touching (no half-written content).
   */
  const lastWritten = useMemo(() => {
    for (let i = tools.length - 1; i >= 0; i -= 1) {
      const t = tools[i];
      if (!t.file || !toolWriteKind(t.name)) continue;
      return t.state === "running" ? null : t;
    }
    return null;
  }, [tools]);

  const activeFileName = useMemo(() => {
    for (const t of [...tools].reverse()) {
      if (t.file && t.state === "running") return fileName(t.file);
    }
    return null;
  }, [tools]);

  const turnBadges = useMemo(() => {
    const o: Record<string, string> = {};
    for (const { path, badge } of turnFiles) o[path] = badge;
    return o;
  }, [turnFiles]);

  const railFiles = useMemo(() => {
    const seen = new Set<string>();
    const out: { path: string; kind: "turn" | "recent" }[] = [];
    for (const { path } of turnFiles) {
      if (seen.has(path)) continue;
      seen.add(path);
      out.push({ path, kind: "turn" });
    }
    for (const path of recents) {
      if (seen.has(path)) continue;
      seen.add(path);
      out.push({ path, kind: "recent" });
    }
    return out.slice(0, 12);
  }, [turnFiles, recents]);

  const openAbs = useCallback(
    async (
      absPath: string,
      fromTool?: AgentToolTrace,
      opts?: { record?: boolean; origin?: "user" | "agent" },
    ) => {
      const target = normPath(absPath);
      const matches = (t: AgentToolTrace) => {
        if (!t.file) return false;
        const tf = normPath(t.file);
        return tf === target || tf.endsWith(target) || target.endsWith(tf);
      };
      // Prefer the tool that actually wrote the file — it is the one carrying
      // this turn's diff, whereas a Read/Glob of the same path carries none.
      const hit =
        fromTool ||
        tools.find((t) => matches(t) && toolWriteKind(t.name)) ||
        tools.find(matches);

      const lines =
        hit?.detailLines?.length && (hit.add !== undefined || hit.del !== undefined)
          ? hit.detailLines.map((l) => ({
              text: l.text,
              tone: (l.tone === "del" ? "del" : l.tone === "ctx" ? "ctx" : "add") as
                | "add"
                | "del"
                | "ctx",
            }))
          : undefined;

      let content: string | undefined;
      let error: string | undefined;
      if (window.lab?.readFile) {
        const r = await window.lab.readFile(absPath);
        if (r.ok) content = r.content || "";
        else error = r.error || "读取失败";
      } else if (!lines) {
        error = "当前环境无法读取文件";
      }

      onPreview({
        path: hit?.file || absPath,
        content,
        error: content === undefined ? error : undefined,
        lines,
        preferredTab: lines?.length ? "diff" : "file",
        origin: opts?.origin ?? "user",
      });
      onExpand();

      if (sessionKey && opts?.record !== false) {
        setRecents(pushFileRecent(sessionKey, hit?.file || absPath));
      }
    },
    [onExpand, onPreview, sessionKey, tools],
  );

  /**
   * Follow the agent's edits into the preview pane: when the agent finishes
   * writing or editing a file, switch the preview to it so the change is
   * visible without a click.
   *
   * Deliberately conservative — it only runs while the panel is already open
   * (never force-expands the panel), and the short delay collapses a burst of
   * writes into a single open of the newest file.
   */
  const openAbsRef = useRef(openAbs);
  useEffect(() => {
    openAbsRef.current = openAbs;
  }, [openAbs]);

  // Keep the newest write tool behind a ref so the effect below can depend on
  // plain strings while still handing openAbs the exact tool that wrote the file.
  const lastWrittenRef = useRef(lastWritten);
  useEffect(() => {
    lastWrittenRef.current = lastWritten;
  }, [lastWritten]);

  const followedRef = useRef<string | null>(null);
  const lastWrittenId = lastWritten?.id ?? null;
  const lastWrittenFile = lastWritten?.file ?? null;
  useEffect(() => {
    if (!follow || !open || !lastWrittenId || !lastWrittenFile) return;
    if (followedRef.current === lastWrittenId) return;
    const timer = window.setTimeout(() => {
      followedRef.current = lastWrittenId;
      const tool = lastWrittenRef.current;
      void openAbsRef.current(lastWrittenFile, tool?.id === lastWrittenId ? tool : undefined, {
        record: false,
        origin: "agent",
      });
    }, FOLLOW_PREVIEW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [follow, open, lastWrittenId, lastWrittenFile]);

  const hasDiff = Boolean(preview?.lines?.length);
  const hasFile = preview != null && (preview.content != null || preview.error);

  if (!open) {
    return (
      <div className="titlebar-no-drag flex h-full w-11 shrink-0 flex-col items-center border-l border-[var(--lab-border)] bg-[var(--lab-surface-solid)] py-2" data-lab-glass>
        <button
          type="button"
          title="展开文件面板"
          onClick={onExpand}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-[var(--lab-ink-3)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
          </svg>
        </button>
        <div className="mt-2 flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto px-0.5">
          {railFiles.length === 0 ? (
            <span className="mt-1 text-[9px] text-[var(--lab-ink-3)]" style={{ writingMode: "vertical-rl" }}>
              最近文件
            </span>
          ) : (
            railFiles.map(({ path, kind }) => (
              <button
                key={path}
                type="button"
                title={path}
                onClick={() => void openAbs(path)}
                className={`max-h-28 overflow-hidden rounded px-0.5 py-1 text-[9px] leading-tight hover:bg-[var(--lab-hover)] ${
                  kind === "turn" ? "text-[var(--lab-accent)]" : "text-[var(--lab-ink-3)]"
                }`}
                style={{ writingMode: "vertical-rl" }}
              >
                {fileName(path)}
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <aside
      className="titlebar-no-drag relative flex h-full shrink-0 flex-col border-l border-[var(--lab-border)] bg-[var(--lab-inset)]"
      style={{ width }}
      data-lab-glass
    >
      <div
        role="separator"
        aria-orientation="vertical"
        className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize hover:bg-[var(--lab-accent)]/20"
        onMouseDown={(e) => {
          e.preventDefault();
          drag.current = { startX: e.clientX, startW: width };
        }}
      />

      {/* Chrome header — align with main titlebar */}
      <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-[var(--lab-border-soft)] bg-[var(--lab-surface-solid)] px-2">
        <button
          type="button"
          title="折叠"
          onClick={onCollapse}
          className="rounded-md px-1.5 py-1 text-[12px] text-[var(--lab-ink-3)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
        >
          ›
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[12.5px] font-medium text-[var(--lab-ink)]">文件</span>
            {follow && activeFileName ? (
              <span className="flex min-w-0 items-center gap-1 text-[10px] text-[var(--lab-accent)]" title={activeFileName}>
                <span className="size-1.5 shrink-0 rounded-full bg-[var(--lab-accent)] motion-safe:animate-pulse" />
                <span className="truncate font-[var(--lab-mono)]">{activeFileName}</span>
              </span>
            ) : null}
          </div>
          <div className="truncate font-[var(--lab-mono)] text-[10px] text-[var(--lab-ink-3)]" title={workdir ?? undefined}>
            {workdir ? fileName(workdir) : "未绑定工作区"}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={follow}
          aria-label={follow ? "关闭跟随 agent" : "开启跟随 agent"}
          title={
            follow
              ? "跟随 agent：开 · 改动文件时自动定位并预览（面板折叠时不跟随）"
              : "跟随 agent：关 · 不自动定位或预览"
          }
          onClick={() => setFollow((v) => !v)}
          className={`flex size-6 shrink-0 items-center justify-center rounded-md border text-[11px] ${
            follow
              ? "border-[var(--lab-accent)]/40 bg-[var(--lab-accent)]/10 text-[var(--lab-accent)]"
              : "border-[var(--lab-border-soft)] text-[var(--lab-ink-3)] hover:text-[var(--lab-ink)]"
          }`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="3.2" />
            <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
          </svg>
        </button>
        <div className="flex rounded-md border border-[var(--lab-border-soft)] bg-[var(--lab-inset)] p-0.5 text-[11px]">
          {(
            [
              { id: "tree" as const, label: "树" },
              { id: "turn" as const, label: "本次" },
              { id: "recent" as const, label: "最近" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              className={`rounded px-2 py-0.5 ${
                browse === t.id
                  ? "bg-[var(--lab-surface-solid)] text-[var(--lab-ink)] shadow-sm"
                  : "text-[var(--lab-ink-3)]"
              }`}
              onClick={() => setBrowse(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Browser */}
      <div className="flex max-h-[38%] min-h-[120px] shrink-0 flex-col border-b border-[var(--lab-border-soft)] bg-[var(--lab-surface-solid)]">
        <div className="min-h-0 flex-1 overflow-auto">
          {!workdir ? (
            <div className="px-3 py-4 text-[11.5px] text-[var(--lab-ink-3)]">先选择工作区，即可浏览文件。</div>
          ) : browse === "tree" ? (
            <WorkspaceTree root={workdir} selected={preview?.path ?? null} activity={fileActivity} follow={follow} onOpen={(p) => void openAbs(p)} />
          ) : browse === "turn" ? (
            <FileList
              paths={turnFiles.map((t) => t.path)}
              workdir={workdir}
              selected={preview?.path ?? null}
              empty="本轮还没有触达文件。Agent Write/Edit/Read 后会出现在这里。"
              onOpen={(p) => void openAbs(p)}
              badges={turnBadges}
            />
          ) : (
            <FileList
              paths={recents}
              workdir={workdir}
              selected={preview?.path ?? null}
              empty="还没有打开过文件。从树或工具点开后会出现在这里。"
              onOpen={(p) => void openAbs(p)}
            />
          )}
        </div>
      </div>

      {/* Preview chrome */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--lab-border-soft)] bg-[var(--lab-surface-solid)] px-2.5">
        <div className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--lab-ink)]" title={preview?.path}>
          {preview ? fileName(preview.path) : "预览"}
        </div>
        {preview?.origin === "agent" ? (
          <span
            className="shrink-0 rounded border border-[var(--lab-accent)]/40 bg-[var(--lab-accent)]/10 px-1.5 py-px text-[9.5px] leading-none text-[var(--lab-accent)]"
            title="由跟随 agent 自动打开"
          >
            跟随
          </span>
        ) : null}
        {preview && hasFile && hasDiff ? (
          <div className="flex rounded-md border border-[var(--lab-border-soft)] bg-[var(--lab-inset)] p-0.5 text-[11px]">
            <button
              type="button"
              className={`rounded px-2 py-0.5 ${viewTab === "diff" ? "bg-[var(--lab-surface-solid)] text-[var(--lab-ink)] shadow-sm" : "text-[var(--lab-ink-3)]"}`}
              onClick={() => setViewTab("diff")}
            >
              Diff
            </button>
            <button
              type="button"
              className={`rounded px-2 py-0.5 ${viewTab === "file" ? "bg-[var(--lab-surface-solid)] text-[var(--lab-ink)] shadow-sm" : "text-[var(--lab-ink-3)]"}`}
              onClick={() => setViewTab("file")}
            >
              全文
            </button>
          </div>
        ) : preview ? (
          <span className="shrink-0 rounded bg-[var(--lab-hover)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--lab-ink-3)]">
            {hasDiff && !hasFile ? "diff" : "file"}
          </span>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-[var(--lab-surface-solid)] lab-code-body">
        {!preview ? (
          <p className="px-3 py-5 text-[12.5px] text-[var(--lab-ink-3)]">
            在上方点开文件，或从对话里的工具文件跳转过来。
          </p>
        ) : preview.error && (viewTab === "file" || !hasDiff) ? (
          <p className="px-3 py-5 text-[13px] text-[var(--lab-warn)]">{preview.error}</p>
        ) : viewTab === "diff" && hasDiff ? (
          <div className="py-2">
            <DiffLines lines={preview.lines!} />
          </div>
        ) : (
          <div className="py-1">
            <CodeLines content={preview.content ?? ""} />
          </div>
        )}
      </div>

      <div
        className="shrink-0 truncate border-t border-[var(--lab-border-soft)] bg-[var(--lab-surface-solid)] px-3 py-1.5 font-[var(--lab-mono)] text-[10px] text-[var(--lab-ink-3)]"
        title={preview?.path}
      >
        Esc 折叠 · {preview?.path || "—"}
      </div>
    </aside>
  );
}

export { FILE_SIDEBAR_DEFAULT_WIDTH, FILE_SIDEBAR_RAIL };
