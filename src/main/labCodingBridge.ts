import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createInterface, type Interface } from 'node:readline'
import { AGENT_PERMISSION_TIMEOUT_MS, type TokenUsageSnapshot } from '../shared/protocol'
import { isAskUserQuestionTool, shouldAutoAllowTool } from '../shared/permissionPolicy'

export type BridgeEvent =
  | { kind: 'status'; text: string }
  | { kind: 'assistant_text'; text: string; partial?: boolean }
  | { kind: 'thinking_text'; text: string; partial?: boolean }
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
      kind: 'permission'
      requestId: string
      toolName: string
      toolUseId?: string
      description: string
      inputPreview: string
      file?: string
      expiresAt?: number
      timeoutMs?: number
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
}

const PERMISSION_TIMEOUT_MS = AGENT_PERMISSION_TIMEOUT_MS
/** Only while a turn is in-flight (tools / waiting) — idle between turns is OK */
const BUSY_IDLE_TIMEOUT_MS = 90_000

type SessionState = {
  claudeSessionId?: string
  proc?: ChildProcess
  rl?: Interface
  cwd?: string
  /** Permission mode used when this process was spawned */
  spawnedPermissionMode?: string
  /** True while waiting for the current turn's result */
  turnBusy: boolean
  tools: Map<string, Extract<BridgeEvent, { kind: 'tool' }>>
  pendingPermInput: Map<string, Record<string, unknown>>
  permTimers: Map<string, ReturnType<typeof setTimeout>>
  lastActivityAt: number
  idleTimer?: ReturnType<typeof setInterval>
  assistantAccum: string
  thinkingAccum: string
  /** Skip full assistant text when stream_event deltas already streamed */
  turnHadPartials: boolean
  turnHadThinkingPartials: boolean
  /** Last assistant JSONL uuid seen this turn */
  lastAssistantUuid?: string
}

function engineBinaryName(): string {
  return process.platform === 'win32' ? 'cli-dev.exe' : 'cli-dev'
}

