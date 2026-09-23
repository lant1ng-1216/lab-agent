import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createInterface, type Interface } from 'node:readline'
import { redactSensitiveText, type ApiProtocol, type TokenUsageSnapshot } from '../shared/protocol'
import {
  contextTokensUsed,
  parseTokenUsageSnapshot,
  peakContextUsage as choosePeakContextUsage,
} from '../shared/modelContext'
import { AGENT_WATCHDOG_LIMITS, getAgentWatchdogStopReason } from '../shared/agentWatchdog'
import { DESKTOP_AGENT_GUIDANCE } from '../shared/desktopAgentGuidance'
import { labAgentMemoryGuardSettings, labAgentRuntimeEnv } from '../shared/labAgentRuntime'
import { DESKTOP_RUNTIME_MARKER, isLikelyToolFailure, sanitizeDesktopDiagnostic } from '../shared/desktopRuntime'
import { isAskUserQuestionTool, shouldAutoAllowTool } from '../shared/permissionPolicy'
import { engineBinaryName, engineRootCandidates, findEngineRoot } from './enginePaths'

export type BridgeEvent =
  | { kind: 'status'; text: string }
  | { kind: 'assistant_text'; text: string; partial?: boolean }
  | { kind: 'thinking_text'; text: string; partial?: boolean }
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
      kind: 'tool'
      id: string
      name: string
      summary: string
      state: 'running' | 'done' | 'error'
      file?: string
      add?: number
      del?: number
      detailLines?: { text: string; tone?: 'add' | 'del' | 'ctx' }[]
    }
  | {
      kind: 'subagent'
      id: string
      toolUseId?: string
      description: string
      taskType?: string
      status: 'running' | 'completed' | 'failed' | 'stopped'
      lastToolName?: string
      summary?: string
      toolUses?: number
      totalTokens?: number
      durationMs?: number
    }
  | {
      kind: 'permission'
      requestId: string
      toolName: string
      toolUseId?: string
      description: string
      inputPreview: string
      file?: string
      questions?: {
        question: string
        header?: string
        options: { label: string; description?: string }[]
        multiSelect?: boolean
      }[]
    }
  | {
      kind: 'result'
      text: string
      sessionId?: string
      isError?: boolean
      messageUuid?: string
      usage?: TokenUsageSnapshot
      peakContextUsage?: TokenUsageSnapshot
      contextRequestCount?: number
    }
  | {
      kind: 'compact'
      trigger?: string
      preTokens?: number
      text?: string
    }
  | { kind: 'error'; text: string }

export type PromptRequest = {
  sessionKey: string
  cwd: string
  prompt: string
  /** Persisted Lab Code session UUID (seed --resume after Desktop restart) */
  sessionId?: string
  /** --resume-session-at <message.uuid> — in-place truncate then append prompt */
  resumeSessionAt?: string
  /** Resolve tip from JSONL: parentUuid of last user message matching this text */
  cutBeforeUserText?: string
  model?: string
  permissionMode?: string
  apiKey?: string
  baseUrl?: string
  protocol?: ApiProtocol
}

function normalizeRuntimeBase(base?: string): string {
  return String(base || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/anthropic$/i, '')
    .replace(/\/v1$/i, '')
    .toLowerCase()
}

function runtimeConfigFingerprint(req: PromptRequest): string {
  const key = req.apiKey
    ? createHash('sha256').update(req.apiKey).digest('hex').slice(0, 16)
    : ''
  return [
    req.protocol || 'anthropic-messages',
    req.model?.trim() || '',
    normalizeRuntimeBase(req.baseUrl),
    key,
    req.permissionMode || 'default',
  ].join('|')
}

function safeEndpoint(value: string | undefined): string {
  if (!value) return '(default)'
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return value.replace(/[?#].*$/, '').slice(0, 180)
  }
}

type SessionState = {
  claudeSessionId?: string
  proc?: ChildProcess
  rl?: Interface
  cwd?: string
  /** Permission mode used when this process was spawned */
  spawnedPermissionMode?: string
  /** Non-secret fingerprint of the runtime config used to spawn this process */
  spawnedConfigFingerprint?: string
  spawnedProtocol?: ApiProtocol
  spawnedModel?: string
  spawnedBaseUrl?: string
  /** True while waiting for the current turn's result */
  turnBusy: boolean
  turnStartedAt: number
  tools: Map<string, Extract<BridgeEvent, { kind: 'tool' }>>
  /** Live sub-agents (Agent/Task tool), keyed by engine task id. */
  subagents: Map<string, Extract<BridgeEvent, { kind: 'subagent' }>>
  toolStartedAt: Map<string, number>
  pendingPermInput: Map<string, Record<string, unknown>>
  lastActivityAt: number
  lastHeartbeatEmittedAt: number
  idleTimer?: ReturnType<typeof setInterval>
  assistantAccum: string
  thinkingAccum: string
  /** Per-response usage, deduplicated by provider message id. */
  apiResponseUsage: Map<string, TokenUsageSnapshot>
  latestRequestUsage?: TokenUsageSnapshot
  peakRequestUsage?: TokenUsageSnapshot
  /** Skip full assistant text when stream_event deltas already streamed */
  turnHadPartials: boolean
  turnHadThinkingPartials: boolean
  /** Last assistant JSONL uuid seen this turn */
  lastAssistantUuid?: string
}

function loadEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {}
  const out: Record<string, string> = {}
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i <= 0) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[k] = v
  }
  return out
}

/** Prefer bundled rg next to the engine, then common Homebrew paths (Electron PATH is often bare). */
function enginePathAugment(root: string, existing?: string): string {
  const sep = path.delimiter
  const prefix: string[] = []
  const bundledBin = path.join(root, 'bin')
  if (fs.existsSync(bundledBin)) prefix.push(bundledBin)
  if (process.platform === 'darwin') {
    for (const p of ['/opt/homebrew/bin', '/usr/local/bin']) {
      if (fs.existsSync(p)) prefix.push(p)
    }
  } else if (process.platform === 'linux') {
    for (const p of ['/usr/local/bin', '/home/linuxbrew/.linuxbrew/bin']) {
      if (fs.existsSync(p)) prefix.push(p)
    }
  }
  const base =
    existing ||
    process.env.PATH ||
    (process.platform === 'win32' ? 'C:\\Windows\\System32' : '/usr/bin:/bin:/usr/sbin:/sbin')
  return prefix.length ? `${prefix.join(sep)}${sep}${base}` : base
}

/**
 * The engine needs Git Bash on Windows, but Electron hands the child a bare
 * PATH and Git is often installed outside the default location. Probe the
 * usual install dirs plus PATH (both `...\Git\cmd` and `...\bin` layouts) and
 * point the engine at the first bash.exe we find. An explicit
 * CLAUDE_CODE_GIT_BASH_PATH from the environment always wins.
 */
