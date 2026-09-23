/** Shared protocol between Lab Supervisor and Coding windows */

export type AgentRole = 'supervisor' | 'coding';

/** Protocol spoken by the provider endpoint used by Lab Coding. */
export type ApiProtocol = 'anthropic-messages' | 'openai-chat';

/** Normalized provider failure categories used by the desktop UI. */
export type ApiErrorKind =
  | 'auth'
  | 'forbidden'
  | 'invalid-request'
  | 'not-found'
  | 'rate-limit'
  | 'server'
  | 'timeout'
  | 'network'
  | 'unknown';

/** Remove credentials and credential-shaped values before crossing into UI/logs. */
export function redactSensitiveText(value: string): string {
  let text = String(value || '');
  text = text.replace(
    /(["']?(?:api[\s_-]?key|x-api-key|authorization|token)["']?\s*[:=]\s*["']?)[^"'\s,}]+/gi,
    '$1[已隐藏]',
  );
  text = text.replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [已隐藏]');
  text = text.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, 'sk-••••');
  return text.slice(0, 1200);
}

export type LoopStatus = 'idle' | 'thinking' | 'streaming' | 'tool' | 'waiting' | 'error';

/** Usage attached to one API response, or accumulated across one Agent task. */
export interface TokenUsageSnapshot {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  /** OpenAI prompt_tokens already includes cached tokens; Anthropic input_tokens does not. */
  inputIncludesCache?: boolean;
  usageFormat?: 'anthropic' | 'openai';
}

/** Running totals for one Desktop section (Experiment) */
export interface SectionTokenTotals {
  inputTokens: number;
  /** Canonical prompt total after respecting whether inputTokens already includes cache. */
  totalInputTokens?: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  turns: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  ts: number;
  /** Archived tool traces for this assistant turn (history UI) */
  tools?: AgentToolTrace[];
  /** Archived model thinking / reasoning for this turn */
  thinking?: string;
  /** Ordered work segments: thinking/tools followed by the related reply text. */
  timeline?: AgentWorkSegment[];
  /** Stopped mid-turn — UI can offer edit & resend on the prior user message */
  interrupted?: boolean;
  /** Provider/engine failure — render with an error treatment instead of a normal reply. */
  error?: boolean;
  /** Lab Code JSONL message.uuid — used with --resume-session-at on edit/withdraw */
  engineUuid?: string;
  /** Cumulative token processing across the Agent task's internal API requests. */
  usage?: TokenUsageSnapshot;
  /** Largest single-request input context observed during this Agent task. */
  peakContextUsage?: TokenUsageSnapshot;
  /** Number of unique model responses included when measuring the task's peak context. */
  contextRequestCount?: number;
}

export type AgentWorkSegmentPhase = 'thinking' | 'tools' | 'reply' | 'waiting' | 'done' | 'error';

/**
 * A chronological slice of one agent turn. The renderer uses this to keep
 * reasoning, tool calls, and the reply that follows them together in the
 * transcript instead of rendering one global tools block at the top.
 */
export interface AgentWorkSegment {
  id: string;
  phase: AgentWorkSegmentPhase;
  thinking?: string;
  tools?: AgentToolTrace[];
  content?: string;
  ts: number;
}

/** Coding transcript entry mirrored TO supervisor (read-only) */
export interface CodingMirrorEvent {
  id: string;
  kind: 'message' | 'tool' | 'diff' | 'status' | 'report';
  summary: string;
  detail?: string;
  ts: number;
}

/** Explicit command channel: Supervisor → Coding (never dumps chat history) */
export interface SupervisorCommand {
  id: string;
  type: 'prd' | 'instruction' | 'reject' | 'accept' | 'cancel';
  payload: string;
  ts: number;
}

