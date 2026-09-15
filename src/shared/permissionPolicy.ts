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

/**
 * Under acceptEdits: auto-allow workspace read/write tools.
 * Under bypassPermissions: auto-allow everything except AskUserQuestion.
 */
export function shouldAutoAllowTool(
  mode: string | undefined,
  toolName: string,
  file: string | undefined,
  cwd: string | undefined,
): boolean {
  if (isAskUserQuestionTool(toolName)) return false;
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