function resolveGitBashPath(): string | undefined {
  if (process.platform !== 'win32') return undefined
  const candidates: string[] = []
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
  const localAppData = process.env.LOCALAPPDATA
  candidates.push(
    path.join(programFiles, 'Git', 'bin', 'bash.exe'),
    path.join(programFilesX86, 'Git', 'bin', 'bash.exe'),
    'C:\\Program Files\\Git\\bin\\bash.exe',
  )
  if (localAppData) candidates.push(path.join(localAppData, 'Programs', 'Git', 'bin', 'bash.exe'))
  for (const entry of (process.env.PATH || '').split(path.delimiter)) {
    const dir = entry.replace(/[\\/]+$/, '')
    if (!dir) continue
    // Git's PATH entry varies (`...\Git\cmd`, `...\Git\mingw64\bin`, `...\Git\usr\bin`),
    // but bash always sits in `<gitRoot>\bin`. Walk up a few levels and prefer that.
    let cur = dir
    for (let i = 0; i < 3 && cur; i += 1) {
      candidates.push(path.join(cur, 'bin', 'bash.exe'))
      const parent = path.dirname(cur)
      if (parent === cur) break
      cur = parent
    }
    candidates.push(path.join(dir, 'bash.exe'))
  }
  return candidates.find((candidate) => candidate && fs.existsSync(candidate))
}

function buildEnv(
  root: string,
  configDir: string,
  extra?: Record<string, string>,
): NodeJS.ProcessEnv {
  const fromFile = {
    ...loadEnvFile(path.join(root, 'freecode.env')), // legacy fallback
    ...loadEnvFile(path.join(root, 'lab-agent.env')), // wins
  }
  try {
    fs.mkdirSync(configDir, { recursive: true })
  } catch {
    /* ignore — surfaced when engine fails */
  }
  const merged = labAgentRuntimeEnv({
    ...process.env,
    ...fromFile,
    ...extra,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:
      process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC || fromFile.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC || '1',
  }, configDir) as NodeJS.ProcessEnv
  merged.PATH = enginePathAugment(root, merged.PATH)
  if (process.platform === 'win32' && !merged.CLAUDE_CODE_GIT_BASH_PATH) {
    const gitBash = resolveGitBashPath()
    if (gitBash) merged.CLAUDE_CODE_GIT_BASH_PATH = gitBash
  }
  const key =
    merged.DEEPSEEK_API_KEY ||
    merged.API_KEY ||
    merged.ANTHROPIC_AUTH_TOKEN ||
    merged.ANTHROPIC_API_KEY ||
    ''
  if (key && !String(key).includes('在此粘贴')) {
    merged.ANTHROPIC_AUTH_TOKEN = key
    merged.ANTHROPIC_API_KEY = key
  }
  // Runtime values from the renderer are placed in ANTHROPIC_BASE_URL. Prefer
  // that over the legacy BASE_URL from lab-agent.env so a UI change cannot be
  // silently routed back to an old gateway.
  const rawBase = String(merged.ANTHROPIC_BASE_URL || merged.BASE_URL || 'https://api.deepseek.com')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/v1$/i, '')
  let engineBase = rawBase || 'https://api.deepseek.com'
  if (/deepseek/i.test(engineBase) && !/anthropic/i.test(engineBase)) {
    engineBase = `${engineBase}/anthropic`
  }
  merged.ANTHROPIC_BASE_URL = engineBase
  const model = merged.MODEL || merged.ANTHROPIC_MODEL || merged.ANTHROPIC_DEFAULT_SONNET_MODEL
  if (model) {
    merged.ANTHROPIC_MODEL = model
    merged.ANTHROPIC_DEFAULT_OPUS_MODEL = merged.ANTHROPIC_DEFAULT_OPUS_MODEL || model
    merged.ANTHROPIC_DEFAULT_SONNET_MODEL = merged.ANTHROPIC_DEFAULT_SONNET_MODEL || model
    merged.ANTHROPIC_DEFAULT_HAIKU_MODEL = merged.ANTHROPIC_DEFAULT_HAIKU_MODEL || model
    merged.CLAUDE_CODE_SUBAGENT_MODEL = merged.CLAUDE_CODE_SUBAGENT_MODEL || model
  }
  return merged
}

function extractAssistantText(message: unknown): string {
  if (!message || typeof message !== 'object') return ''
  const content = (message as { content?: unknown }).content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const b = block as { type?: string; text?: string }
    if (b.type === 'text' && typeof b.text === 'string') parts.push(b.text)
  }
  return parts.join('')
}

function lineCount(s: string): number {
  if (!s) return 0
  return s.split(/\r?\n/).length
}

function basenamePath(p: string): string {
  const parts = p.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] || p
}

function parseAskQuestions(
  toolName: string,
  input: Record<string, unknown>,
):
  | {
      question: string
      header?: string
      options: { label: string; description?: string }[]
      multiSelect?: boolean
    }[]
  | undefined {
  if (!isAskUserQuestionTool(toolName)) return undefined
  const raw = input.questions
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const out: {
    question: string
    header?: string
    options: { label: string; description?: string }[]
    multiSelect?: boolean
  }[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const q = item as Record<string, unknown>
    const question = typeof q.question === 'string' ? q.question : ''
    if (!question) continue
    const optsRaw = Array.isArray(q.options) ? q.options : []
    const options = optsRaw
      .map((o) => {
        if (!o || typeof o !== 'object') return null
        const opt = o as Record<string, unknown>
        const label = typeof opt.label === 'string' ? opt.label : ''
        if (!label) return null
        return {
          label,
          description: typeof opt.description === 'string' ? opt.description : undefined,
        }
      })
      .filter(Boolean) as { label: string; description?: string }[]
    if (options.length < 2) continue
    out.push({
      question,
      header: typeof q.header === 'string' ? q.header : undefined,
      options,
      multiSelect: Boolean(q.multiSelect),
    })
  }
  return out.length ? out : undefined
}