function resolveLabCodingRoot(): string {
  const candidates = [
    // Packaged desktop: electron-builder extraResources
    typeof process.resourcesPath === 'string' ? path.join(process.resourcesPath, 'lab-coding') : '',
    path.resolve(__dirname, '../../../agents/lab-coding'),
    path.resolve(process.cwd(), 'agents/lab-coding'),
    path.resolve(__dirname, '../../agents/lab-coding'),
  ].filter(Boolean)
  for (const c of candidates) {
    const bin = path.join(c, engineBinaryName())
    if (
      fs.existsSync(bin) ||
      fs.existsSync(path.join(c, 'cli-dev')) ||
      fs.existsSync(path.join(c, 'start-lab-agent.command'))
    ) {
      return c
    }
  }
  return candidates[0] || path.resolve(process.cwd(), 'agents/lab-coding')
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

function buildEnv(root: string, extra?: Record<string, string>): NodeJS.ProcessEnv {
  const fromFile = {
    ...loadEnvFile(path.join(root, 'freecode.env')), // legacy fallback
    ...loadEnvFile(path.join(root, 'lab-agent.env')), // wins
  }
  const configDir = path.join(root, '.lab-agent-config')
  try {
    fs.mkdirSync(configDir, { recursive: true })
  } catch {
    /* ignore */
  }
  const merged: NodeJS.ProcessEnv = {
    ...process.env,
    ...fromFile,
    ...extra,
    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR || configDir,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:
      process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC || fromFile.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC || '1',
  }
  if (!merged.ANTHROPIC_BASE_URL) {
    merged.ANTHROPIC_BASE_URL = 'https://api.deepseek.com/anthropic'
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
      isError:
        Boolean(b.is_error) ||
        /no such tool available|tool not found|permission denied|error:/i.test(preview),
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
    pendingPermInput: new Map(),
    permTimers: new Map(),
    lastActivityAt: Date.now(),
    turnBusy: false,
    assistantAccum: '',
    thinkingAccum: '',
    turnHadPartials: false,
    turnHadThinkingPartials: false,
    lastAssistantUuid: undefined,
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

function parseUsage(raw: unknown): TokenUsageSnapshot | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const u = raw as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  const input = num(u.input_tokens)
  const output = num(u.output_tokens)
  const cacheRead = num(u.cache_read_input_tokens)
  const cacheCreate = num(u.cache_creation_input_tokens)
  if (input === 0 && output === 0 && cacheRead === 0 && cacheCreate === 0) {
    // Some providers only fill nested fields — still emit zeros only if any key present
    if (!('input_tokens' in u) && !('output_tokens' in u)) return undefined
  }
  return {
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: cacheRead || undefined,
    cacheCreationTokens: cacheCreate || undefined,
  }
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
  private root = resolveLabCodingRoot()
  private sessions = new Map<string, SessionState>()

  constructor(private emit: (sessionKey: string, event: BridgeEvent) => void) {}

  private clearPermTimers(s: SessionState) {
    for (const t of s.permTimers.values()) clearTimeout(t)
    s.permTimers.clear()
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
    s.tools = new Map()
    s.assistantAccum = ''
    s.thinkingAccum = ''
    s.turnHadPartials = false
    s.turnHadThinkingPartials = false
    s.lastAssistantUuid = undefined
    s.pendingPermInput = new Map()
    this.clearPermTimers(s)
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
      if (Date.now() - s.lastActivityAt < BUSY_IDLE_TIMEOUT_MS) return
      this.clearIdleTimer(s)
      this.clearPermTimers(s)
      this.finalizeRunningTools(s, sessionKey, true)
      this.emit(sessionKey, {
        kind: 'error',
        text: 'Agent 超过 90s 无响应（常见于权限等待或 Shell 挂起），已强制停止',
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
      this.clearPermTimers(s)
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
    const configDir =
      process.env.CLAUDE_CONFIG_DIR || path.join(this.root, '.lab-agent-config')
    const projectsRoot = path.join(configDir, 'projects')
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
    const configDir =
      process.env.CLAUDE_CONFIG_DIR || path.join(this.root, '.lab-agent-config')
    const projectsRoot = path.join(configDir, 'projects')
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
    const timer = s.permTimers.get(requestId)
    if (timer) {
      clearTimeout(timer)
      s.permTimers.delete(requestId)
    }
    const base = s.pendingPermInput.get(requestId) ?? {}
    s.pendingPermInput.delete(requestId)
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

    const thinkingDelta = extractThinkingDelta(obj)
    if (thinkingDelta) {
      s.turnHadThinkingPartials = true
      s.thinkingAccum += thinkingDelta
      this.emit(sessionKey, { kind: 'thinking_text', text: thinkingDelta, partial: true })
      return
    }

    const delta = extractTextDelta(obj)
    if (delta) {
      s.turnHadPartials = true
      s.assistantAccum += delta
      this.emit(sessionKey, { kind: 'assistant_text', text: delta, partial: true })
      return
    }

    if (type === 'control_request') {
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
        const timeoutMs = PERMISSION_TIMEOUT_MS
        const expiresAt = Date.now() + timeoutMs
        this.emit(sessionKey, {
          kind: 'permission',
          requestId,
          toolName,
          toolUseId: typeof request.tool_use_id === 'string' ? request.tool_use_id : undefined,
          description,
          inputPreview: meta.summary.slice(0, 280),
          file,
          expiresAt,
          timeoutMs,
          questions,
        })
        const prevTimer = s.permTimers.get(requestId)
        if (prevTimer) clearTimeout(prevTimer)
        s.permTimers.set(
          requestId,
          setTimeout(() => {
            s.permTimers.delete(requestId)
            const ok = this.respondPermission(
              sessionKey,
              requestId,
              false,
              'Permission timed out in Lab Agent (90s)',
            )
            if (ok) {
              this.emit(sessionKey, {
                kind: 'status',
                text: '权限等待超时 · 已自动拒绝',
              })
            }
          }, timeoutMs),
        )
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
      for (const tool of extractToolUses(message)) {
        s.tools.set(tool.id, tool)
        this.emit(sessionKey, tool)
      }
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
      for (const res of extractToolResults(obj.message)) {
        const prev = s.tools.get(res.id)
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
      const text =
        typeof obj.result === 'string' && obj.result
          ? obj.result
          : s.assistantAccum || (obj.is_error ? '请求失败' : '')
      if (typeof obj.session_id === 'string') s.claudeSessionId = obj.session_id
      s.turnBusy = false
      this.emit(sessionKey, {
        kind: 'result',
        text,
        sessionId: s.claudeSessionId,
        isError: Boolean(obj.is_error),
        messageUuid: s.lastAssistantUuid,
        usage: parseUsage(obj.usage),
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
    const binCandidates = [
      path.join(this.root, process.platform === 'win32' ? 'cli-dev.exe' : 'cli-dev'),
      path.join(this.root, 'cli-dev'),
      path.join(this.root, 'cli-dev.exe'),
    ]
    const bin = binCandidates.find((p) => fs.existsSync(p))
    if (!bin) {
      this.emit(req.sessionKey, {
        kind: 'error',
        text: `找不到 Lab Coding 引擎：${binCandidates[0]}（开发：在 agents/lab-coding 执行 bun run build:dev；安装包：应随应用附带引擎）`,
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

    // Same cwd + live process → follow-up turn on the same Lab Code session
    // Edit/withdraw must recycle so --resume-session-at can take effect
    const wantMode = req.permissionMode || 'default'
    if (this.isAlive(state) && state.cwd === req.cwd && !needsTruncate) {
      if (state.spawnedPermissionMode && state.spawnedPermissionMode !== wantMode) {
        // Permission mode changed mid-session — recycle process, keep UUID for --resume
        this.killProcess(state)
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
    const env = buildEnv(this.root, envExtra)
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
    state.spawnedPermissionMode = req.permissionMode || 'default'
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
      errBuf += chunk.toString('utf8')
    })

    proc.on('error', (err) => {
      this.clearIdleTimer(state)
      this.clearPermTimers(state)
      this.finalizeRunningTools(state, req.sessionKey, true)
      this.emit(req.sessionKey, { kind: 'error', text: err.message })
      state.proc = undefined
      state.rl = undefined
      state.turnBusy = false
      state.claudeSessionId = undefined
    })

    proc.on('close', (code) => {
      this.clearIdleTimer(state)
      this.clearPermTimers(state)
      state.proc = undefined
      state.rl = undefined
      const wasBusy = state.turnBusy
      state.turnBusy = false
      if (wasBusy) {
        this.finalizeRunningTools(state, req.sessionKey, true)
        if (code && code !== 0 && !state.assistantAccum) {
          const tip = errBuf.trim().split(/\n/).slice(-4).join(' ') || `exit ${code}`
          this.emit(req.sessionKey, { kind: 'error', text: tip })
        } else {
          this.emit(req.sessionKey, {
            kind: 'result',
            text: state.assistantAccum || (code ? `进程退出 (${code})` : '已结束'),
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
