/** Which tools can auto-run under acceptEdits without a modal. */
const SAFE_EDIT_TOOLS =
  /^(write|edit|strreplace|multiedit|notebookedit|create|read|view|glob|grep|search|ls|list|todowrite|todoread|taskcreate|taskupdate)/i;

const ALWAYS_ASK_TOOLS = /^(bash|shell|powershell|npm|pip|curl|wget|fetch|webbrowser|browser|kill|rm|delete|agent)/i;

export function isAskUserQuestionTool(name: string): boolean {
  return /askuserquestion/i.test(name.replace(/\s+/g, ""));
}

/** High-risk / outside trust — always prompt (except AskUserQuestion which has its own UI). */
export function isHighRiskTool(name: string): boolean {
  if (isAskUserQuestionTool(name)) return false;
  return ALWAYS_ASK_TOOLS.test(name.replace(/Tool$/i, ""));
}

export function isWorkspaceEditTool(name: string): boolean {
  const n = name.replace(/Tool$/i, "");
  if (isHighRiskTool(n)) return false;
  return SAFE_EDIT_TOOLS.test(n);
}

/** Skill files are never auto-allowed: saving a skill always needs user confirmation. */
export function isSkillWriteTarget(file: string | undefined): boolean {
  if (!file) return false;
  const norm = file.replace(/\\/g, "/").toLowerCase();
  const base = norm.split("/").pop() ?? "";
  if (base === "skill.md") return true;
  const idx = norm.lastIndexOf("/skills/");
  return idx >= 0 && norm.slice(idx + "/skills/".length).length > 0;
}

/**
 * Under acceptEdits: auto-allow workspace read/write tools.
 * Under bypassPermissions: auto-allow everything except AskUserQuestion.
 * Skill-file writes are always excluded from auto-allow (distillation gate).
 */
export function shouldAutoAllowTool(
  mode: string | undefined,
  toolName: string,
  file: string | undefined,
  cwd: string | undefined,
): boolean {
  if (isAskUserQuestionTool(toolName)) return false;
  if (isWorkspaceEditTool(toolName) && isSkillWriteTarget(file)) return false;
  const m = mode || "default";
  if (m === "bypassPermissions") return true;
  if (m !== "acceptEdits") return false;
  if (!isWorkspaceEditTool(toolName)) return false;
  if (file && cwd) {
    const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
    const f = norm(file);
    const root = norm(cwd);
    // Relative paths and paths under cwd are ok; absolute outside cwd → ask
    if (f.startsWith("/") || /^[a-zA-Z]:/.test(f)) {
      if (!f.startsWith(root + "/") && f !== root) return false;
    }
  }
  return true;
}