function pickFile(input: Record<string, unknown>): string | undefined {
  for (const k of ['file_path', 'path', 'file', 'filename', 'target_file']) {
    const v = input[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return undefined
}

function summarizeTool(name: string, input: Record<string, unknown>): {
  summary: string
  file?: string
  add?: number
  del?: number
  detailLines?: { text: string; tone?: 'add' | 'del' | 'ctx' }[]
} {
  const file = pickFile(input)
  const lower = name.toLowerCase()

  if (lower.includes('edit') || lower === 'streplace' || lower.includes('replace')) {
    const oldS = typeof input.old_string === 'string' ? input.old_string : typeof input.oldString === 'string' ? input.oldString : ''
    const newS = typeof input.new_string === 'string' ? input.new_string : typeof input.newString === 'string' ? input.newString : ''
    const del = oldS ? lineCount(oldS) : undefined
    const add = newS ? lineCount(newS) : undefined
    const detailLines: { text: string; tone?: 'add' | 'del' | 'ctx' }[] = []
    if (oldS) {
      for (const line of oldS.split(/\r?\n/).slice(0, 4)) detailLines.push({ text: line.slice(0, 120), tone: 'del' })
    }
    if (newS) {
      for (const line of newS.split(/\r?\n/).slice(0, 4)) detailLines.push({ text: line.slice(0, 120), tone: 'add' })
    }
    return {
      summary: file ? basenamePath(file) : 'edit',
      file,
      add,
      del,
      detailLines: detailLines.length ? detailLines : undefined,
    }
  }

  if (lower.includes('write') || lower === 'createfile') {
    const content =
      typeof input.content === 'string'
        ? input.content
        : typeof input.new_string === 'string'
          ? input.new_string
          : typeof input.contents === 'string'
            ? input.contents
            : ''
    const add = content ? lineCount(content) : undefined
    const detailLines = content
      ? content
          .split(/\r?\n/)
          .slice(0, 5)
          .map((text) => ({ text: text.slice(0, 120), tone: 'add' as const }))
      : undefined
    return {
      summary: file ? basenamePath(file) : add ? `write ${add} lines` : 'write',
      file,
      add,
      del: 0,
      detailLines,
    }
  }

  if (lower.includes('bash') || lower.includes('shell') || lower === 'run') {
    const cmd =
      (typeof input.command === 'string' && input.command) ||
      (typeof input.cmd === 'string' && input.cmd) ||
      ''
    return { summary: cmd.slice(0, 160) || 'command', file }
  }

  if (lower.includes('read') || lower.includes('view') || lower.includes('glob') || lower.includes('grep')) {
    const q =
      (typeof input.pattern === 'string' && input.pattern) ||
      (typeof input.glob === 'string' && input.glob) ||
      (typeof input.query === 'string' && input.query) ||
      ''
    return {
      summary: file ? basenamePath(file) : q.slice(0, 120) || name,
      file,
    }
  }

  const compact = JSON.stringify(input)
  return {
    summary: file ? basenamePath(file) : compact.length > 160 ? `${compact.slice(0, 157)}…` : compact || name,
    file,
  }
}

function extractToolUses(message: unknown): Extract<BridgeEvent, { kind: 'tool' }>[] {
  if (!message || typeof message !== 'object') return []
  const content = (message as { content?: unknown }).content
  if (!Array.isArray(content)) return []
  const out: Extract<BridgeEvent, { kind: 'tool' }>[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const b = block as { type?: string; id?: string; name?: string; input?: unknown }
    if (b.type !== 'tool_use' || typeof b.name !== 'string') continue
    const id = typeof b.id === 'string' && b.id ? b.id : `tool-${b.name}-${out.length}`
    const input = b.input && typeof b.input === 'object' ? (b.input as Record<string, unknown>) : {}
    const meta = summarizeTool(b.name, input)
    out.push({
      kind: 'tool',
      id,
      name: b.name,
      summary: meta.summary,
      state: 'running',
      file: meta.file,
      add: meta.add,
      del: meta.del,
      detailLines: meta.detailLines,
    })
  }
  return out
}

function extractToolResults(message: unknown): { id: string; isError: boolean; preview: string }[] {
  if (!message || typeof message !== 'object') return []
  const content = (message as { content?: unknown }).content
  if (!Array.isArray(content)) return []
  const out: { id: string; isError: boolean; preview: string }[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const b = block as {
      type?: string
      tool_use_id?: string
      is_error?: boolean
      content?: unknown
    }
    if (b.type !== 'tool_result' || typeof b.tool_use_id !== 'string') continue
    let preview = ''
    if (typeof b.content === 'string') preview = b.content
    else if (Array.isArray(b.content)) {
      preview = b.content
        .map((c) => (c && typeof c === 'object' && typeof (c as { text?: string }).text === 'string' ? (c as { text: string }).text : ''))
        .filter(Boolean)
        .join('\n')
    }
    out.push({
      id: b.tool_use_id,
      isError: isLikelyToolFailure(Boolean(b.is_error), preview),
      preview: preview.slice(0, 400),
    })
  }
  return out
}

function extractTextDelta(obj: Record<string, unknown>): string | null {
  if (obj.type !== 'stream_event') return null
  const event = obj.event as Record<string, unknown> | undefined
  if (!event || event.type !== 'content_block_delta') return null
  const delta = event.delta as Record<string, unknown> | undefined
  if (!delta) return null
  if (delta.type === 'text_delta' && typeof delta.text === 'string') return delta.text
  return null
}

function extractThinkingDelta(obj: Record<string, unknown>): string | null {
  if (obj.type !== 'stream_event') return null
  const event = obj.event as Record<string, unknown> | undefined
  if (!event || event.type !== 'content_block_delta') return null
  const delta = event.delta as Record<string, unknown> | undefined
  if (!delta) return null
  if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') return delta.thinking
  if (delta.type === 'thinking_delta' && typeof delta.text === 'string') return delta.text
  return null
}

function extractThinkingText(message: unknown): string {
  if (!message || typeof message !== 'object') return ''
  const content = (message as { content?: unknown }).content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const b = block as { type?: string; thinking?: string; text?: string }
    if (b.type === 'thinking' && typeof b.thinking === 'string') parts.push(b.thinking)
    if (b.type === 'thinking' && typeof b.text === 'string') parts.push(b.text)
  }
  return parts.join('\n')
}

function emptyState(): SessionState {
  return {
    tools: new Map(),
    subagents: new Map(),
    pendingPermInput: new Map(),
    lastActivityAt: Date.now(),
    lastHeartbeatEmittedAt: 0,
    turnBusy: false,
    turnStartedAt: 0,
    assistantAccum: '',
    thinkingAccum: '',
    apiResponseUsage: new Map(),
    turnHadPartials: false,
    turnHadThinkingPartials: false,
    lastAssistantUuid: undefined,
    toolStartedAt: new Map(),
  }
}

function extractUserPlainText(message: unknown): string {
  if (!message || typeof message !== 'object') return ''
  const content = (message as { content?: unknown }).content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const b = block as { type?: string; text?: string }
    if (b.type === 'text' && typeof b.text === 'string') parts.push(b.text)
  }
  return parts.join('')
}

function usageFieldNames(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return 'unavailable'
  const known = [
    'input_tokens', 'output_tokens', 'cache_read_input_tokens',
    'cache_creation_input_tokens', 'prompt_tokens', 'completion_tokens',
    'prompt_cache_hit_tokens', 'prompt_cache_miss_tokens', 'prompt_tokens_details',
  ]
  const value = raw as Record<string, unknown>
  return known.filter((key) => key in value).join(',') || 'unknown'
}

/** Match Lab Code sanitizePath for projects/<sanitized-cwd>/<uuid>.jsonl */
function sanitizeProjectPath(name: string): string {
  const MAX = 200
  const sanitized = name.replace(/[^a-zA-Z0-9]/g, '-')
  if (sanitized.length <= MAX) return sanitized
  let hash = 5381
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) + hash) ^ name.charCodeAt(i)
  return `${sanitized.slice(0, MAX)}-${(hash >>> 0).toString(36)}`
}

/**
 * Long-lived Lab Code process per Desktop session (terminal parity):
 * keep stdin open and send follow-up user turns on the same process.
 * No --bare (matches start-lab-agent.command). Partial messages for typewriter.
 */
export class LabCodingBridge {
  private readonly engineCandidates = engineRootCandidates({
    platform: process.platform,
    arch: process.arch,
    resourcesPath: typeof process.resourcesPath === 'string' ? process.resourcesPath : undefined,
    repoRoot: path.resolve(__dirname, '../..'),
    cwd: process.cwd(),
  })
  private root = findEngineRoot(this.engineCandidates, process.platform)
  private sessions = new Map<string, SessionState>()
  /** Writable config (sessions/transcripts). Prefer Electron userData — never app Resources (App Translocation is read-only). */
  private configDir: string

  constructor(
    private emit: (sessionKey: string, event: BridgeEvent) => void,
    configDir?: string,
  ) {
    this.configDir = configDir || path.join(this.root, '.lab-agent-config')
    try {
      fs.mkdirSync(this.configDir, { recursive: true })
    } catch {
      /* ignore */
    }
  }

  /** Call from main after app ready with `path.join(app.getPath('userData'), 'lab-coding-config')`. */
  setConfigDir(dir: string) {
    this.configDir = dir
    try {
      fs.mkdirSync(this.configDir, { recursive: true })
    } catch {
      /* ignore */
    }
  }

