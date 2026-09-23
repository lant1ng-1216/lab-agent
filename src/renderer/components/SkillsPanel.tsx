import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SkillInfo, SkillScope, SkillsListResult } from "../../shared/protocol";
import MarkdownBody from "./MarkdownBody";

const BLANK_TEMPLATE = (name: string) =>
  `---
name: ${name}
description: TODO：一句话描述这个技能的用途和触发时机
---

（在此编写技能指令）
`;

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

type Selection = { scope: SkillScope; name: string } | null;

/** Extract a fenced code block that looks like a SKILL.md (frontmatter with name:). */
export function extractSkillDraft(text: string): string | null {
  const re = /```(?:markdown|md|yaml|yml)?\s*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  let best: string | null = null;
  while ((m = re.exec(text))) {
    const block = (m[1] ?? "").trim();
    if (/^---\r?\n[\s\S]*?\r?\n---/.test(block) && /^name:\s*\S+/m.test(block)) {
      best = block;
    }
  }
  return best;
}

function draftSkillName(content: string): string {
  const m = content.match(/^---\r?\n[\s\S]*?\r?\n---/);
  const fm = m?.[0] ?? "";
  const name = fm.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? "";
  return NAME_PATTERN.test(name) ? name : "";
}

function splitFrontmatter(content: string): { frontmatter: string; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { frontmatter: "", body: content };
  return { frontmatter: match[1], body: content.slice(match[0].length) };
}

function frontmatterField(frontmatter: string, field: string): string {
  const match = frontmatter.match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim() ?? "";
}

export default function SkillsPanel({
  open,
  workspacePath,
  hasSession,
  onClose,
  onDistill,
  onOpenMarket,
  draft,
  onDiscardDraft,
}: {
  open: boolean;
  workspacePath: string;
  hasSession?: boolean;
  onClose: () => void;
  onDistill?: (source: "session" | "workspace") => void;
  /** Opens the skills market (kept as a separate dialog). */
  onOpenMarket?: () => void;
  /** Engine-produced SKILL.md draft awaiting developer confirmation. */
  draft?: string | null;
  onDiscardDraft?: () => void;
}) {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [listError, setListError] = useState("");
  const [selected, setSelected] = useState<Selection>(null);
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [viewMode, setViewMode] = useState<"view" | "edit">("view");
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState<SkillScope | null>(null);
  const [newName, setNewName] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftScope, setDraftScope] = useState<SkillScope>("project");
  const [draftName, setDraftName] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Sync incoming engine draft into the editable draft state.
  useEffect(() => {
    if (draft) {
      setDraftContent(draft);
      setDraftName(draftSkillName(draft));
      setDraftScope(workspacePath ? "project" : "global");
      setSelected(null);
      setViewMode("view");
    }
  }, [draft, workspacePath]);

  const dirty = content !== savedContent;
  const projectSkills = useMemo(() => skills.filter((s) => s.scope === "project"), [skills]);
  const globalSkills = useMemo(() => skills.filter((s) => s.scope === "global"), [skills]);
  const selectedInfo = useMemo(
    () => skills.find((s) => selected && s.scope === selected.scope && s.name === selected.name) ?? null,
    [skills, selected],
  );

  const refresh = useCallback(async () => {
    const res: SkillsListResult = await window.lab.skillsList();
    if (res.ok) {
      setSkills(res.skills);
      setListError("");
    } else {
      setListError(res.error || "技能列表加载失败");
    }
    return res;
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const loadSkill = useCallback(async (scope: SkillScope, name: string) => {
    const res = await window.lab.skillsRead({ scope, name });
    if (res.ok) {
      setContent(res.content ?? "");
      setSavedContent(res.content ?? "");
      setViewMode("view");
      setStatus("");
    } else {
      setStatus(res.error || "读取失败");
    }
  }, []);

  const selectSkill = useCallback(
    (info: SkillInfo) => {
      if (dirty && !window.confirm("当前技能有未保存的修改，放弃并切换？")) return;
      setSelected({ scope: info.scope, name: info.name });
      void loadSkill(info.scope, info.name);
    },
    [dirty, loadSkill],
  );

  const requestClose = useCallback(() => {
    if (dirty && !window.confirm("当前技能有未保存的修改，确定关闭？")) return;
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

  const startCreate = (scope: SkillScope) => {
    setCreating(scope);
    setNewName("");
  };

  const confirmCreate = async () => {
    const scope = creating;
    if (!scope) return;
    const name = newName.trim();
    if (!name) return;
    if (!NAME_PATTERN.test(name)) {
      setStatus("技能名只能包含字母、数字、点、下划线、连字符，且以字母或数字开头");
      return;
    }
    const res = await window.lab.skillsWrite({ scope, name, content: BLANK_TEMPLATE(name) });
    if (!res.ok) {
      setStatus(res.error || "创建失败");
      return;
    }
    setCreating(null);
    setNewName("");
    await refresh();
    setSelected({ scope, name });
    await loadSkill(scope, name);
    setViewMode("edit");
    setStatus("");
  };

  const saveSkill = async () => {
    if (!selected) return;
    const res = await window.lab.skillsWrite({
      scope: selected.scope,
      name: selected.name,
      content,
    });
    if (res.ok) {
      setSavedContent(content);
      setStatus("已保存（引擎热检测，即刻生效）");
      await refresh();
    } else {
      setStatus(res.error || "保存失败");
    }
  };

  const deleteSkill = async () => {
    if (!selected) return;
    if (!window.confirm(`删除技能「${selected.name}」及其目录？此操作不可恢复。`)) return;
    const res = await window.lab.skillsDelete({ scope: selected.scope, name: selected.name });
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

  const revealSkill = async () => {
    if (!selected) return;
    await window.lab.skillsReveal({ scope: selected.scope, name: selected.name });
  };

  const confirmSaveDraft = async () => {
    const name = draftName.trim();
    if (!name) {
      setStatus("请填写技能名（字母、数字、点、下划线、连字符）");
      return;
    }
    if (!NAME_PATTERN.test(name)) {
      setStatus("技能名只能包含字母、数字、点、下划线、连字符，且以字母或数字开头");
      return;
    }
    const res = await window.lab.skillsWrite({ scope: draftScope, name, content: draftContent });
    if (res.ok) {
      setStatus("草稿已确认为技能（引擎热检测，即刻生效）");
      await refresh();
      setSelected({ scope: draftScope, name });
      await loadSkill(draftScope, name);
      onDiscardDraft?.();
    } else {
      setStatus(res.error || "保存失败");
    }
  };

  const discardDraft = () => {
    if (!window.confirm("丢弃当前技能草稿？")) return;
    onDiscardDraft?.();
    setDraftContent("");
    setDraftName("");
    setStatus("");
  };

  if (!open) return null;

  const { frontmatter, body } = splitFrontmatter(content);
  const fmName = frontmatterField(frontmatter, "name");
  const fmDescription = frontmatterField(frontmatter, "description");

  const renderGroup = (title: string, scope: SkillScope, items: SkillInfo[], emptyHint: string, disabled: boolean) => (
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
            placeholder="技能名（如 review-checklist）"
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
          {items.map((s) => {
            const active = selected?.scope === s.scope && selected?.name === s.name;
            return (
              <button
                key={`${s.scope}/${s.name}`}
                type="button"
                onClick={() => selectSkill(s)}
                className={
                  "w-full rounded-lg px-2.5 py-1.5 text-left transition-colors " +
                  (active ? "bg-[var(--lab-hover)]" : "hover:bg-[var(--lab-hover)]/60")
                }
              >
                <div className={"truncate text-[12.5px] " + (active ? "font-medium text-[var(--lab-ink)]" : "text-[var(--lab-ink-2)]")}>{s.name}</div>
                <div className="truncate text-[10.5px] text-[var(--lab-ink-3)]">{s.description || "（无描述）"}</div>
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
        {/* Left: skill list */}
        <div className="w-[250px] shrink-0 overflow-y-auto border-r border-[var(--lab-border)] p-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[14px] font-semibold text-[var(--lab-ink)]">技能</div>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-[12px] text-[var(--lab-ink-3)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
              onClick={requestClose}
            >
              ×
            </button>
          </div>
          {onDistill ? (
            <div className="mb-3 space-y-1">
              <div className="px-1 text-[10px] font-semibold tracking-[0.08em] text-[var(--lab-ink-3)]">蒸馏 · 整理为技能</div>
              <button
                type="button"
                disabled={!hasSession}
                className="w-full rounded-lg border border-[var(--lab-border)] px-2.5 py-1.5 text-left text-[11.5px] text-[var(--lab-ink-2)] transition-colors hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)] disabled:cursor-not-allowed disabled:text-[var(--lab-ink-3)] disabled:hover:bg-transparent"
                onClick={() => onDistill("session")}
                title={hasSession ? "把当前会话中可复用的流程整理成技能草稿" : "当前会话还没有对话"}
              >
                从当前会话生成
              </button>
              <button
                type="button"
                disabled={!workspacePath}
                className="w-full rounded-lg border border-[var(--lab-border)] px-2.5 py-1.5 text-left text-[11.5px] text-[var(--lab-ink-2)] transition-colors hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)] disabled:cursor-not-allowed disabled:text-[var(--lab-ink-3)] disabled:hover:bg-transparent"
                onClick={() => onDistill("workspace")}
                title={workspacePath ? "浏览当前工作区，提炼最值得固化的流程/约定" : "未设置工作区"}
              >
                从工作区生成
              </button>
              <div className="px-1 text-[10px] leading-relaxed text-[var(--lab-ink-3)]">
                由引擎分析并产出草稿，需你确认后才会保存；引擎不会自行创建技能。
              </div>
            </div>
          ) : null}
          {renderGroup(
            "项目技能 · .claude/skills",
            "project",
            projectSkills,
            workspacePath ? "暂无项目技能" : "未设置工作区，无法管理项目技能",
            !workspacePath,
          )}
          {renderGroup("全局技能 · 随应用", "global", globalSkills, "暂无全局技能", false)}
          {onOpenMarket ? (
            <button
              type="button"
              onClick={() => {
                if (dirty && !window.confirm("当前技能有未保存的修改，放弃并前往市场？")) return;
                onOpenMarket();
              }}
              className="mt-3 flex w-full items-center gap-2 rounded-lg border border-[var(--lab-border)] px-2.5 py-1.5 text-left text-[11.5px] text-[var(--lab-ink-2)] transition-colors hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
              title="浏览并安装公开技能仓库里的技能"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 9h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
                <path d="M3 9l2.2-5.3A1 1 0 0 1 6.1 3h11.8a1 1 0 0 1 .9.7L21 9" />
                <path d="M9 13h6" />
              </svg>
              技能市场
            </button>
          ) : null}
          {listError ? <div className="px-1 text-[10.5px] text-[var(--lab-red)]">{listError}</div> : null}
        </div>

        {/* Right: view / edit */}
        <div className="flex min-w-0 flex-1 flex-col">
          {draft ? (
            <>
              <div className="flex items-center justify-between gap-2 border-b border-[var(--lab-border)] px-4 py-2.5">
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold text-[var(--lab-ink)]">技能草稿 · 待确认</div>
                  <div className="text-[10.5px] text-[var(--lab-ink-3)]">引擎产出，未经你确认不会写入任何文件</div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className="rounded-md px-2 py-1 text-[11.5px] text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
                    onClick={() => setDraftScope(draftScope === "project" ? "global" : "project")}
                    disabled={draftScope === "project" && !workspacePath}
                    title={draftScope === "project" ? "当前：项目级（.claude/skills）· 点击切换为全局" : "当前：全局 · 点击切换为项目级"}
                  >
                    {draftScope === "project" ? "项目级" : "全局"}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 border-b border-[var(--lab-border)] px-4 py-2">
                <span className="shrink-0 text-[11.5px] text-[var(--lab-ink-3)]">技能名</span>
                <input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="如 review-checklist"
                  className="min-w-0 flex-1 rounded-md border border-[var(--lab-border)] bg-transparent px-2 py-1 text-[12px] text-[var(--lab-ink)] outline-none placeholder:text-[var(--lab-ink-3)] focus:border-[var(--lab-accent)]"
                />
              </div>
              <textarea
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                spellCheck={false}
                className="min-h-0 flex-1 resize-none bg-transparent px-4 py-3 font-mono text-[12.5px] leading-relaxed text-[var(--lab-ink)] outline-none"
              />
              <div className="flex items-center justify-between border-t border-[var(--lab-border)] px-4 py-2.5">
                <div className="truncate text-[11px] text-[var(--lab-ink-3)]">{status || "确认后将以 SKILL.md 落盘并即刻生效"}</div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--lab-border)] px-3 py-1.5 text-[12px] text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
                    onClick={discardDraft}
                  >
                    丢弃
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-[var(--lab-accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
                    onClick={() => void confirmSaveDraft()}
                  >
                    确认保存为技能
                  </button>
                </div>
              </div>
            </>
          ) : selected && selectedInfo ? (
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
                  <button type="button" className="rounded-md px-2 py-1 text-[11.5px] text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]" onClick={() => void revealSkill()}>
                    在文件夹中打开
                  </button>
                  <button type="button" className="rounded-md px-2 py-1 text-[11.5px] text-[var(--lab-red)] hover:bg-[var(--lab-hover)]" onClick={() => void deleteSkill()}>
                    删除
                  </button>
                </div>
              </div>

              {viewMode === "view" ? (
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                  <div className="mb-3 rounded-lg bg-[var(--lab-hover)]/60 px-3 py-2 text-[11.5px] leading-relaxed text-[var(--lab-ink-2)]">
                    <div>
                      <span className="text-[var(--lab-ink-3)]">name：</span>
                      {fmName || "（未设置）"}
                    </div>
                    <div>
                      <span className="text-[var(--lab-ink-3)]">description：</span>
                      {fmDescription || "（未设置——引擎技能列表将缺少描述）"}
                    </div>
                    {selectedInfo.hasScripts ? (
                      <div className="mt-1 text-[10.5px] text-[var(--lab-ink-3)]">该目录还包含辅助脚本/资源文件</div>
                    ) : null}
                  </div>
                  <MarkdownBody text={body} />
                </div>
              ) : (
                <>
                  <div className="border-b border-[var(--lab-border)] px-4 py-1.5 text-[10.5px] text-[var(--lab-ink-3)]">
                    YAML frontmatter 需包含 <code className="text-[var(--lab-accent)]">name</code> 与{" "}
                    <code className="text-[var(--lab-accent)]">description</code> 字段；正文为技能指令（Markdown）。保存后引擎热检测即刻生效。
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
                    onClick={() => void saveSkill()}
                  >
                    保存
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center px-6 text-center text-[12.5px] leading-relaxed text-[var(--lab-ink-3)]">
              <div>
                <p>从左侧选择一个技能查看或编辑。</p>
                <p className="mt-1">
                  技能是带 frontmatter 的 SKILL.md 文件，引擎自动发现：输入 <code>/技能名</code> 触发，或由模型按需调用。
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
