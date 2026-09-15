import { useEffect, useState } from "react";

interface FileEntry {
  name: string;
  type: string;
  size: number;
}

interface Props {
  root: string | null;
  onSelect?: (path: string) => void;
}

export default function FileTree({ root, onSelect }: Props) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<{ path: string; content: string } | null>(null);

  useEffect(() => {
    if (!root) {
      setFiles([]);
      return;
    }
    setLoading(true);
    setError(null);
    void window.lab?.listFiles(root).then((list) => {
      setFiles(list);
      setLoading(false);
    });
  }, [root]);

  const toggleDir = async (name: string) => {
    const path = `${root}/${name}`;
    if (expanded.has(path)) {
      setExpanded((s) => {
        const n = new Set(s);
        n.delete(path);
        return n;
      });
    } else {
      setExpanded((s) => new Set(s).add(path));
      // load subdirectory
      const sub = await window.lab?.listFiles(path);
      if (sub) {
        setFiles((prev) => {
          const idx = prev.findIndex((f) => f.name === name);
          if (idx === -1) return prev;
          const next = [...prev];
          next[idx] = { ...next[idx], children: sub } as FileEntry & { children: FileEntry[] };
          return next;
        });
      }
    }
  };

  const previewFile = async (name: string) => {
    const path = `${root}/${name}`;
    const r = await window.lab?.readFile(path);
    if (r?.ok) {
      setPreview({ path, content: r.content ?? "" });
      onSelect?.(path);
    } else {
      setPreview({ path, content: `无法读取：${r?.error ?? "unknown"}` });
    }
  };

  if (!root) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--lab-border)] px-3 py-8 text-center text-[11.5px] text-[var(--lab-ink-3)]">
        先在顶部选一个工作文件夹
      </div>
    );
  }

  if (loading) {
    return <div className="px-3 py-4 text-[11.5px] text-[var(--lab-ink-3)]">加载中…</div>;
  }

  if (error) {
    return <div className="px-3 py-4 text-[11.5px] text-[var(--lab-red)]">{error}</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {files.map((f) => (
          <div key={f.name}>
            <button
              type="button"
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[12px] text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
              onClick={() => (f.type === "dir" ? toggleDir(f.name) : previewFile(f.name))}
            >
              <span className="text-[10px] text-[var(--lab-ink-3)]">
                {f.type === "dir" ? (expanded.has(`${root}/${f.name}`) ? "▾" : "▸") : "·"}
              </span>
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="shrink-0 text-[9px] text-[var(--lab-ink-3)]">
                {f.type === "dir" ? "dir" : f.size > 1024 ? `${(f.size / 1024).toFixed(1)}k` : `${f.size}B`}
              </span>
            </button>
            {/* subdirectory */ }
            {f.type === "dir" && expanded.has(`${root}/${f.name}`) && (f as FileEntry & { children?: FileEntry[] }).children ? (
              <div className="ml-3 border-l border-[var(--lab-border-soft)] pl-1">
                {((f as FileEntry & { children?: FileEntry[] }).children ?? []).map((sub) => (
                  <button
                    key={sub.name}
                    type="button"
                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11.5px] text-[var(--lab-ink-3)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
                    onClick={() => (sub.type === "dir" ? toggleDir(`${f.name}/${sub.name}`) : previewFile(`${f.name}/${sub.name}`))}
                  >
                    <span className="text-[9px]">·</span>
                    <span className="min-w-0 flex-1 truncate">{sub.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {files.length === 0 ? (
          <div className="px-3 py-4 text-center text-[11px] text-[var(--lab-ink-3)]">空目录</div>
        ) : null}
      </div>

      {/* preview pane */}
      {preview ? (
        <div className="mt-2 max-h-40 shrink-0 overflow-hidden rounded-lg border border-[var(--lab-border)]">
          <div className="flex items-center justify-between border-b border-[var(--lab-border-soft)] bg-[var(--lab-inset)] px-2 py-1">
            <span className="truncate font-[var(--lab-mono)] text-[10px] text-[var(--lab-ink-3)]">{preview.path.split("/").slice(-2).join("/")}</span>
            <button type="button" className="text-[10px] text-[var(--lab-ink-3)] hover:text-[var(--lab-ink)]" onClick={() => setPreview(null)}>
              ×
            </button>
          </div>
          <pre className="max-h-32 overflow-auto p-2 font-[var(--lab-mono)] text-[10.5px] leading-[1.4] text-[var(--lab-ink-2)]">
            {preview.content.slice(0, 2000)}
            {preview.content.length > 2000 ? "\n…" : ""}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
