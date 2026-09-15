/** Shared protocol between Lab Supervisor and Coding windows */

export type AgentRole = 'supervisor' | 'coding';

export type LoopStatus = 'idle' | 'thinking' | 'streaming' | 'tool' | 'waiting' | 'error';

/** One API turn's token usage (from stream-json result.usage) */
export interface TokenUsageSnapshot {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

/** Running totals for one Desktop section (Experiment) */
export interface SectionTokenTotals {
  inputTokens: number;
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
  /** Stopped mid-turn — UI can offer edit & resend on the prior user message */
  interrupted?: boolean;
  /** Lab Code JSONL message.uuid — used with --resume-session-at on edit/withdraw */
  engineUuid?: string;
  /** This turn's token usage (assistant only) */
  usage?: TokenUsageSnapshot;
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
  /** Bootstrap shell API from agents/lab-coding/lab-agent.env */
  GET_LAB_ENV: 'lab:get-lab-env',
  /** First-run: install location + Desktop shortcut */
  GET_INSTALL_STATUS: 'lab:get-install-status',
  INSTALL_TO_STABLE: 'lab:install-to-stable',
  ENSURE_DESKTOP_SHORTCUT: 'lab:ensure-desktop-shortcut',
} as const;

export type InstallStatusPayload = {
  packaged: boolean;
  platform: string;
  needsInstall: boolean;
  needsDesktopShortcut: boolean;
  currentAppPath: string;
  targetAppPath: string;
  desktopShortcutPath: string;
  hint: string;
};

export interface ListModelsRequest {
  baseUrl: string;
  apiKey: string;
}

export interface ListModelsResult {
  ok: boolean;
  models?: { id: string; owned_by?: string }[];
  error?: string;
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
      kind: 'permission';
      requestId: string;
      toolName: string;
      toolUseId?: string;
      description: string;
      inputPreview: string;
      file?: string;
      /** Epoch ms when this prompt expires (auto-deny) */
      expiresAt?: number;
      timeoutMs?: number;
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
      /** Aggregated usage for this turn */
      usage?: TokenUsageSnapshot;
    }
  | {
      kind: 'compact';
      trigger?: string;
      preTokens?: number;
      text?: string;
    }
  | { kind: 'error'; text: string };

/** Matches Lab Coding bridge permission auto-deny window */
export const AGENT_PERMISSION_TIMEOUT_MS = 90_000;

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

export interface AgentPermissionPrompt {
  requestId: string;
  toolName: string;
  toolUseId?: string;
  description: string;
  inputPreview: string;
  file?: string;
  expiresAt?: number;
  timeoutMs?: number;
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
