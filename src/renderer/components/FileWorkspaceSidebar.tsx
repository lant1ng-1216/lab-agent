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
  onOpen,
}: {
  root: string;
  selected: string | null;
  onOpen: (absPath: string) => void;
}) {
  const [children, setChildren] = useState<Record<string, Entry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([root]));
  const [loading, setLoading] = useState(true);

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

  const renderDir = (dir: string, depth: number) => {
    const list = children[dir] ?? [];
    return list.map((f) => {
      const abs = joinPath(dir, f.name);
      const isDir = f.type === "dir";
      const isOpen = expanded.has(abs);
      const active = !isDir && (selected === abs || selected?.endsWith("/" + f.name));
      return (
        <div key={abs}>
          <button
            type="button"
            title={abs}
            onClick={() => (isDir ? void toggle(abs) : onOpen(abs))}
            className={`flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-[12px] ${
              active
                ? "bg-[var(--lab-hover)] text-[var(--lab-ink)]"
                : "text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
            }`}
            style={{ paddingLeft: 8 + depth * 12 }}
          >
            <span className="w-3 shrink-0 text-[10px] text-[var(--lab-ink-3)]">
              {isDir ? (isOpen ? "▾" : "▸") : "·"}
            </span>
            <span className="min-w-0 flex-1 truncate">{f.name}</span>
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

  return <div className="py-1">{renderDir(root, 0)}</div>;
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
  const drag = useRef<{ startX: number; startW: number } | null>(null);

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
    async (absPath: string, fromTool?: AgentToolTrace) => {
      const hit =
        fromTool ||
        tools.find(
          (t) =>
            t.file === absPath ||
            t.file?.endsWith(absPath) ||
            absPath.endsWith(t.file || ""),
        );

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
      });
      onExpand();

      if (sessionKey) {
        setRecents(pushFileRecent(sessionKey, hit?.file || absPath));
      }
    },
    [onExpand, onPreview, sessionKey, tools],
  );

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
          <div className="truncate text-[12.5px] font-medium text-[var(--lab-ink)]">文件</div>
          <div className="truncate font-[var(--lab-mono)] text-[10px] text-[var(--lab-ink-3)]" title={workdir ?? undefined}>
            {workdir ? fileName(workdir) : "未绑定工作区"}
          </div>
        </div>
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
            <WorkspaceTree root={workdir} selected={preview?.path ?? null} onOpen={(p) => void openAbs(p)} />
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