  logRuntimeInfo(version: string, packaged: boolean, platform: string, appPath: string) {
    const binaryPath = path.join(this.root, engineBinaryName(platform))
    this.appendEngineLog(
      `runtime marker=${DESKTOP_RUNTIME_MARKER} version=${sanitizeDesktopDiagnostic(version, os.homedir(), 80)} packaged=${packaged} platform=${platform} appPath=${sanitizeDesktopDiagnostic(appPath, os.homedir(), 240)} engineRoot=${sanitizeDesktopDiagnostic(this.root, os.homedir(), 240)} engineBinary=${sanitizeDesktopDiagnostic(binaryPath, os.homedir(), 280)} engineExists=${fs.existsSync(binaryPath)}`,
    )
  }

  private engineLogPath(): string {
    return path.join(path.dirname(this.configDir), 'logs', 'lab-coding-engine.log')
  }

  private appendEngineLog(line: string) {
    try {
      const file = this.engineLogPath()
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.appendFileSync(file, `${new Date().toISOString()} ${line}\n`, 'utf8')
    } catch {
      /* ignore */
    }
  }

  private clearIdleTimer(s: SessionState) {
    if (s.idleTimer) {
      clearInterval(s.idleTimer)
      s.idleTimer = undefined
    }
  }

  private touchActivity(s: SessionState) {
    s.lastActivityAt = Date.now()
  }

  private emitHeartbeat(
    sessionKey: string,
    s: SessionState,
    phase: Extract<BridgeEvent, { kind: 'heartbeat' }>['phase'],
    options: Omit<Extract<BridgeEvent, { kind: 'heartbeat' }>, 'kind' | 'phase' | 'ts'> = {},
    force = false,
  ) {
    const now = Date.now()
    // Text deltas can arrive rapidly. Keep the UI event stream light while
    // allowing real tool_progress messages to bypass the throttle.
    if (!force && now - s.lastHeartbeatEmittedAt < 1000) return
    s.lastHeartbeatEmittedAt = now
    this.emit(sessionKey, {
      kind: 'heartbeat',
      phase,
      ...options,
      ts: now,
    })
  }

  private finalizeRunningTools(s: SessionState, sessionKey: string, asError: boolean) {
    for (const [id, tool] of s.tools) {
      if (tool.state === 'running') {
        const done = {
          ...tool,
          state: (asError ? 'error' : 'done') as 'error' | 'done',
          add: asError ? undefined : tool.add,
          del: asError ? undefined : tool.del,
          detailLines: asError ? undefined : tool.detailLines,
          summary: asError ? `${tool.summary} · 已中断` : tool.summary,
        }
        s.tools.set(id, done)
        this.emit(sessionKey, done)
      }
    }
  }

  private isAlive(s: SessionState): boolean {
    return Boolean(s.proc && !s.proc.killed && s.proc.stdin && !s.proc.stdin.destroyed)
  }

  private writeUser(s: SessionState, prompt: string): boolean {
    if (!this.isAlive(s)) return false
    const userMsg = {
      type: 'user',
      message: { role: 'user', content: prompt },
      parent_tool_use_id: null,
    }
    try {
      s.proc!.stdin!.write(`${JSON.stringify(userMsg)}\n`)
      return true
    } catch {
      return false
    }
  }

  private beginTurn(s: SessionState) {
    s.turnBusy = true
    s.turnStartedAt = Date.now()
    s.tools = new Map()
    s.assistantAccum = ''
    s.thinkingAccum = ''
    s.apiResponseUsage.clear()
    s.latestRequestUsage = undefined
    s.peakRequestUsage = undefined
    s.turnHadPartials = false
    s.turnHadThinkingPartials = false
    s.lastAssistantUuid = undefined
    s.lastHeartbeatEmittedAt = 0
    s.pendingPermInput = new Map()
    s.toolStartedAt.clear()
    this.touchActivity(s)
  }

  private armBusyIdleWatch(sessionKey: string, s: SessionState) {
    this.clearIdleTimer(s)
    s.idleTimer = setInterval(() => {
      if (!s.proc || s.proc.killed) {
        this.clearIdleTimer(s)
        return
      }
      // Between turns the process idles on purpose — do not kill
      if (!s.turnBusy) return
      const activeTool = [...s.tools.values()].find((tool) => tool.state === 'running')
      const runningShell = Boolean(activeTool && /bash|shell|powershell|terminal|command|run/i.test(activeTool.name))
      const reason = getAgentWatchdogStopReason({
        turnBusy: s.turnBusy,
        permissionPending: s.pendingPermInput.size > 0,
        runningTool: Boolean(activeTool),
        runningShell,
        now: Date.now(),
        lastActivityAt: s.lastActivityAt,
      })
      if (!reason) return
      this.clearIdleTimer(s)
      this.finalizeRunningTools(s, sessionKey, true)
      s.pendingPermInput.clear()
      const shellIdleMinutes = Math.round(AGENT_WATCHDOG_LIMITS.shellNoOutputMs / 60_000)
      const toolIdleMinutes = Math.round(AGENT_WATCHDOG_LIMITS.toolNoOutputMs / 60_000)
      const noOutputMinutes = Math.round(AGENT_WATCHDOG_LIMITS.noOutputMs / 60_000)
      const stopMessage =
        reason === 'shell-idle'
          ? `Shell 工具连续 ${shellIdleMinutes} 分钟没有报告进度，已停止${activeTool ? `（${activeTool.name}）` : ''}。请检查命令或网络后重试。`
          : reason === 'tool-idle'
            ? `工具连续 ${toolIdleMinutes} 分钟没有报告进度，已停止${activeTool ? `（${activeTool.name}）` : ''}。可以检查工具状态后重试。`
            : `Agent 连续 ${noOutputMinutes} 分钟没有收到引擎进度，已停止。可检查模型连接或权限状态后重试。`
      this.appendEngineLog(
        `watchdog stop session=${sessionKey} reason=${reason} tool=${activeTool?.name || '(none)'} idleMs=${Date.now() - s.lastActivityAt} turnMs=${Date.now() - s.turnStartedAt}`,
      )
      this.emit(sessionKey, {
        kind: 'error',
        text: stopMessage,
      })
      try {
        s.proc.kill('SIGTERM')
      } catch {
        /* ignore */
      }
      s.proc = undefined
      s.rl = undefined
      s.turnBusy = false
      // Keep claudeSessionId so the next prompt can --resume
    }, 5_000)
  }

  /** Stop current process / turn. Keeps session UUID for --resume (does not delete JSONL). */
  cancel(sessionKey: string) {
    const s = this.sessions.get(sessionKey)
    const hadProc = Boolean(s?.proc && !s.proc.killed)
    const hadRunning = Boolean(s && [...s.tools.values()].some((t) => t.state === 'running'))
    if (s?.rl) {
      try {
        s.rl.close()
      } catch {
        /* ignore */
      }
      s.rl = undefined
    }
    if (s?.proc && !s.proc.killed) {
      try {
        s.proc.stdin?.end()
      } catch {
        /* ignore */
      }
      try {
        s.proc.kill('SIGTERM')
      } catch {
        /* ignore */
      }
    }
    if (s) {
      this.clearIdleTimer(s)
      if (hadProc || hadRunning || s.turnBusy) {
        this.finalizeRunningTools(s, sessionKey, true)
        this.emit(sessionKey, {
          kind: 'result',
          text: '已停止',
          sessionId: s.claudeSessionId,
          isError: true,
        })
      }
      s.proc = undefined
      s.turnBusy = false
      s.pendingPermInput.clear()
      // Keep claudeSessionId — Stop must not break resume after Desktop restart
    }
  }