export interface DecisionRecord {
  id: string;
  title: string;
  rationale: string;
  ts: number;
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LinkPorts {
  supervisor: WindowBounds;
  coding: WindowBounds;
  display: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export const IPC = {
  GET_ROLE: 'lab:get-role',
  BOUNDS_CHANGED: 'lab:bounds-changed',
  REQUEST_LINK_UPDATE: 'lab:request-link-update',
  LINK_UPDATE: 'lab:link-update',
  /** Coding → Supervisor unidirectional mirror */
  MIRROR_EVENT: 'lab:mirror-event',
  MIRROR_SNAPSHOT: 'lab:mirror-snapshot',
  /** Supervisor → Coding explicit commands only */
  SUPERVISOR_COMMAND: 'lab:supervisor-command',
  LOOP_STATUS: 'lab:loop-status',
  CHAT_SEND: 'lab:chat-send',
  CHAT_STREAM: 'lab:chat-stream',
  SET_API_KEY: 'lab:set-api-key',
  GET_SETTINGS: 'lab:get-settings',
  /** Real terminal (PTY) channel */
  PTY_SPAWN: 'lab:pty-spawn',
  PTY_WRITE: 'lab:pty-write',
  PTY_RESIZE: 'lab:pty-resize',
  PTY_KILL: 'lab:pty-kill',
  PTY_DATA: 'lab:pty-data',
  PTY_EXIT: 'lab:pty-exit',
  /** Workspace folder picker */
  PICK_FOLDER: 'lab:pick-folder',
  /** Set active workspace path (without dialog) */
  SET_WORKSPACE: 'lab:set-workspace',
  /** Multi-file picker (attachments / @file) */
  PICK_FILES: 'lab:pick-files',
  /** File tree */
  LIST_FILES: 'lab:list-files',
  READ_FILE: 'lab:read-file',
  /** Fetch provider model list with user API credentials */
  LIST_MODELS: 'lab:list-models',
  /** Normal-mode Lab Coding engine bridge (stream-json, not PTY) */
  AGENT_PROMPT: 'lab:agent-prompt',
  AGENT_CANCEL: 'lab:agent-cancel',
  AGENT_EVENT: 'lab:agent-event',
  /** Respond to a can_use_tool permission prompt from Lab Coding */
  AGENT_PERMISSION: 'lab:agent-permission',
  /** Report local API credential presence and non-secret runtime defaults. */
  GET_LAB_ENV: 'lab:get-lab-env',
  /** Skills management (project + global skill directories) */
  SKILLS_LIST: 'lab:skills-list',
  SKILLS_READ: 'lab:skills-read',
  SKILLS_WRITE: 'lab:skills-write',
  SKILLS_DELETE: 'lab:skills-delete',
  SKILLS_REVEAL: 'lab:skills-reveal',
  /** Skills community marketplace (GitHub-hosted skill repos) */
  SKILLS_MARKET_LIST: 'lab:skills-market-list',
  SKILLS_MARKET_DESCRIBE: 'lab:skills-market-describe',
  SKILLS_MARKET_PREVIEW: 'lab:skills-market-preview',
  SKILLS_MARKET_INSTALL: 'lab:skills-market-install',
  /** Custom agents management (project + global agent directories) */
  AGENTS_LIST: 'lab:agents-list',
  AGENTS_READ: 'lab:agents-read',
  AGENTS_WRITE: 'lab:agents-write',
  AGENTS_DELETE: 'lab:agents-delete',
  AGENTS_REVEAL: 'lab:agents-reveal',
} as const;

export type SkillScope = 'project' | 'global';

export interface SkillInfo {
  scope: SkillScope;
  /** Directory name — also the skill invocation name */
  name: string;
  /** Parsed from SKILL.md frontmatter ('' when missing) */
  description: string;
  dirPath: string;
  /** Absolute path to SKILL.md (display / reveal only) */
  filePath: string;
  /** Directory contains files besides SKILL.md */
  hasScripts: boolean;
  mtimeMs: number;
}

export interface SkillsListResult {
  ok: boolean;
  skills: SkillInfo[];
  error?: string;
}

export interface SkillReadRequest {
  scope: SkillScope;
  name: string;
}

export interface SkillReadResult {
  ok: boolean;
  content?: string;
  filePath?: string;
  error?: string;
}

export interface SkillWriteRequest {
  scope: SkillScope;
  name: string;
  content: string;
}

export interface SkillWriteResult {
  ok: boolean;
  filePath?: string;
  error?: string;
}

export interface SkillDeleteRequest {
  scope: SkillScope;
  name: string;
}

export interface SkillRevealRequest {
  scope: SkillScope;
  name: string;
}

export type AgentScope = 'project' | 'global';

export interface AgentInfo {
  scope: AgentScope;
  /** File name stem (without .md) */
  name: string;
  /** Frontmatter `name` — the agentType used for delegation ('' when missing/invalid) */
  agentType: string;
  /** Frontmatter `description` — drives when the engine delegates ('' when missing) */
  description: string;
  /** Frontmatter `model` ('' when unset → inherit) */
  model: string;
  /** Frontmatter `tools` list (empty → all tools) */
  tools: string[];
  filePath: string;
  mtimeMs: number;
}

export interface AgentsListResult {
  ok: boolean;
  agents: AgentInfo[];
  error?: string;
}

export interface AgentReadRequest {
  scope: AgentScope;
  name: string;
}

export interface AgentReadResult {
  ok: boolean;
  content?: string;
  filePath?: string;
  error?: string;
}

export interface AgentWriteRequest {
  scope: AgentScope;
  name: string;
  content: string;
}

export interface AgentWriteResult {
  ok: boolean;
  filePath?: string;
  error?: string;
}

export interface AgentDeleteRequest {
  scope: AgentScope;
  name: string;
}

export interface AgentRevealRequest {
  scope: AgentScope;
  name: string;
}

export interface ListModelsRequest {
  baseUrl: string;
  apiKey: string;
  protocol?: ApiProtocol;
}

export interface ListModelsResult {
  ok: boolean;
  models?: { id: string; owned_by?: string }[];
  error?: string;
  errorKind?: ApiErrorKind;
  status?: number;
  endpoint?: string;
}

export interface AgentPromptRequest {
  sessionKey: string;
  cwd: string;
  prompt: string;
  /** Lab Code JSONL session UUID — resume after Desktop restart */
  sessionId?: string;
  /**
   * Truncate engine transcript in-place: --resume-session-at <message.uuid>
   * (keep messages up to and including this uuid, then append prompt).
   */
  resumeSessionAt?: string;
  /**
   * When engineUuid is missing on UI messages, bridge looks up the last user
   * turn with this exact content in the JSONL and resumes at its parentUuid.
   */
  cutBeforeUserText?: string;
  model?: string;
  permissionMode?: string;
  apiKey?: string;
  baseUrl?: string;
  /** The endpoint protocol. Lab Coding currently executes Anthropic Messages. */
  protocol?: ApiProtocol;
}

export interface AskUserQuestionOption {
  label: string;
  description?: string;
}

export interface AskUserQuestionItem {
  question: string;
  header?: string;
  options: AskUserQuestionOption[];
  multiSelect?: boolean;
}

export type AgentBridgeEvent =
  | { kind: 'status'; text: string }
  | { kind: 'assistant_text'; text: string; partial?: boolean }
  | {
      kind: 'heartbeat'
      phase: 'thinking' | 'tool' | 'streaming' | 'waiting'
      toolName?: string
      toolUseId?: string
      elapsedMs?: number
      detail?: string
      ts: number
    }
  | {
      kind: 'tool';
      id: string;
      name: string;
      summary: string;
      state: 'running' | 'done' | 'error';
      file?: string;
      add?: number;
      del?: number;
      detailLines?: { text: string; tone?: 'add' | 'del' | 'ctx' }[];
    }
  | {
      kind: 'subagent';
      /** Engine task id (stable across started/progress/notification). */
      id: string;
      /** Agent tool_use id — links the task back to the Agent tool call. */
      toolUseId?: string;
      description: string;
      taskType?: string;
      status: 'running' | 'completed' | 'failed' | 'stopped';
      /** Most recent tool the sub-agent ran (task_progress). */
      lastToolName?: string;
      summary?: string;
      toolUses?: number;
      totalTokens?: number;
      durationMs?: number;
    }
  | {
      kind: 'permission';
      requestId: string;
      toolName: string;
      toolUseId?: string;
      description: string;
      inputPreview: string;
      file?: string;
      questions?: AskUserQuestionItem[];
    }
  | { kind: 'thinking_text'; text: string; partial?: boolean }
  | {
      kind: 'result';
      text: string;
      sessionId?: string;
      isError?: boolean;
      /** Latest assistant message.uuid from this turn (for edit/rewind) */
      messageUuid?: string;
      /** Aggregated token processing across internal API requests for this Agent task. */
      usage?: TokenUsageSnapshot;
      /** Largest single-request input context observed during this task. */
      peakContextUsage?: TokenUsageSnapshot;
      contextRequestCount?: number;
    }
  | {
      kind: 'compact';
      trigger?: string;
      preTokens?: number;
      text?: string;
    }
  | { kind: 'error'; text: string };

export interface AgentPermissionDecision {
  sessionKey: string;
  requestId: string;
  allow: boolean;
  /** Optional message when denying */
  message?: string;
  /** Merged into tool input on allow (e.g. AskUserQuestion answers) */
  updatedInput?: Record<string, unknown>;
  /** Persist session permission mode immediately (acceptEdits / bypassPermissions) */
  setMode?: string;
}

/** Live tool trace row for Beautiful UI Thinking / ToolChips */
export interface AgentToolTrace {
  id: string;
  name: string;
  summary: string;
  state: 'running' | 'done' | 'error';
  file?: string;
  add?: number;
  del?: number;
  detailLines?: { text: string; tone?: 'add' | 'del' | 'ctx' }[];
  ts: number;
}

/** Live status of one sub-agent (Claude Code "Agent"/"Task" tool) run. */
export interface SubagentTrace {
  /** Engine task id. */
  id: string;
  /** Agent tool_use id (links back to the Agent tool call), when known. */
  toolUseId?: string;
  description: string;
  taskType?: string;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  lastToolName?: string;
  summary?: string;
  toolUses?: number;
  totalTokens?: number;
  durationMs?: number;
  /** Local receive time — drives the live elapsed ticker while running. */
  ts: number;
}

export interface AgentPermissionPrompt {
  requestId: string;
  toolName: string;
  toolUseId?: string;
  description: string;
  inputPreview: string;
  file?: string;
  /** Present when tool is AskUserQuestion — show option UI instead of allow/deny */
  questions?: AskUserQuestionItem[];
}

export type PtyId = 'lab' | 'coding';

export interface PtySpawnResult {
  ok: boolean;
  error?: string;
}

export interface AppSettings {
  deepseekApiKey: string;
  model: string;
  workspacePath: string;
  /** OpenAI-compatible base for /models (derived from lab-agent.env) */
  apiBaseUrl?: string;
}

/** A GitHub-hosted skill repository exposed by the desktop marketplace. */
export interface MarketSourceInfo {
  id: string;
  label: string;
  /** `owner/repo` */
  repo: string;
  branch: string;
  /** Repo-relative directory that holds `xxx/SKILL.md` entries ('' = repo root). */
  skillsPath: string;
  description: string;
  homepage: string;
  /** true when a skill dir may contain auxiliary files (scripts, reference.md…) */
  supportsAssets: boolean;
}

/** One downloadable skill inside a marketplace source. */
export interface MarketSkillInfo {
  /** Stable identity: `<sourceId>/<relativeDir>` */
  id: string;
  sourceId: string;
  /** Directory name — used as the install name after sanitizing. */
  name: string;
  /** Path relative to the repo root, POSIX separated (e.g. `skills/pdf`). */
  path: string;
  /** Frontmatter name (may differ from the directory name). */
  declaredName?: string;
  description: string;
  /** Auxiliary entries inside the skill dir besides SKILL.md */
  assetCount: number;
  bytes: number;
}

export interface MarketListResult {
  ok: boolean;
  sources: MarketSourceInfo[];
  skills: MarketSkillInfo[];
  /** Per-source error text when listing that source failed. */
  errors: Record<string, string>;
}

export interface MarketPreviewRequest {
  id: string;
}

export interface MarketPreviewResult {
  ok: boolean;
  content?: string;
  /** Relative paths of the auxiliary files bundled with this skill. */
  assets?: string[];
  error?: string;
}

export interface MarketInstallRequest {
  id: string;
  scope: SkillScope;
  /** Override the install directory name (defaults to the sanitized dir name). */
  name?: string;
  /** Overwrite when a skill with the same name already exists. */
  overwrite?: boolean;
}

export interface MarketInstallResult {
  ok: boolean;
  /** Installed skill name — surfaced for toasts and post-install selection. */
  name?: string;
  files?: string[];
  /** true when an existing skill was replaced via overwrite. */
  replaced?: boolean;
  error?: string;
  /** Set when install refused because the name already exists. */
  conflict?: boolean;
}
