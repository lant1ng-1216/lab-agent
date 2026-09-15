import { useEffect, useMemo, useRef, useState } from "react";

export type FilePreviewPayload = {
  path: string;
  content?: string;
  error?: string;
  lines?: { text: string; tone?: "add" | "del" | "ctx" }[];
  /** Prefer opening on this tab when both exist */
  preferredTab?: "file" | "diff";
};

type Props = {
  preview: FilePreviewPayload | null;
  open: boolean;
  width: number;
  onWidthChange: (w: number) => void;
  onCollapse: () => void;
  onExpand: () => void;
};

const WIDTH_MIN = 340;
const WIDTH_MAX = 640;
const WIDTH_DEFAULT = 440;
const RAIL = 36;

function fileName(path: string) {
  return path.split(/[/\\]/).filter(Boolean).pop() || path;
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

/**
 * Persistent collapsible file inspect sidebar (not a modal popup).
 */
export default function FileInspectSidebar({
  preview,
  open,
  width,
  onWidthChange,
  onCollapse,
  onExpand,
}: Props) {
  const [tab, setTab] = useState<"file" | "diff">("file");
  const drag = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    if (!preview) return;
    if (preview.preferredTab) setTab(preview.preferredTab);
    else if (preview.lines?.length) setTab("diff");
    else setTab("file");
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

  const hasDiff = Boolean(preview?.lines?.length);
  const hasFile = preview != null && (preview.content != null || preview.error);

  // Nothing to show until a file has been opened at least once
  if (!preview) return null;

  // Collapsed rail
  if (!open) {
    return (
      <div className="titlebar-no-drag flex h-full w-9 shrink-0 flex-col items-center border-l border-[var(--lab-border)] bg-[var(--lab-surface-solid)] py-2">
        <button
          type="button"
          title="展开文件面板"
          onClick={onExpand}
          className="flex size-7 items-center justify-center rounded-md text-[var(--lab-ink-3)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
          </svg>
        </button>
        {preview ? (
          <span
            className="mt-2 max-h-40 overflow-hidden text-[9px] leading-tight text-[var(--lab-ink-3)]"
            style={{ writingMode: "vertical-rl" }}
            title={preview.path}
          >
            {fileName(preview.path)}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <aside
      className="titlebar-no-drag relative flex h-full shrink-0 flex-col border-l border-[var(--lab-border)] bg-[var(--lab-inset)]"
      style={{ width }}
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

      <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-[var(--lab-border-soft)] bg-[var(--lab-surface-solid)] px-2.5">
        <button
          type="button"
          title="折叠"
          onClick={onCollapse}
          className="rounded-md px-1.5 py-1 text-[12px] text-[var(--lab-ink-3)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
        >
          ›
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-medium text-[var(--lab-ink)]" title={preview?.path}>
            {preview ? fileName(preview.path) : "文件"}
          </div>
          {preview?.path ? (
            <div className="truncate font-[var(--lab-mono)] text-[10px] text-[var(--lab-ink-3)]" title={preview.path}>
              {preview.path}
            </div>
          ) : null}
        </div>
        {hasFile && hasDiff ? (
          <div className="flex rounded-md border border-[var(--lab-border-soft)] bg-[var(--lab-inset)] p-0.5 text-[11px]">
            <button
              type="button"
              className={`rounded px-2 py-0.5 ${tab === "diff" ? "bg-[var(--lab-surface-solid)] text-[var(--lab-ink)] shadow-sm" : "text-[var(--lab-ink-3)]"}`}
              onClick={() => setTab("diff")}
            >
              Diff
            </button>
            <button
              type="button"
              className={`rounded px-2 py-0.5 ${tab === "file" ? "bg-[var(--lab-surface-solid)] text-[var(--lab-ink)] shadow-sm" : "text-[var(--lab-ink-3)]"}`}
              onClick={() => setTab("file")}
            >
              全文
            </button>
          </div>
        ) : (
          <span className="shrink-0 rounded bg-[var(--lab-hover)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--lab-ink-3)]">
            {hasDiff && !hasFile ? "diff" : "file"}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-[var(--lab-surface-solid)]">
        {!preview ? (
          <p className="px-3 py-5 text-[12.5px] text-[var(--lab-ink-3)]">点击工具里的文件可在此查看。</p>
        ) : preview.error && (tab === "file" || !hasDiff) ? (
          <p className="px-3 py-5 text-[13px] text-[var(--lab-warn)]">{preview.error}</p>
        ) : tab === "diff" && hasDiff ? (
          <div className="py-2">
            <DiffLines lines={preview.lines!} />
          </div>
        ) : (
          <div className="py-1">
            <CodeLines content={preview.content ?? ""} />
          </div>
        )}
      </div>

      <div className="shrink-0 truncate border-t border-[var(--lab-border-soft)] bg-[var(--lab-surface-solid)] px-3 py-1.5 font-[var(--lab-mono)] text-[10px] text-[var(--lab-ink-3)]" title={preview?.path}>
        Esc 折叠 · {preview?.path || "—"}
      </div>
    </aside>
  );
}

export { WIDTH_DEFAULT as FILE_SIDEBAR_DEFAULT_WIDTH, RAIL as FILE_SIDEBAR_RAIL };