  private transcriptExists(cwd: string, sessionId: string): boolean {
    return Boolean(this.transcriptPath(cwd, sessionId))
  }

  private transcriptPath(cwd: string, sessionId: string): string | undefined {
    const projectsRoot = path.join(this.configDir, 'projects')
    const cwds = new Set<string>([cwd])
    try {
      cwds.add(fs.realpathSync(cwd))
    } catch {
      /* ignore */
    }
    for (const c of cwds) {
      const file = path.join(projectsRoot, sanitizeProjectPath(c), `${sessionId}.jsonl`)
      try {
        if (fs.existsSync(file)) return file
      } catch {
        /* ignore */
      }
    }
    return undefined
  }

  /**
   * Find the last user turn matching `userText` and return its parentUuid
   * (the tip to keep with --resume-session-at). null parent → empty context.
   */
  private resolveCutTip(
    cwd: string,
    sessionId: string,
    userText: string,
  ): { tipUuid: string | null; found: boolean } {
    const file = this.transcriptPath(cwd, sessionId)
    if (!file) return { tipUuid: null, found: false }
    const want = userText.trim()
    let tipUuid: string | null = null
    let found = false
    try {
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
      for (const line of lines) {
        const t = line.trim()
        if (!t) continue
        let obj: Record<string, unknown>
        try {
          obj = JSON.parse(t) as Record<string, unknown>
        } catch {
          continue
        }
        if (obj.type !== 'user') continue
        const plain = extractUserPlainText(obj.message)
        if (!plain || plain.trim() !== want) continue
        found = true
        tipUuid =
          typeof obj.parentUuid === 'string' && obj.parentUuid
            ? obj.parentUuid
            : null
      }
    } catch {
      return { tipUuid: null, found: false }
    }
    return { tipUuid, found }
  }

  private killProcess(s: SessionState) {
    try {
      s.rl?.close()
    } catch {
      /* ignore */
    }
    try {
      s.proc?.kill('SIGTERM')
    } catch {
      /* ignore */
    }
    s.proc = undefined
    s.rl = undefined
    s.turnBusy = false
  }

  private purgeTranscript(cwd: string | undefined, sessionId: string | undefined) {
    if (!cwd || !sessionId) return
    const projectsRoot = path.join(this.configDir, 'projects')
    const cwds = new Set<string>([cwd])
    try {
      cwds.add(fs.realpathSync(cwd))
    } catch {
      /* ignore */
    }
    for (const c of cwds) {
      const dir = path.join(projectsRoot, sanitizeProjectPath(c))
      for (const name of [`${sessionId}.jsonl`, `${sessionId}.jsonl.backup`]) {
        const file = path.join(dir, name)
        try {
          if (fs.existsSync(file)) fs.unlinkSync(file)
        } catch {
          /* ignore */
        }
      }
    }
  }

  /**
   * Kill process, drop Desktop session map entry, and remove engine JSONL for
   * this section only (same-folder siblings stay untouched).
   * Use for hard-delete / cwd change — not for Stop.
   */
  clearSession(
    sessionKey: string,
    opts?: { cwd?: string; sessionId?: string },
  ) {
    const s = this.sessions.get(sessionKey)
    const sid = s?.claudeSessionId || opts?.sessionId
    const cwd = s?.cwd || opts?.cwd
    this.cancel(sessionKey)
    this.purgeTranscript(cwd, sid)
    this.sessions.delete(sessionKey)
  }

  respondPermission(
    sessionKey: string,
    requestId: string,
    allow: boolean,
    message?: string,
    updatedInput?: Record<string, unknown>,
    setMode?: string,
  ): boolean {
    const s = this.sessions.get(sessionKey)
    const proc = s?.proc
    if (!s || !proc?.stdin || proc.stdin.destroyed) return false
    if (setMode === 'default' || setMode === 'acceptEdits' || setMode === 'bypassPermissions') {
      s.spawnedPermissionMode = setMode
    }
    const base = s.pendingPermInput.get(requestId) ?? {}
    s.pendingPermInput.delete(requestId)
    this.touchActivity(s)
    const merged =
      allow && updatedInput ? { ...base, ...updatedInput } : allow ? base : undefined
    const payload = allow
      ? {
          type: 'control_response',
          response: {
            subtype: 'success',
            request_id: requestId,
            response: {
              behavior: 'allow',
              updatedInput: merged ?? base,
            },
          },
        }
      : {
          type: 'control_response',
          response: {
            subtype: 'success',
            request_id: requestId,
            response: {
              behavior: 'deny',
              message: message || 'User denied permission in Lab Agent',
            },
          },
        }
    try {
      proc.stdin.write(`${JSON.stringify(payload)}\n`)
      this.emit(sessionKey, {
        kind: 'status',
        text: allow ? '已批准 · 继续执行' : '已拒绝该操作',
      })
      return true
    } catch {
      return false
    }
  }

