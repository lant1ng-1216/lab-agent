import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  MarketInstallResult,
  MarketSkillInfo,
  MarketSourceInfo,
  SkillScope,
  SkillsListResult,
} from "../../shared/protocol";
import MarkdownBody from "./MarkdownBody";

const DESCRIPTION_CACHE_LIMIT = 60;
/** Batch size for the progressive frontmatter fetch that fills card descriptions. */
const DESCRIBE_CHUNK = 12;

type InstallState = Record<string, "installing" | "installed" | "failed">;

function splitFrontmatter(content: string): { frontmatter: string; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { frontmatter: "", body: content };
  return { frontmatter: match[1], body: content.slice(match[0].length) };
}

function frontmatterField(frontmatter: string, field: string): string {
  const match = frontmatter.match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim() ?? "";
}

function formatBytes(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Deterministic upscale by hash → lets each card carry a stable tint + glyph. */
const PALETTES = [
  { from: "#7c5cff", to: "#c7b4ff", glyph: "✦" },
  { from: "#2f9e7c", to: "#8fe3c2", glyph: "◈" },
  { from: "#e0803c", to: "#ffd0a1", glyph: "◇" },
  { from: "#3b7ddd", to: "#a9cdf6", glyph: "◆" },
  { from: "#c2537a", to: "#ffb9cd", glyph: "❖" },
  { from: "#4a5568", to: "#c3cede", glyph: "▣" },
];

function paletteFor(seed: string, index: number) {
  let hash = index * 2654435761;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 33 + seed.charCodeAt(i)) >>> 0;
  return PALETTES[hash % PALETTES.length];
}

