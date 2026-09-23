import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentInfo, AgentScope, AgentsListResult } from "../../shared/protocol";
import MarkdownBody from "./MarkdownBody";

const BLANK_TEMPLATE = (name: string) =>
  `---
name: ${name}
description: TODO：描述这个智能体擅长什么、何时把任务委派给它
tools:
model: inherit
---

（在此编写智能体的系统指令）
`;

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

type Selection = { scope: AgentScope; name: string } | null;

function splitFrontmatter(content: string): { frontmatter: string; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { frontmatter: "", body: content };
  return { frontmatter: match[1], body: content.slice(match[0].length) };
}

function frontmatterField(frontmatter: string, field: string): string {
  const match = frontmatter.match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim() ?? "";
}

export default function AgentsPanel({
  open,
  workspacePath,
  onClose,
}: {
  open: boolean;
  workspacePath: string;
  onClose: () => void;
}) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [listError, setListError] = useState("");
  const [selected, setSelected] = useState<Selection>(null);
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [viewMode, setViewMode] = useState<"view" | "edit">("view");
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState<AgentScope | null>(null);
  const [newName, setNewName] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const dirty = content !== savedContent;
  const projectAgents = useMemo(() => agents.filter((a) => a.scope === "project"), [agents]);
  const globalAgents = useMemo(() => agents.filter((a) => a.scope === "global"), [agents]);
  const selectedInfo = useMemo(
    () => agents.find((a) => selected && a.scope === selected.scope && a.name === selected.name) ?? null,
    [agents, selected],
  );

  const refresh = useCallback(async () => {
    const res: AgentsListResult = await window.lab.agentsList();
    if (res.ok) {
      setAgents(res.agents);
      setListError("");
    } else {
      setListError(res.error || "智能体列表加载失败");
    }
    return res;
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const loadAgent = useCallback(async (scope: AgentScope, name: string) => {
    const res = await window.lab.agentsRead({ scope, name });
    if (res.ok) {
      setContent(res.content ?? "");
      setSavedContent(res.content ?? "");
      setViewMode("view");
      setStatus("");
    } else {
      setStatus(res.error || "读取失败");
    }
  }, []);

  const selectAgent = useCallback(
    (info: AgentInfo) => {
      if (dirty && !window.confirm("当前智能体有未保存的修改，放弃并切换？")) return;
      setSelected({ scope: info.scope, name: info.name });
      void loadAgent(info.scope, info.name);
    },
    [dirty, loadAgent],
  );

  const requestClose = useCallback(() => {
    if (dirty && !window.confirm("当前智能体有未保存的修改，确定关闭？")) return;
    onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, requestClose]);

  const startCreate = (scope: AgentScope) => {
    setCreating(scope);
    setNewName("");
  };

  const confirmCreate = async () => {
    const scope = creating;
    if (!scope) return;
    const name = newName.trim();
    if (!name) return;
    if (!NAME_PATTERN.test(name)) {
      setStatus("智能体名只能包含字母、数字、点、下划线、连字符，且以字母或数字开头");
      return;
    }
    const res = await window.lab.agentsWrite({ scope, name, content: BLANK_TEMPLATE(name) });
    if (!res.ok) {
      setStatus(res.error || "创建失败");
      return;
    }
    setCreating(null);
    setNewName("");
    await refresh();
    setSelected({ scope, name });
    await loadAgent(scope, name);
    setViewMode("edit");
    setStatus("");
  };

  const saveAgent = async () => {
    if (!selected) return;
    const fm = splitFrontmatter(content).frontmatter;
    if (!frontmatterField(fm, "name")) {
      setStatus("frontmatter 缺少 name 字段——引擎将无法识别该智能体");
      return;
    }
    if (!frontmatterField(fm, "description")) {
      setStatus("frontmatter 缺少 description 字段——引擎无法判断何时委派");
      return;
    }
    const res = await window.lab.agentsWrite({
      scope: selected.scope,
      name: selected.name,
      content,
    });
    if (res.ok) {
      setSavedContent(content);
      setStatus("已保存（下一条消息起生效）");
      await refresh();
    } else {
      setStatus(res.error || "保存失败");
    }
  };

  const deleteAgent = async () => {
    if (!selected) return;
    if (!window.confirm(`删除智能体「${selected.name}」？此操作不可恢复。`)) return;
    const res = await window.lab.agentsDelete({ scope: selected.scope, name: selected.name });
    if (res.ok) {
      setSelected(null);
      setContent("");
      setSavedContent("");
      setStatus("");
      await refresh();
    } else {
      setStatus(res.error || "删除失败");
    }
  };

  const revealAgent = async () => {
    if (!selected) return;
    await window.lab.agentsReveal({ scope: selected.scope, name: selected.name });
  };

  if (!open) return null;

  const { frontmatter, body } = splitFrontmatter(content);
  const fmName = frontmatterField(frontmatter, "name");
  const fmDescription = frontmatterField(frontmatter, "description");
  const fmModel = frontmatterField(frontmatter, "model");
  const fmTools = frontmatterField(frontmatter, "tools");

  const renderGroup = (title: string, scope: AgentScope, items: AgentInfo[], emptyHint: string, disabled: boolean) => (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <div className="text-[10px] font-semibold tracking-[0.08em] text-[var(--lab-ink-3)]">{title}</div>
        <button
          type="button"
          disabled={disabled}
          className="rounded-md px-1.5 py-0.5 text-[11px] text-[var(--lab-accent)] hover:bg-[var(--lab-hover)] disabled:cursor-not-allowed disabled:text-[var(--lab-ink-3)] disabled:hover:bg-transparent"
          onClick={() => startCreate(scope)}
        >
          + 新建
        </button>
      </div>
      {creating === scope ? (
        <div className="mb-1 flex items-center gap-1 rounded-lg border border-[var(--lab-border)] bg-[var(--lab-surface-solid)] px-2 py-1.5">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void confirmCreate();
              if (e.key === "Escape") setCreating(null);
            }}
            placeholder="智能体名（如 code-reviewer）"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--lab-ink)] outline-none placeholder:text-[var(--lab-ink-3)]"
          />
          <button type="button" className="rounded px-1.5 py-0.5 text-[11px] text-[var(--lab-accent)] hover:bg-[var(--lab-hover)]" onClick={() => void confirmCreate()}>
            创建
          </button>
          <button type="button" className="rounded px-1.5 py-0.5 text-[11px] text-[var(--lab-ink-3)] hover:bg-[var(--lab-hover)]" onClick={() => setCreating(null)}>
            取消
          </button>
        </div>
      ) : null}
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--lab-border)] px-2.5 py-2 text-[11px] text-[var(--lab-ink-3)]">{emptyHint}</div>
      ) : (
        <div className="space-y-0.5">
          {items.map((a) => {
            const active = selected?.scope === a.scope && selected?.name === a.name;
            const invalid = !a.agentType || !a.description;
            return (
              <button
                key={`${a.scope}/${a.name}`}
                type="button"
                onClick={() => selectAgent(a)}
                className={
                  "w-full rounded-lg px-2.5 py-1.5 text-left transition-colors " +
                  (active ? "bg-[var(--lab-hover)]" : "hover:bg-[var(--lab-hover)]/60")
                }
              >
                <div className={"truncate text-[12.5px] " + (active ? "font-medium text-[var(--lab-ink)]" : "text-[var(--lab-ink-2)]")}>
                  {a.name}
                  {invalid ? <span className="ml-1.5 text-[10px] text-[var(--lab-red)]">⚠ 缺字段</span> : null}
                </div>
                <div className="truncate text-[10.5px] text-[var(--lab-ink-3)]">{a.description || "（无描述）"}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="titlebar-no-drag absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={requestClose}>
      <div
        className="flex h-[80vh] w-[860px] max-w-[94vw] overflow-hidden rounded-2xl border border-[var(--lab-border)] bg-[var(--lab-surface-solid)] shadow-[0_24px_64px_rgba(0,0,0,0.45)]"
        data-lab-glass
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: agent list */}
        <div className="w-[250px] shrink-0 overflow-y-auto border-r border-[var(--lab-border)] p-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[14px] font-semibold text-[var(--lab-ink)]">智能体</div>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-[12px] text-[var(--lab-ink-3)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
              onClick={requestClose}
            >
              ×
            </button>
          </div>
          {renderGroup(
            "项目智能体 · .claude/agents",
            "project",
            projectAgents,
            workspacePath ? "暂无项目智能体" : "未设置工作区，无法管理项目智能体",
            !workspacePath,
          )}
          {renderGroup("全局智能体 · 随应用", "global", globalAgents, "暂无全局智能体", false)}
          {listError ? <div className="px-1 text-[10.5px] text-[var(--lab-red)]">{listError}</div> : null}
        </div>

        {/* Right: view / edit */}
        <div className="flex min-w-0 flex-1 flex-col">
          {selected && selectedInfo ? (
            <>
              <div className="flex items-center justify-between gap-2 border-b border-[var(--lab-border)] px-4 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-semibold text-[var(--lab-ink)]">
                    {selectedInfo.name}
                    <span className="ml-2 text-[10.5px] font-normal text-[var(--lab-ink-3)]">
                      {selectedInfo.scope === "project" ? "项目级" : "全局"}
                    </span>
                  </div>
                  <div className="truncate text-[10.5px] text-[var(--lab-ink-3)]" title={selectedInfo.filePath}>
                    {selectedInfo.filePath}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {viewMode === "view" ? (
                    <button
                      type="button"
                      className="rounded-md px-2 py-1 text-[11.5px] text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
                      onClick={() => {
                        setViewMode("edit");
                        setTimeout(() => textareaRef.current?.focus(), 0);
                      }}
                    >
                      编辑
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="rounded-md px-2 py-1 text-[11.5px] text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
                      onClick={() => setViewMode("view")}
                    >
                      预览
                    </button>
                  )}
                  <button type="button" className="rounded-md px-2 py-1 text-[11.5px] text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]" onClick={() => void revealAgent()}>
                    在文件夹中打开
                  </button>
                  <button type="button" className="rounded-md px-2 py-1 text-[11.5px] text-[var(--lab-red)] hover:bg-[var(--lab-hover)]" onClick={() => void deleteAgent()}>
                    删除
                  </button>
                </div>
              </div>

              {viewMode === "view" ? (
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                  <div className="mb-3 rounded-lg bg-[var(--lab-hover)]/60 px-3 py-2 text-[11.5px] leading-relaxed text-[var(--lab-ink-2)]">
                    <div>
                      <span className="text-[var(--lab-ink-3)]">name：</span>
                      {fmName || <span className="text-[var(--lab-red)]">（缺失——引擎无法识别）</span>}
                    </div>
                    <div>
                      <span className="text-[var(--lab-ink-3)]">description：</span>
                      {fmDescription || <span className="text-[var(--lab-red)]">（缺失——引擎无法委派）</span>}
                    </div>
                    <div>
                      <span className="text-[var(--lab-ink-3)]">model：</span>
                      {fmModel || "inherit"}
                    </div>
                    <div>
                      <span className="text-[var(--lab-ink-3)]">tools：</span>
                      {fmTools || "（全部工具）"}
                    </div>
                  </div>
                  <MarkdownBody text={body} />
                </div>
              ) : (
                <>
                  <div className="border-b border-[var(--lab-border)] px-4 py-1.5 text-[10.5px] text-[var(--lab-ink-3)]">
                    frontmatter 需包含 <code className="text-[var(--lab-accent)]">name</code> 与{" "}
                    <code className="text-[var(--lab-accent)]">description</code>；正文为该智能体的系统指令（Markdown）。保存后下一条消息生效。
                  </div>
                  <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    spellCheck={false}
                    className="min-h-0 flex-1 resize-none bg-transparent px-4 py-3 font-mono text-[12.5px] leading-relaxed text-[var(--lab-ink)] outline-none"
                  />
                </>
              )}

              <div className="flex items-center justify-between border-t border-[var(--lab-border)] px-4 py-2.5">
                <div className="truncate text-[11px] text-[var(--lab-ink-3)]">
                  {status || (dirty ? "有未保存的修改" : "")}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={!dirty}
                    className="rounded-lg bg-[var(--lab-accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => void saveAgent()}
                  >
                    保存
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center px-6 text-center text-[12.5px] leading-relaxed text-[var(--lab-ink-3)]">
              <div>
                <p>从左侧选择一个智能体查看或编辑。</p>
                <p className="mt-1">
                  智能体是带 frontmatter 的 .md 文件，引擎自动发现并把任务委派给它们；description 决定何时触发。
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