  private handleLine(sessionKey: string, s: SessionState, line: string) {
    this.touchActivity(s)
    const t = line.trim()
    if (!t) return
    let obj: Record<string, unknown>
    try {
      obj = JSON.parse(t) as Record<string, unknown>
    } catch {
      return
    }
    const type = obj.type
    if (typeof obj.session_id === 'string') {
      s.claudeSessionId = obj.session_id
    }

    if (type === 'tool_progress') {
      const parentToolUseId = typeof obj.parent_tool_use_id === 'string' ? obj.parent_tool_use_id : undefined
      const emittedToolUseId = typeof obj.tool_use_id === 'string' ? obj.tool_use_id : undefined
      const toolUseId = parentToolUseId || emittedToolUseId
      const toolName = typeof obj.tool_name === 'string' ? obj.tool_name : 'Tool'
      const elapsedSeconds = typeof obj.elapsed_time_seconds === 'number' ? obj.elapsed_time_seconds : undefined
      const activeTool = [...s.tools.values()].find((tool) => tool.state === 'running' && tool.name === toolName)
      const startedAt = toolUseId ? s.toolStartedAt.get(toolUseId) : undefined
      const elapsedMs = elapsedSeconds !== undefined
        ? Math.max(0, Math.round(elapsedSeconds * 1000))
        : startedAt
          ? Math.max(0, Date.now() - startedAt)
          : undefined
      const taskId = typeof obj.task_id === 'string' && obj.task_id ? obj.task_id : undefined
      this.emitHeartbeat(
        sessionKey,
        s,
        'tool',
        {
          toolName,
          toolUseId: toolUseId || activeTool?.id,
          elapsedMs,
          detail: taskId ? `任务 ${taskId}` : undefined,
        },
        true,
      )
      return
    }

    const thinkingDelta = extractThinkingDelta(obj)
    if (thinkingDelta) {
      s.turnHadThinkingPartials = true
      s.thinkingAccum += thinkingDelta
      this.emitHeartbeat(sessionKey, s, 'thinking', {
        elapsedMs: Math.max(0, Date.now() - s.turnStartedAt),
      })
      this.emit(sessionKey, { kind: 'thinking_text', text: thinkingDelta, partial: true })
      return
    }

    const delta = extractTextDelta(obj)
    if (delta) {
      s.turnHadPartials = true
      s.assistantAccum += delta
      this.emitHeartbeat(sessionKey, s, 'streaming', {
        elapsedMs: Math.max(0, Date.now() - s.turnStartedAt),
      })
      this.emit(sessionKey, { kind: 'assistant_text', text: delta, partial: true })
      return
    }

    if (type === 'control_request') {
      this.emitHeartbeat(sessionKey, s, 'waiting', {
        elapsedMs: Math.max(0, Date.now() - s.turnStartedAt),
      })
      const requestId = typeof obj.request_id === 'string' ? obj.request_id : ''
      const request = obj.request as Record<string, unknown> | undefined
      if (request?.subtype === 'can_use_tool' && requestId) {
        const toolName = String(request.tool_name || 'Tool')
        const input =
          request.input && typeof request.input === 'object'
            ? (request.input as Record<string, unknown>)
            : {}
        s.pendingPermInput.set(requestId, input)
        const file = pickFile(input)
        const meta = summarizeTool(toolName, input)
        const mode = s.spawnedPermissionMode || 'acceptEdits'

        // Workspace edits: auto-allow under acceptEdits / bypass (AskUserQuestion never auto)
        if (shouldAutoAllowTool(mode, toolName, file, s.cwd)) {
          const ok = this.respondPermission(sessionKey, requestId, true)
          if (ok) {
            this.emit(sessionKey, {
              kind: 'status',
              text: `已自动允许 · ${toolName}${file ? ` · ${path.basename(file)}` : ''}`,
            })
          }
          return
        }

        const questions = parseAskQuestions(toolName, input)
        const description = questions
          ? '请选择一项后继续'
          : (typeof request.description === 'string' && request.description) ||
            (typeof request.title === 'string' && request.title) ||
            `${toolName} 需要你的批准后才能继续`
        this.emit(sessionKey, {
          kind: 'permission',
          requestId,
          toolName,
          toolUseId: typeof request.tool_use_id === 'string' ? request.tool_use_id : undefined,
          description,
          inputPreview: meta.summary.slice(0, 280),
          file,
          questions,
        })
      }
      return
    }

    if (type === 'system') {
      const subtype = typeof obj.subtype === 'string' ? obj.subtype : ''
      if (subtype === 'compact_boundary') {
        const meta =
          obj.compact_metadata && typeof obj.compact_metadata === 'object'
            ? (obj.compact_metadata as Record<string, unknown>)
            : obj.compactMetadata && typeof obj.compactMetadata === 'object'
              ? (obj.compactMetadata as Record<string, unknown>)
              : {}
        const pre =
          typeof meta.preTokens === 'number'
            ? meta.preTokens
            : typeof meta.pre_tokens === 'number'
              ? meta.pre_tokens
              : undefined
        this.emit(sessionKey, {
          kind: 'compact',
          trigger: typeof meta.trigger === 'string' ? meta.trigger : undefined,
          preTokens: pre,
          text: '已压缩上下文',
        })
        return
      }
      if (subtype === 'task_started' || subtype === 'task_progress' || subtype === 'task_notification') {
        const taskId = typeof obj.task_id === 'string' ? obj.task_id : ''
        if (!taskId) return
        const usage = obj.usage && typeof obj.usage === 'object' ? (obj.usage as Record<string, unknown>) : {}
        const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
        const terminal =
          subtype === 'task_notification'
            ? ((obj.status === 'failed' || obj.status === 'stopped' ? obj.status : 'completed') as
                | 'completed'
                | 'failed'
                | 'stopped')
            : 'running'
        const prev = s.subagents.get(taskId)
        const next: Extract<BridgeEvent, { kind: 'subagent' }> = {
          kind: 'subagent',
          id: taskId,
          toolUseId:
            (typeof obj.tool_use_id === 'string' ? obj.tool_use_id : undefined) || prev?.toolUseId,
          description:
            sanitizeDesktopDiagnostic(
              (typeof obj.description === 'string' && obj.description) || prev?.description || '子 agent',
              '',
              160,
            ) || '子 agent',
          taskType: (typeof obj.task_type === 'string' ? obj.task_type : undefined) || prev?.taskType,
          status: terminal,
          lastToolName:
            (typeof obj.last_tool_name === 'string' ? obj.last_tool_name : undefined) || prev?.lastToolName,
          summary:
            typeof obj.summary === 'string' && obj.summary
              ? sanitizeDesktopDiagnostic(obj.summary, os.homedir(), 300)
              : prev?.summary,
          toolUses: num(usage.tool_uses) ?? prev?.toolUses,
          totalTokens: num(usage.total_tokens) ?? prev?.totalTokens,
          durationMs: num(usage.duration_ms) ?? prev?.durationMs,
        }
        if (terminal === 'running') {
          s.subagents.set(taskId, next)
        } else {
          // Terminal: emit once, then drop so a late progress ping can't revive it.
          s.subagents.delete(taskId)
        }
        this.emit(sessionKey, next)
        return
      }
      if (subtype === 'init' || (obj.model && !subtype)) {
        this.emit(sessionKey, {
          kind: 'status',
          text: `引擎就绪 · ${String(obj.model || 'model')}`,
        })
      }
      return
    }

    if (type === 'assistant') {
      if (typeof obj.uuid === 'string' && obj.uuid) {
        s.lastAssistantUuid = obj.uuid
      }
      const message = obj.message
      const assistantTools = extractToolUses(message)
      this.emitHeartbeat(sessionKey, s, assistantTools.length ? 'tool' : 'thinking', {
        toolName: assistantTools[0]?.name,
        toolUseId: assistantTools[0]?.id,
        elapsedMs: Math.max(0, Date.now() - s.turnStartedAt),
      })
      if (message && typeof message === 'object') {
        const apiMessage = message as Record<string, unknown>
        const messageId = typeof apiMessage.id === 'string' ? apiMessage.id : ''
        const requestUsage = parseTokenUsageSnapshot(apiMessage.usage)
        if (messageId && requestUsage && !s.apiResponseUsage.has(messageId)) {
          s.apiResponseUsage.set(messageId, requestUsage)
          s.latestRequestUsage = requestUsage
          s.peakRequestUsage = choosePeakContextUsage(s.peakRequestUsage, requestUsage)
        }
      }
      for (const tool of assistantTools) {
        s.tools.set(tool.id, tool)
        if (/bash|shell|powershell|terminal|command|run/i.test(tool.name)) {
          s.toolStartedAt.set(tool.id, Date.now())
          this.appendEngineLog(
            `shell-start session=${sanitizeDesktopDiagnostic(sessionKey, os.homedir(), 100)} tool=${sanitizeDesktopDiagnostic(tool.name, '', 80)} cwd=${sanitizeDesktopDiagnostic(s.cwd || '', os.homedir(), 240)} command=${sanitizeDesktopDiagnostic(tool.summary, os.homedir(), 360)}`,
          )
        }
        this.emit(sessionKey, tool)      }
      const thinking = extractThinkingText(message)
      if (thinking && !s.turnHadThinkingPartials) {
        s.thinkingAccum += (s.thinkingAccum ? '\n' : '') + thinking
        this.emit(sessionKey, { kind: 'thinking_text', text: thinking, partial: true })
      }
      const text = extractAssistantText(message)
      if (text && !s.turnHadPartials) {
        s.assistantAccum += (s.assistantAccum ? '\n' : '') + text
        this.emit(sessionKey, { kind: 'assistant_text', text, partial: true })
      }
      return
    }

    if (type === 'user') {
      this.emitHeartbeat(sessionKey, s, 'thinking', {
        elapsedMs: Math.max(0, Date.now() - s.turnStartedAt),
      })
      for (const res of extractToolResults(obj.message)) {
        const prev = s.tools.get(res.id)
        const startedAt = s.toolStartedAt.get(res.id)
        s.toolStartedAt.delete(res.id)
        if (prev && /bash|shell|powershell|terminal|command|run/i.test(prev.name)) {
          const fields = [
            `shell-result session=${sanitizeDesktopDiagnostic(sessionKey, os.homedir(), 100)}`,
            `outcome=${res.isError ? 'failed' : 'ok'}`,
            `durationMs=${startedAt ? Date.now() - startedAt : 'unknown'}`,
            `cwd=${sanitizeDesktopDiagnostic(s.cwd || '', os.homedir(), 240)}`,
            `command=${sanitizeDesktopDiagnostic(prev.summary, os.homedir(), 360)}`,
          ]
          if (res.isError) {
            fields.push(`output=${sanitizeDesktopDiagnostic(res.preview, os.homedir(), 800) || '(empty)'}`)
          }
          this.appendEngineLog(fields.join(' '))
        }
        const done: Extract<BridgeEvent, { kind: 'tool' }> = {
          kind: 'tool',
          id: res.id,
          name: prev?.name || 'Tool',
          summary: res.isError
            ? (res.preview.slice(0, 120) || prev?.summary || 'failed')
            : prev?.summary || (res.preview.slice(0, 120) || 'done'),
          state: res.isError ? 'error' : 'done',
          file: prev?.file,
          add: res.isError ? undefined : prev?.add,
          del: res.isError ? undefined : prev?.del,
          detailLines: res.isError ? undefined : prev?.detailLines,
        }
        s.tools.set(res.id, done)
        this.emit(sessionKey, done)
      }
      return
    }

    if (type === 'result') {
      this.finalizeRunningTools(s, sessionKey, false)
      const resultText =
        typeof obj.result === 'string' && obj.result
          ? obj.result
          : s.assistantAccum || (obj.is_error ? '请求失败' : '')
      const text = obj.is_error
        ? `${redactSensitiveText(resultText)}\n\n诊断：model=${s.spawnedModel || '(env)'} · protocol=${s.spawnedProtocol || 'anthropic-messages'} · base=${safeEndpoint(s.spawnedBaseUrl)}`
        : resultText
      if (typeof obj.session_id === 'string') s.claudeSessionId = obj.session_id
      s.turnBusy = false
      // result.usage is accumulated across internal model responses by Lab Code.
      // It is useful for task totals, but must never be used as a single-window value.
      const usage = parseTokenUsageSnapshot(obj.usage)
      const latestContext = s.latestRequestUsage ? contextTokensUsed(s.latestRequestUsage) : 0
      const peakContext = s.peakRequestUsage ? contextTokensUsed(s.peakRequestUsage) : 0
      this.appendEngineLog(
        `token-usage session=${sanitizeDesktopDiagnostic(sessionKey, os.homedir(), 100)} model=${sanitizeDesktopDiagnostic(s.spawnedModel || '(env)', '', 100)} protocol=${s.spawnedProtocol || 'anthropic-messages'} usageFields=${usageFieldNames(obj.usage)} runInput=${usage ? contextTokensUsed(usage) : 0} runOutput=${usage?.outputTokens || 0} runCacheRead=${usage?.cacheReadTokens || 0} runCacheCreate=${usage?.cacheCreationTokens || 0} apiResponses=${s.apiResponseUsage.size} latestRequestInput=${latestContext} peakRequestInput=${peakContext}`,
      )
      this.emit(sessionKey, {
        kind: 'result',
        text,
        sessionId: s.claudeSessionId,
        isError: Boolean(obj.is_error),
        messageUuid: s.lastAssistantUuid,
        usage,
        peakContextUsage: s.peakRequestUsage,
        contextRequestCount: s.apiResponseUsage.size,
      })
    }
  }