export default function SkillsMarketPanel({
  open,
  workspacePath,
  onClose,
  onToast,
  onInstalled,
}: {
  open: boolean;
  workspacePath: string;
  onClose: () => void;
  onToast?: (msg: string, opts?: { icon?: "check" | "warning" | "info" | "folder"; body?: string }) => void;
  /** Fired after a successful install so the shell can refresh other panels. */
  onInstalled?: (scope: SkillScope, name: string) => void;
}) {
  const [sources, setSources] = useState<MarketSourceInfo[]>([]);
  const [skills, setSkills] = useState<MarketSkillInfo[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [describeLoading, setDescribeLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [activeSource, setActiveSource] = useState<string>("all");
  const [sortMode, setSortMode] = useState<"name" | "source" | "size">("name");
  const [scope, setScope] = useState<SkillScope>(workspacePath ? "project" : "global");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ content: string; assets: string[] } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [installState, setInstallState] = useState<InstallState>({});
  const [installed, setInstalled] = useState<Record<string, Set<string>>>({ project: new Set(), global: new Set() });
  const [status, setStatus] = useState("");
  const describedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setScope(workspacePath ? "project" : "global");
  }, [workspacePath]);

  const refreshInstalled = useCallback(async () => {
    const res: SkillsListResult = await window.lab.skillsList();
    if (!res.ok) return;
    const map: Record<string, Set<string>> = { project: new Set(), global: new Set() };
    for (const skill of res.skills) {
      (map[skill.scope] ??= new Set()).add(skill.name);
    }
    setInstalled(map);
  }, []);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setStatus("");
    try {
      const res = await window.lab.skillsMarketList();
      setSources(res.sources ?? []);
      setSkills(res.skills ?? []);
      setErrors(res.errors ?? {});
      if (!res.ok && !(res.skills ?? []).length) {
        setStatus("技能社区拉取失败：请检查网络，或稍后重试（GitHub 未登录时限流较严格）");
      }
      // Seed "installed" badges from the already-known skills so the first
      // paint reflects reality even before the full catalog resolves.
      for (const skill of res.skills ?? []) {
        setInstallState((prev) => {
          const dirName = skill.id.split("/").slice(1).pop() ?? skill.name;
          return prev[dirName] ? prev : prev;
        });
      }
    } catch (e) {
      setStatus(String(e));
    } finally {
      setLoading(false);
    }
    await refreshInstalled();
  }, [refreshInstalled]);

  useEffect(() => {
    if (!open) return;
    if (skills.length === 0 && !loading) void loadCatalog();
    else void refreshInstalled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Lazily fill descriptions for what the user can currently see. */
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let list = skills;
    if (activeSource !== "all") list = list.filter((s) => s.sourceId === activeSource);
    else if (sources.length) {
      const enabled: string[] = [];
      list = list.filter((s) => enabled.includes(s.sourceId) || true);
    }
    if (needle) {
      list = list.filter((s) => {
        const src = sources.find((x) => x.id === s.sourceId);
        return (
          s.name.toLowerCase().includes(needle) ||
          s.description.toLowerCase().includes(needle) ||
          (src?.label.toLowerCase().includes(needle) ?? false)
        );
      });
    }
    const sorted = [...list];
    if (sortMode === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortMode === "size") sorted.sort((a, b) => b.bytes - a.bytes);
    else sorted.sort((a, b) => a.sourceId.localeCompare(b.sourceId) || a.name.localeCompare(b.name));
    return sorted;
  }, [activeSource, query, skills, sortMode, sources]);

  useEffect(() => {
    if (!open) return;
    const pending = visible
      .filter((s) => !s.description && !describedRef.current.has(s.id))
      .slice(0, DESCRIBE_CHUNK)
      .map((s) => s.id);
    if (!pending.length) return;
    for (const id of pending) describedRef.current.add(id);
    let cancelled = false;
    setDescribeLoading(true);
    void (async () => {
      try {
        const res = await window.lab.skillsMarketDescribe(pending);
        if (cancelled) return;
        const byId = new Map((res.metas ?? []).map((m) => [m.id, m]));
        setSkills((prev) =>
          prev.map((s) => {
            const meta = byId.get(s.id);
            if (!meta) return s;
            return {
              ...s,
              description: meta.description || s.description,
              declaredName: meta.declaredName || s.declaredName,
            };
          }),
        );
      } catch {
        /* descriptions are best-effort */
      } finally {
        if (!cancelled) setDescribeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, visible]);

  const selected = useMemo(() => skills.find((s) => s.id === selectedId) ?? null, [skills, selectedId]);

  const loadPreview = useCallback(async (id: string) => {
    setSelectedId(id);
    setPreview(null);
    setPreviewError("");
    setPreviewLoading(true);
    try {
      const res = await window.lab.skillsMarketPreview({ id });
      if (res.ok) setPreview({ content: res.content ?? "", assets: res.assets ?? [] });
      else setPreviewError(res.error || "预览加载失败");
    } catch (e) {
      setPreviewError(String(e));
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const install = useCallback(
    async (skill: MarketSkillInfo) => {
      const target = scope;
      if (target === "project" && !workspacePath) {
        onToast?.("请先选择或添加工作区", { icon: "warning" });
        return;
      }
      const name = skill.name.replace(/[^A-Za-z0-9._-]+/g, "-");
      const key = `${target}/${name}`;
      const exists = installed[target]?.has(name) ?? false;
      if (exists && !window.confirm(`已存在技能「${name}」，安装将覆盖它。继续？`)) return;
      setInstallState((prev) => ({ ...prev, [key]: "installing" }));
      const res: MarketInstallResult = await window.lab.skillsMarketInstall({
        id: skill.id,
        scope: target,
        name,
        overwrite: exists,
      });
      if (res.ok) {
        setInstallState((prev) => ({ ...prev, [key]: "installed" }));
        const label = target === "project" ? "项目级" : "全局";
        const extra = res.files && res.files.length > 1 ? `（含 ${res.files.length - 1} 个辅助文件）` : "";
        setStatus(`已安装「${res.name}」到${label}${extra} · 引擎热检测即刻生效`);
        onToast?.(`技能「${res.name}」已安装 · ${label}`, { icon: "check", body: `/${res.name} 即可调用` });
        await refreshInstalled();
        onInstalled?.(target, res.name ?? name);
      } else if (res.conflict) {
        setInstallState((prev) => ({ ...prev, [key]: "installed" }));
        setStatus(res.error || "已存在同名技能");
      } else {
        setInstallState((prev) => ({ ...prev, [key]: "failed" }));
        setStatus(res.error || "安装失败");
        onToast?.(res.error || "安装失败", { icon: "warning" });
      }
    },
    [installed, onInstalled, onToast, refreshInstalled, scope, workspacePath],
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const countsBySource = new Map<string, number>();
  for (const skill of skills) countsBySource.set(skill.sourceId, (countsBySource.get(skill.sourceId) ?? 0) + 1);
  const total = skills.length;
  const filterTabs = [{ id: "all", label: "全部", count: total }, ...sources.map((s) => ({ id: s.id, label: s.label, count: countsBySource.get(s.id) ?? 0 }))];
  const errorList = Object.entries(errors);
  const selectedFm = preview ? splitFrontmatter(preview.content) : { frontmatter: "", body: "" };
  const selectedSource = selected ? sources.find((s) => s.id === selected.sourceId) : null;

  return (
    <div className="titlebar-no-drag absolute inset-0 z-40 flex items-start justify-center bg-black/45 backdrop-blur-sm" onClick={onClose}>
      <div
        className="mt-[3vh] flex h-[94vh] w-[1180px] max-w-[96vw] flex-col overflow-hidden rounded-2xl border border-[var(--lab-border)] bg-[var(--lab-surface-solid)] shadow-[0_28px_80px_rgba(0,0,0,0.5)]"
        data-lab-glass
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative shrink-0 overflow-hidden border-b border-[var(--lab-border)]">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.55]"
            style={{
              background:
                "radial-gradient(720px 220px at 8% -30%, color-mix(in srgb, var(--lab-accent) 26%, transparent), transparent 70%), radial-gradient(560px 200px at 92% -40%, color-mix(in srgb, var(--lab-accent) 14%, transparent), transparent 70%)",
            }}
          />
          <div className="relative flex items-start gap-4 px-5 py-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[17px] font-semibold tracking-[-0.01em] text-[var(--lab-ink)]">技能市场</span>
                <span className="rounded-full border border-[var(--lab-border)] px-2 py-0.5 text-[10px] text-[var(--lab-ink-3)]">
                  {loading ? "拉取中…" : `${total} 个可用技能 · ${sources.length} 个来源`}
                </span>
              </div>
              <p className="mt-1 max-w-[680px] text-[11.5px] leading-relaxed text-[var(--lab-ink-3)]">
                来自 GitHub 上公开的技能仓库。一键安装后写入{" "}
                <code className="rounded bg-[var(--lab-hover)] px-1 py-0.5 text-[10.5px] text-[var(--lab-ink-2)]">
                  {scope === "project" ? ".claude/skills" : "全局 skills 目录"}
                </code>
                ，引擎热检测即刻生效——输入 <code className="text-[var(--lab-accent)]">/技能名</code> 即可调用。
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="flex items-center rounded-lg border border-[var(--lab-border)] p-0.5 text-[11px]">
                <button
                  type="button"
                  disabled={!workspacePath}
                  className={
                    "rounded-md px-2 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40 " +
                    (scope === "project" ? "bg-[var(--lab-accent)] text-white" : "text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)]")
                  }
                  onClick={() => setScope("project")}
                  title={workspacePath ? "安装到当前工作区的 .claude/skills" : "未设置工作区"}
                >
                  项目级
                </button>
                <button
                  type="button"
                  className={
                    "rounded-md px-2 py-1 transition-colors " +
                    (scope === "global" ? "bg-[var(--lab-accent)] text-white" : "text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)]")
                  }
                  onClick={() => setScope("global")}
                  title="安装到全局 skills 目录，所有工作区可用"
                >
                  全局
                </button>
              </div>
              <button
                type="button"
                className="rounded-lg border border-[var(--lab-border)] px-2.5 py-1.5 text-[11.5px] text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
                onClick={() => void loadCatalog()}
                disabled={loading}
              >
                {loading ? "刷新中…" : "刷新"}
              </button>
              <button
                type="button"
                className="rounded-lg px-2.5 py-1.5 text-[13px] text-[var(--lab-ink-3)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
                onClick={onClose}
                aria-label="关闭技能市场"
              >
                ×
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="shrink-0 border-b border-[var(--lab-border)] px-5 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[210px] flex-1">
              <svg
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--lab-ink-3)]"
                width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              >
                <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索技能名或描述…"
                className="w-full rounded-lg border border-[var(--lab-border)] bg-transparent py-1.5 pl-8 pr-2.5 text-[12px] text-[var(--lab-ink)] outline-none placeholder:text-[var(--lab-ink-3)] focus:border-[var(--lab-accent)]"
              />
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-[var(--lab-border)] p-0.5 text-[10.5px]">
              {([
                ["name", "按名称"],
                ["source", "按来源"],
                ["size", "按体积"],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className={
                    "rounded-md px-2 py-0.5 transition-colors " +
                    (sortMode === mode ? "bg-[var(--lab-hover)] text-[var(--lab-ink)]" : "text-[var(--lab-ink-3)] hover:text-[var(--lab-ink-2)]")
                  }
                  onClick={() => setSortMode(mode)}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="text-[10.5px] text-[var(--lab-ink-3)]">
              {visible.length} / {total}
              {describeLoading ? " · 描述加载中…" : ""}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSource(tab.id)}
                className={
                  "rounded-full border px-2.5 py-1 text-[11px] transition-colors " +
                  (activeSource === tab.id
                    ? "border-[var(--lab-accent)] bg-[var(--lab-accent)]/12 text-[var(--lab-accent)]"
                    : "border-[var(--lab-border)] text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)]")
                }
              >
                {tab.label}
                <span className="ml-1 text-[10px] text-[var(--lab-ink-3)]">{tab.count}</span>
              </button>
            ))}
          </div>
          {errorList.length ? (
            <div className="mt-2 rounded-lg border border-[var(--lab-warn-border)]/40 bg-[var(--lab-warn-soft)] px-2.5 py-1.5 text-[10.5px] leading-relaxed text-[var(--lab-ink-2)]">
              部分来源暂时不可用：
              {errorList.map(([id, msg]) => {
                const src = sources.find((s) => s.id === id);
                return <span key={id} className="ml-1">{src?.label ?? id}（{msg}）</span>;
              })}
            </div>
          ) : null}
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1">
          {/* Card grid */}
          <div className="min-w-0 flex-1 overflow-y-auto px-5 py-4">
            {loading && skills.length === 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-[136px] animate-pulse rounded-xl border border-[var(--lab-border)] bg-[var(--lab-hover)]/40" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-[12.5px] leading-relaxed text-[var(--lab-ink-3)]">
                <div>
                  <p>{total ? "没有匹配的技能，换个关键词试试。" : "暂未拉到社区技能，检查网络后点右上角刷新。"}</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((skill, index) => {
                  const src = sources.find((s) => s.id === skill.sourceId);
                  const palette = paletteFor(skill.id, index);
                  const name = skill.name.replace(/[^A-Za-z0-9._-]+/g, "-");
                  const key = `${scope}/${name}`;
                  const isInstalled = installed[scope]?.has(name) ?? false;
                  const state = installState[key];
                  const active = selectedId === skill.id;
                  return (
                    <div
                      key={skill.id}
                      onClick={() => void loadPreview(skill.id)}
                      className={
                        "group flex cursor-pointer flex-col rounded-xl border p-3 transition-all duration-150 " +
                        (active
                          ? "border-[var(--lab-accent)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--lab-accent)_35%,transparent)]"
                          : "border-[var(--lab-border)] hover:-translate-y-px hover:border-[var(--lab-accent)]/45 hover:shadow-[0_8px_24px_rgba(0,0,0,0.14)]")
                      }
                      style={{ background: "color-mix(in srgb, var(--lab-surface-solid) 88%, transparent)" }}
                    >
                      <div className="flex items-start gap-2.5">
                        <div
                          className="flex size-9 shrink-0 items-center justify-center rounded-[10px] text-[15px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]"
                          style={{ background: `linear-gradient(135deg, ${palette.from}, ${palette.to})` }}
                        >
                          {palette.glyph}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-mono text-[12.5px] font-medium text-[var(--lab-ink)]">{skill.name}</span>
                            {isInstalled ? (
                              <span className="shrink-0 rounded-full bg-[var(--lab-green)]/15 px-1.5 py-0.5 text-[9.5px] text-[var(--lab-green)]">已安装</span>
                            ) : null}
                          </div>
                          <div className="truncate text-[10px] text-[var(--lab-ink-3)]">{src?.label ?? skill.sourceId}</div>
                        </div>
                      </div>
                      <p className="mt-2 line-clamp-3 min-h-[42px] text-[11.5px] leading-[1.5] text-[var(--lab-ink-2)]">
                        {skill.description || "（来源未提供描述，点开右侧可预览全文）"}
                      </p>
                      <div className="mt-2.5 flex items-center gap-1.5 border-t border-[var(--lab-border-soft)] pt-2">
                        <span className="text-[9.5px] text-[var(--lab-ink-3)]">{formatBytes(skill.bytes)}</span>
                        {skill.assetCount ? (
                          <span className="rounded border border-[var(--lab-border)] px-1 py-px text-[9.5px] text-[var(--lab-ink-3)]">
                            +{skill.assetCount} 文件
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void install(skill);
                          }}
                          disabled={state === "installing"}
                          className={
                            "ml-auto rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 " +
                            (isInstalled
                              ? "border border-[var(--lab-border)] text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)]"
                              : "bg-[var(--lab-accent)] text-white hover:opacity-90")
                          }
                        >
                          {state === "installing" ? "安装中…" : state === "failed" ? "重试" : isInstalled ? "重新安装" : "安装"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Preview rail */}
          <div className="flex w-[380px] shrink-0 flex-col border-l border-[var(--lab-border)]">
            {!selected ? (
              <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                <div className="mb-2 text-[22px] opacity-40">✦</div>
                <p className="text-[12.5px] text-[var(--lab-ink-3)]">选择一个技能查看完整 SKILL.md</p>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--lab-ink-3)]">
                  安装前可以先确认它做了什么——尤其带脚本的技能。
                </p>
              </div>
            ) : previewLoading ? (
              <div className="flex flex-1 items-center justify-center text-[12px] text-[var(--lab-ink-3)]">加载预览…</div>
            ) : previewError ? (
              <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-[12px] text-[var(--lab-red)]">
                <p>{previewError}</p>
                <button type="button" className="mt-2 rounded-lg border border-[var(--lab-border)] px-2.5 py-1 text-[11.5px] text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)]" onClick={() => void loadPreview(selected.id)}>
                  重试
                </button>
              </div>
            ) : preview ? (
              <>
                <div className="shrink-0 border-b border-[var(--lab-border)] px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-[13px] font-medium text-[var(--lab-ink)]">{selected.name}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[var(--lab-ink-3)]">
                        <span>{selectedSource?.label ?? selected.sourceId}</span>
                        <span>·</span>
                        <span>{formatBytes(selected.bytes)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void install(selected)}
                      disabled={installState[`${scope}/${selected.name.replace(/[^A-Za-z0-9._-]+/g, "-")}`] === "installing"}
                      className="shrink-0 rounded-lg bg-[var(--lab-accent)] px-2.5 py-1 text-[11.5px] font-medium text-white hover:opacity-90 disabled:opacity-60"
                    >
                      {installState[`${scope}/${selected.name.replace(/[^A-Za-z0-9._-]+/g, "-")}`] === "installing" ? "安装中…" : "安装到" + (scope === "project" ? "项目" : "全局")}
                    </button>
                  </div>
                  <div className="mt-2 space-y-0.5 rounded-lg bg-[var(--lab-hover)]/60 px-2.5 py-1.5 text-[10.5px] leading-relaxed text-[var(--lab-ink-2)]">
                    <div>
                      <span className="text-[var(--lab-ink-3)]">name：</span>
                      {frontmatterField(selectedFm.frontmatter, "name") || "（未设置）"}
                    </div>
                    {preview.assets.length ? (
                      <div className="truncate">
                        <span className="text-[var(--lab-ink-3)]">附带文件：</span>
                        {preview.assets.join("、")}
                      </div>
                    ) : null}
                  </div>
                  {selectedSource ? (
                    <div className="mt-1.5 text-[10px] text-[var(--lab-ink-3)]">
                      来源：<span className="text-[var(--lab-ink-2)]">{selectedSource.repo}</span>
                    </div>
                  ) : null}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                  <MarkdownBody text={selectedFm.body} />
                </div>
              </>
            ) : null}
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--lab-border)] px-5 py-2.5">
          <div className="truncate text-[11px] text-[var(--lab-ink-3)]">
            {status || "内容来自 GitHub 公开仓库，安装前请自行审阅；脚本类技能在调用时才执行。"}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {selected && selectedSource ? (
              <a
                href={selectedSource.homepage}
                onClick={(e) => {
                  e.preventDefault();
                  window.open(selectedSource.homepage, "_blank");
                }}
                className="rounded-lg border border-[var(--lab-border)] px-2.5 py-1 text-[11.5px] text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
              >
                查看来源仓库
              </a>
            ) : null}
            <button
              type="button"
              className="rounded-lg border border-[var(--lab-border)] px-3 py-1 text-[11.5px] text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
              onClick={onClose}
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