  private attachStdout(sessionKey: string, s: SessionState, proc: ChildProcess) {
    if (s.rl) {
      try {
        s.rl.close()
      } catch {
        /* ignore */
      }
    }
    const rl = createInterface({ input: proc.stdout! })
    s.rl = rl
    rl.on('line', (line) => this.handleLine(sessionKey, s, line))
  }

  async prompt(req: PromptRequest): Promise<void> {
    const bin = path.join(this.root, engineBinaryName(process.platform))
    if (!fs.existsSync(bin)) {
      const tried = this.engineCandidates.map((root) => path.join(root, engineBinaryName(process.platform))).join('；')
      this.appendEngineLog(`engine-missing platform=${process.platform} arch=${process.arch} tried=${sanitizeDesktopDiagnostic(tried, os.homedir(), 900)}`)
      this.emit(req.sessionKey, {
        kind: 'error',
        text: `找不到 Lab Coding 引擎。已检查：${tried}（开发环境请确认 packaging/engine/${process.platform}-${process.arch} 中有引擎；安装包应随应用附带引擎）`,
      })
      return
    }
    if (!fs.existsSync(req.cwd)) {
      this.emit(req.sessionKey, { kind: 'error', text: `工作目录不存在：${req.cwd}` })
      return
    }

    let state = this.sessions.get(req.sessionKey)
    if (!state) {
      state = emptyState()
      this.sessions.set(req.sessionKey, state)
    }

    // After Desktop restart the in-memory map is empty — re-seed from persisted UUID
    if (req.sessionId && !state.claudeSessionId) {
      state.claudeSessionId = req.sessionId
    }

    // Resolve --resume-session-at tip (edit / withdraw): JSONL cut is authoritative
    let resumeAt = req.resumeSessionAt?.trim() || undefined
    const cutText = req.cutBeforeUserText?.trim() || undefined
    const needsTruncate = Boolean(resumeAt || cutText)
    if (cutText && state.claudeSessionId) {
      const resolved = this.resolveCutTip(req.cwd, state.claudeSessionId, cutText)
      if (resolved.found) {
        resumeAt = resolved.tipUuid || undefined
        if (!resolved.tipUuid) {
          // First user turn in transcript — start a blank session
          this.purgeTranscript(req.cwd, state.claudeSessionId)
          state.claudeSessionId = undefined
          this.emit(req.sessionKey, {
            kind: 'status',
            text: '从首条消息重开会话…',
          })
        }
      } else if (!resumeAt) {
        this.emit(req.sessionKey, {
          kind: 'status',
          text: '未在引擎记录中定位到撤回点 · 将尝试整段续聊',
        })
      }
    }

    // Same cwd + live process → follow-up turn on the same Lab Code session.
    // A model/base/key/protocol change must recycle the process; otherwise the
    // UI can show one model while the long-lived CLI still uses another.
    const wantMode = req.permissionMode || 'default'
    const wantProtocol = req.protocol || 'anthropic-messages'
    const requestedFingerprint = runtimeConfigFingerprint(req)
    if (this.isAlive(state) && state.cwd === req.cwd && !needsTruncate) {
      const configChanged = state.spawnedConfigFingerprint !== requestedFingerprint
      if (configChanged) {
        if (state.turnBusy) {
          this.emit(req.sessionKey, {
            kind: 'error',
            text: '当前回合仍在运行，模型或 API 配置将在本回合结束后生效，请先点 Stop',
          })
          return
        }
        this.emit(req.sessionKey, { kind: 'status', text: '配置已变化 · 重启引擎并保留会话…' })
        const protocolChanged = state.spawnedProtocol && state.spawnedProtocol !== wantProtocol
        this.killProcess(state)
        if (protocolChanged) state.claudeSessionId = undefined
      } else {
        if (state.turnBusy) {
          this.emit(req.sessionKey, {
            kind: 'error',
            text: '上一轮还在进行中，请先等待或点 Stop',
          })
          return
        }
        this.beginTurn(state)
        this.armBusyIdleWatch(req.sessionKey, state)
        this.emit(req.sessionKey, { kind: 'status', text: '继续对话…' })
        if (!this.writeUser(state, req.prompt)) {
          state.turnBusy = false
          this.emit(req.sessionKey, { kind: 'error', text: '写入引擎失败，请重试' })
          this.cancel(req.sessionKey)
        }
        return
      }
    }

    // Dead, cwd changed, or truncate → spawn again (resume UUID if same cwd)
    if (state.cwd && state.cwd !== req.cwd) {
      state.claudeSessionId = undefined
    }
    if (state.proc) {
      this.killProcess(state)
    }

    const envExtra: Record<string, string> = {}
    if (req.apiKey) {
      envExtra.ANTHROPIC_AUTH_TOKEN = req.apiKey
      envExtra.ANTHROPIC_API_KEY = req.apiKey
    }
    if (req.baseUrl) {
      let base = req.baseUrl.replace(/\/+$/, '')
      if (base.includes('deepseek') && !base.includes('anthropic')) {
        base = base.replace(/\/v1$/, '') + '/anthropic'
      }
      envExtra.ANTHROPIC_BASE_URL = base
    }
    if (req.model) {
      // Keep env fallbacks and sub-agent model aliases aligned with the
      // explicit picker value; --model below remains the main-loop authority.
      envExtra.MODEL = req.model
      envExtra.ANTHROPIC_MODEL = req.model
    }
    const env = buildEnv(this.root, this.configDir, envExtra)
    try {
      fs.accessSync(this.configDir, fs.constants.W_OK)
    } catch (err) {
      const tip = err instanceof Error ? err.message : String(err)
      this.appendEngineLog(`configDir not writable: ${this.configDir} (${tip})`)
      this.emit(req.sessionKey, {
        kind: 'error',
        text: `引擎配置目录不可写：${this.configDir}。请把 Lab Agent.app 拖到「应用程序」后再打开（勿从「下载」直接启动）。`,
      })
      return
    }
    const key = env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY
    if (!key || String(key).includes('在此粘贴')) {
      this.emit(req.sessionKey, {
        kind: 'error',
        text: '未配置 DeepSeek/Anthropic Key。请在 agents/lab-coding/lab-agent.env 填写，或在壳里添加 API。',
      })
      return
    }

    // Match terminal Lab Code: no --bare. Partial messages for live typewriter.
    const args = [
      '-p',
      '--output-format',
      'stream-json',
      '--input-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--permission-prompt-tool',
      'stdio',
      '--permission-mode',
      req.permissionMode || 'default',
      '--append-system-prompt',
      DESKTOP_AGENT_GUIDANCE,
      '--settings',
      labAgentMemoryGuardSettings(),
    ]
    if (req.model && req.model !== '__add_api__') {
      args.push('--model', req.model)
    }
    // Process died / Desktop restarted → resume JSONL (same cwd only)
    if (state.claudeSessionId && (!state.cwd || state.cwd === req.cwd)) {
      if (!this.transcriptExists(req.cwd, state.claudeSessionId)) {
        this.emit(req.sessionKey, {
          kind: 'error',
          text: '上次会话文件已丢失，无法续聊；本次将作为新对话开始。',
        })
        state.claudeSessionId = undefined
      } else {
        args.push('--resume', state.claudeSessionId)
        if (resumeAt) {
          args.push('--resume-session-at', resumeAt)
          this.emit(req.sessionKey, { kind: 'status', text: '在记忆节点处续写…' })
        } else {
          this.emit(req.sessionKey, { kind: 'status', text: '恢复会话…' })
        }
      }
    }

    this.emit(req.sessionKey, { kind: 'status', text: 'Lab Code 启动中…' })

    const proc = spawn(bin, args, {
      cwd: req.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    state.proc = proc
    state.cwd = req.cwd
    state.spawnedPermissionMode = wantMode
    state.spawnedConfigFingerprint = requestedFingerprint
    state.spawnedProtocol = wantProtocol
    state.spawnedModel = req.model || env.ANTHROPIC_MODEL || '(env)'
    state.spawnedBaseUrl = env.ANTHROPIC_BASE_URL
    const keyFingerprint = createHash('sha256').update(String(key)).digest('hex').slice(0, 16)
    this.appendEngineLog(
      `launch session=${req.sessionKey} model=${req.model || '(env)'} protocol=${wantProtocol} base=${safeEndpoint(env.ANTHROPIC_BASE_URL)} key=${keyFingerprint}`,
    )
    this.beginTurn(state)
    this.armBusyIdleWatch(req.sessionKey, state)
    this.attachStdout(req.sessionKey, state, proc)

    if (!this.writeUser(state, req.prompt)) {
      this.emit(req.sessionKey, { kind: 'error', text: '无法向引擎写入消息' })
      this.cancel(req.sessionKey)
      return
    }

    let errBuf = ''
    proc.stderr?.on('data', (chunk: Buffer) => {
      this.touchActivity(state)
      errBuf += chunk.toString('utf8')
    })

    proc.on('error', (err) => {
      this.clearIdleTimer(state)
      state.pendingPermInput.clear()
      this.finalizeRunningTools(state, req.sessionKey, true)
      this.appendEngineLog(
        `process-error session=${sanitizeDesktopDiagnostic(req.sessionKey, os.homedir(), 100)} error=${sanitizeDesktopDiagnostic(err.message, os.homedir(), 800)}`,
      )
      this.emit(req.sessionKey, { kind: 'error', text: redactSensitiveText(err.message) })
      state.proc = undefined
      state.rl = undefined
      state.turnBusy = false
      state.claudeSessionId = undefined
    })

    proc.on('close', (code) => {
      this.clearIdleTimer(state)
      state.pendingPermInput.clear()
      state.proc = undefined
      state.rl = undefined
      const wasBusy = state.turnBusy
      state.turnBusy = false
      if (wasBusy) {
        this.finalizeRunningTools(state, req.sessionKey, true)
        const tip = sanitizeDesktopDiagnostic(errBuf
          .trim()
          .split(/\n/)
          .slice(-6)
          .join(' ')
          .replace(/\s+/g, ' '), os.homedir(), 800)
        this.appendEngineLog(
          `session=${sanitizeDesktopDiagnostic(req.sessionKey, os.homedir(), 100)} exit=${code ?? 'null'} turnMs=${Date.now() - state.turnStartedAt} accum=${state.assistantAccum.length} stderr=${tip || '(empty)'}`,
        )
        if (!state.assistantAccum) {
          const detail =
            tip ||
            (code
              ? `exit ${code}`
              : '无 stderr。若从「下载」直接打开，请先拖到「应用程序」再启动。')
          this.emit(req.sessionKey, {
            kind: 'error',
            text: `引擎异常退出${code != null && code !== 0 ? ` (${code})` : ''}：${detail}`,
          })
        } else {
          this.emit(req.sessionKey, {
            kind: 'result',
            text: state.assistantAccum,
            sessionId: state.claudeSessionId,
            isError: Boolean(code && code !== 0),
            messageUuid: state.lastAssistantUuid,
          })
        }
      }
      // Keep claudeSessionId so a later prompt can --resume (Stop/cancel clears it)
    })
  }
}
