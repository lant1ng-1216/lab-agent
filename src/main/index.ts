import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import type { BrowserWindow as BW } from 'electron';
import { IPC, type AppSettings, type SupervisorCommand, type ChatMessage } from '../shared/protocol';
import { ContextStore } from '../agent/context/store';
import { DeepSeekProvider } from '../agent/providers/deepseek';
import { SupervisorLoop } from '../agent/loops/supervisor-loop';
import { CodingLoop } from '../agent/loops/coding-loop';
import { LabCodingBridge } from './labCodingBridge';

// node-pty is CJS; load lazily so a missing native build doesn't crash the app
// eslint-disable-next-line @typescript-eslint/no-require-imports
let pty: typeof import('node-pty') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  pty = require('node-pty') as typeof import('node-pty');
} catch {
  pty = null;
}

// Electron CJS interop
// eslint-disable-next-line @typescript-eslint/no-require-imports
const electron = require('electron') as typeof import('electron');
const { app, BrowserWindow, ipcMain, dialog, screen, nativeImage } = electron;

const isDev = !app.isPackaged;

/** App icon: prefer PNG for dock.setIcon reliability in Electron-dev */
function resolveAppIcon(): string | undefined {
  const roots = [
    path.join(__dirname, '../../build'),
    path.join(process.cwd(), 'build'),
  ];
  // PNG first on darwin — icns often fails silently with dock.setIcon in unpackaged Electron
  const names =
    process.platform === 'darwin'
      ? ['icon.png', 'icon-source.png', 'icon.icns']
      : ['icon.png', 'icon.ico'];
  for (const root of roots) {
    for (const name of names) {
      const p = path.join(root, name);
      if (fs.existsSync(p)) return p;
    }
  }
  return undefined;
}

function applyDockIcon(iconPath: string | undefined) {
  if (!iconPath || process.platform !== 'darwin' || !app.dock) return;
  try {
    const img = nativeImage.createFromPath(iconPath);
    if (img.isEmpty()) {
      console.warn('[lab-agent] dock icon empty:', iconPath);
      return;
    }
    app.dock.setIcon(img);
    console.log('[lab-agent] dock icon set:', iconPath, `${img.getSize().width}x${img.getSize().height}`);
  } catch (err) {
    console.warn('[lab-agent] dock.setIcon failed:', iconPath, err);
  }
}

/** Electron GUI apps often have a tiny PATH — find a real Node for Lab Coding. */
function resolveNodeBinary(): string {
  if (process.env.NODE && fs.existsSync(process.env.NODE)) return process.env.NODE;

  const home = os.homedir();
  const candidates = [
    path.join(home, '.local/bin/node'),
    path.join(home, '.hermes/node/bin/node'),
    path.join(home, '.nvm/current/bin/node'),
    '/opt/homebrew/bin/node',
    '/usr/local/bin/node',
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch { /* ignore */ }
  }

  try {
    const shell = process.env.SHELL || '/bin/zsh';
    const out = execFileSync(shell, ['-lc', 'command -v node'], {
      encoding: 'utf8',
      env: process.env,
      timeout: 3000,
    }).trim().split('\n')[0];
    if (out && fs.existsSync(out)) return out;
  } catch { /* ignore */ }

  return 'node';
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\"'\"'`)}'`;
}

function enrichedPtyEnv(): Record<string, string> {
  const home = os.homedir();
  const extras = [
    path.join(home, '.local/bin'),
    path.join(home, '.hermes/node/bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ];
  const current = process.env.PATH || '';
  const parts = [...extras, ...current.split(path.delimiter).filter(Boolean)];
  const seen = new Set<string>();
  const pathValue = parts.filter((p) => {
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  }).join(path.delimiter);

  return { ...(process.env as Record<string, string>), PATH: pathValue };
}

function rendererUrl() {
  if (isDev) return 'http://127.0.0.1:5173/index.html';
  return path.join(__dirname, '../renderer/index.html');
}

function preloadPath() {
  return path.join(__dirname, '../preload/index.js');
}

let mainWin: BW | null = null;

const store = new ContextStore();
let settings: AppSettings = {
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
  model: 'deepseek-chat',
  workspacePath: '',
  apiBaseUrl: '',
};

function resolveLabCodingRoot(): string {
  const candidates = [
    path.resolve(__dirname, '../../agents/lab-coding'),
    path.resolve(process.cwd(), 'agents/lab-coding'),
    path.join(app.getAppPath(), 'agents/lab-coding'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'lab-agent.env')) || fs.existsSync(path.join(c, 'cli-dev'))) {
      return c;
    }
  }
  return candidates[0];
}

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

/** OpenAI-style base for /models (strip /anthropic compat suffix). */
function toOpenAiBase(anthropicOrOpenAiBase: string): string {
  let base = anthropicOrOpenAiBase.trim().replace(/\/+$/, '');
  if (!base) return 'https://api.deepseek.com';
  base = base.replace(/\/anthropic$/i, '');
  base = base.replace(/\/v1$/i, '');
  return base || 'https://api.deepseek.com';
}

function applyLabAgentEnv() {
  const root = resolveLabCodingRoot();
  const env = {
    ...parseEnvFile(path.join(root, 'freecode.env')),
    ...parseEnvFile(path.join(root, 'lab-agent.env')),
  };
  const key =
    env.ANTHROPIC_AUTH_TOKEN ||
    env.ANTHROPIC_API_KEY ||
    env.DEEPSEEK_API_KEY ||
    process.env.DEEPSEEK_API_KEY ||
    '';
  if (key && !key.includes('在此粘贴')) {
    settings.deepseekApiKey = key;
  }
  const model = env.ANTHROPIC_MODEL || env.ANTHROPIC_DEFAULT_SONNET_MODEL;
  if (model) settings.model = model;
  const rawBase = env.ANTHROPIC_BASE_URL || '';
  settings.apiBaseUrl = toOpenAiBase(rawBase || 'https://api.deepseek.com');
}

function makeProvider() {
  return new DeepSeekProvider(settings.deepseekApiKey, settings.model);
}

let supervisorLoop: SupervisorLoop;
let codingLoop: CodingLoop;
const labCodingBridge = new LabCodingBridge((sessionKey, event) => {
  send(IPC.AGENT_EVENT, { sessionKey, event });
});

function send(channel: string, payload: unknown) {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send(channel, payload);
}

function wireLoops() {
  const llm = makeProvider();

  supervisorLoop = new SupervisorLoop(
    llm,
    store,
    (cmd) => {
      send(IPC.SUPERVISOR_COMMAND, cmd);
      void codingLoop.handleCommand(cmd);
    },
    (msg) => send(IPC.CHAT_STREAM, { agent: 'supervisor', msg }),
  );

  codingLoop = new CodingLoop(
    llm,
    store,
    (ev) => {
      store.pushMirror(ev);
      send(IPC.MIRROR_EVENT, ev);
    },
    (msg) => send(IPC.CHAT_STREAM, { agent: 'coding', msg }),
  );
}

function createMainWindow() {
  if (mainWin && !mainWin.isDestroyed()) return;
  const { width: aw, height: ah } = screen.getPrimaryDisplay().workAreaSize;
  // Slightly under full IDE size (was 96%)
  const width = Math.max(1100, Math.round(aw * 0.88));
  const height = Math.max(720, Math.round(ah * 0.88));
  const icon = resolveAppIcon();
  mainWin = new BrowserWindow({
    width,
    height,
    minWidth: 900,
    minHeight: 600,
    title: 'Lab Agent',
    backgroundColor: '#0f1012',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 16 },
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  applyDockIcon(icon);
  // Match maximized IDE feel without covering the menu bar / dock
  mainWin.setBounds({
    x: Math.round((aw - width) / 2) + screen.getPrimaryDisplay().workArea.x,
    y: Math.round((ah - height) / 2) + screen.getPrimaryDisplay().workArea.y,
    width,
    height,
  });

  if (isDev) void mainWin.loadURL(rendererUrl());
  else void mainWin.loadFile(rendererUrl());

  mainWin.on('closed', () => {
    mainWin = null;
    if (process.platform !== 'darwin') app.quit();
  });
}

function registerIpc() {
  ipcMain.handle(IPC.GET_ROLE, () => 'shell');

  ipcMain.handle(IPC.GET_SETTINGS, () => ({
    ...settings,
    deepseekApiKey: settings.deepseekApiKey ? '••••••••' : '',
    hasKey: Boolean(settings.deepseekApiKey),
    apiBaseUrl: settings.apiBaseUrl || '',
    model: settings.model,
  }));

  /** Full creds for one-time shell bootstrap from lab-agent.env (local desktop only). */
  ipcMain.handle(IPC.GET_LAB_ENV, () => {
    const key = settings.deepseekApiKey || '';
    const placeholder = !key || key.includes('在此粘贴');
    return {
      ok: !placeholder,
      apiKey: placeholder ? '' : key,
      baseUrl: settings.apiBaseUrl || 'https://api.deepseek.com',
      model: settings.model || 'deepseek-flash',
    };
  });

  ipcMain.handle(IPC.SET_API_KEY, (_e, key: string) => {
    settings.deepseekApiKey = key.trim();
    wireLoops();
    return true;
  });

  ipcMain.handle(IPC.LIST_MODELS, async (_e, payload: { baseUrl?: string; apiKey?: string }) => {
    const baseUrl = String(payload?.baseUrl || '').trim().replace(/\/+$/, '');
    const apiKey = String(payload?.apiKey || '').trim();
    if (!baseUrl) return { ok: false, error: '请填写 Base URL' };
    if (!apiKey) return { ok: false, error: '请填写 API Key' };

    const candidates: string[] = [];
    if (/\/models$/i.test(baseUrl)) candidates.push(baseUrl);
    else if (/\/v1$/i.test(baseUrl)) candidates.push(`${baseUrl}/models`);
    else {
      candidates.push(`${baseUrl}/models`, `${baseUrl}/v1/models`);
    }

    let lastErr = '无法拉取模型列表';
    for (const endpoint of candidates) {
      try {
        const res = await fetch(endpoint, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
          },
        });
        if (!res.ok) {
          lastErr = `HTTP ${res.status} @ ${endpoint}`;
          continue;
        }
        const json = (await res.json()) as { data?: { id?: string; owned_by?: string }[] };
        const models = Array.isArray(json?.data)
          ? json.data
              .filter((m) => m && typeof m.id === 'string' && m.id.trim())
              .map((m) => ({ id: String(m.id).trim(), owned_by: m.owned_by }))
          : [];
        if (!models.length) {
          lastErr = `端点可用但未返回模型：${endpoint}`;
          continue;
        }
        return { ok: true, models, endpoint };
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
      }
    }
    return { ok: false, error: lastErr };
  });

  ipcMain.handle(IPC.AGENT_PROMPT, async (_e, payload: {
    sessionKey?: string;
    cwd?: string;
    prompt?: string;
    sessionId?: string;
    resumeSessionAt?: string;
    cutBeforeUserText?: string;
    model?: string;
    permissionMode?: string;
    apiKey?: string;
    baseUrl?: string;
  }) => {
    const sessionKey = String(payload?.sessionKey || '').trim();
    const cwd = String(payload?.cwd || '').trim();
    const prompt = String(payload?.prompt || '').trim();
    if (!sessionKey || !cwd || !prompt) return { ok: false, error: 'missing sessionKey/cwd/prompt' };
    await labCodingBridge.prompt({
      sessionKey,
      cwd,
      prompt,
      sessionId: payload?.sessionId ? String(payload.sessionId).trim() : undefined,
      resumeSessionAt: payload?.resumeSessionAt
        ? String(payload.resumeSessionAt).trim()
        : undefined,
      cutBeforeUserText: payload?.cutBeforeUserText
        ? String(payload.cutBeforeUserText)
        : undefined,
      model: payload?.model,
      permissionMode: payload?.permissionMode,
      apiKey: payload?.apiKey || settings.deepseekApiKey || undefined,
      baseUrl: payload?.baseUrl,
    });
    return { ok: true };
  });

  ipcMain.handle(IPC.AGENT_CANCEL, (_e, payload: {
    sessionKey?: string;
    cwd?: string;
    sessionId?: string;
    purge?: boolean;
  }) => {
    const sessionKey = String(payload?.sessionKey || '').trim();
    if (!sessionKey) return true;
    const opts = {
      cwd: payload?.cwd ? String(payload.cwd) : undefined,
      sessionId: payload?.sessionId ? String(payload.sessionId) : undefined,
    };
    // purge=true → delete section / cwd change (wipe JSONL). Stop/mode switch → soft cancel only.
    if (payload?.purge) {
      labCodingBridge.clearSession(sessionKey, opts);
    } else {
      labCodingBridge.cancel(sessionKey);
    }
    return true;
  });

  ipcMain.handle(IPC.AGENT_PERMISSION, (_e, payload: {
    sessionKey?: string;
    requestId?: string;
    allow?: boolean;
    message?: string;
    updatedInput?: Record<string, unknown>;
    setMode?: string;
  }) => {
    const sessionKey = String(payload?.sessionKey || '').trim();
    const requestId = String(payload?.requestId || '').trim();
    if (!sessionKey || !requestId) return false;
    return labCodingBridge.respondPermission(
      sessionKey,
      requestId,
      Boolean(payload?.allow),
      payload?.message,
      payload?.updatedInput && typeof payload.updatedInput === 'object'
        ? payload.updatedInput
        : undefined,
      payload?.setMode ? String(payload.setMode) : undefined,
    );
  });

  ipcMain.handle(IPC.CHAT_SEND, async (_event, payload: { agent: 'supervisor' | 'coding'; text: string }) => {
    const agent = payload?.agent;
    const content = String(payload?.text || '').trim();
    if (!content || (agent !== 'supervisor' && agent !== 'coding')) return;

    send(IPC.LOOP_STATUS, { agent, status: 'thinking' });
    store.setStatus(agent, 'thinking');
    try {
      if (agent === 'supervisor') await supervisorLoop.handleUser(content);
      else await codingLoop.handleUser(content);
      send(IPC.LOOP_STATUS, { agent, status: 'streaming' });
    } catch (err) {
      const msg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `错误：${err instanceof Error ? err.message : String(err)}`,
        ts: Date.now(),
      };
      send(IPC.CHAT_STREAM, { agent, msg });
    } finally {
      store.setStatus(agent, 'idle');
      setTimeout(() => send(IPC.LOOP_STATUS, { agent, status: 'idle' }), 50);
    }
  });

  ipcMain.handle(IPC.PICK_FOLDER, async () => {
    if (!mainWin) return null;
    const r = await dialog.showOpenDialog(mainWin, {
      title: '选择工作文件夹',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    settings.workspacePath = r.filePaths[0];
    return settings.workspacePath;
  });

  ipcMain.handle(IPC.SET_WORKSPACE, (_e, dir: string) => {
    const next = String(dir || '').trim();
    if (!next) return false;
    settings.workspacePath = next;
    return true;
  });

  ipcMain.handle(IPC.PICK_FILES, async (_e, opts?: { defaultPath?: string; multi?: boolean }) => {
    if (!mainWin) return [] as string[];
    const r = await dialog.showOpenDialog(mainWin, {
      title: '选择文件',
      defaultPath: opts?.defaultPath || settings.workspacePath || undefined,
      properties: opts?.multi === false ? ['openFile'] : ['openFile', 'multiSelections'],
    });
    if (r.canceled || !r.filePaths.length) return [] as string[];
    return r.filePaths;
  });

  ipcMain.handle(IPC.LIST_FILES, async (_e, dir: string) => {
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      return entries.map((e) => ({
        name: e.name,
        type: e.isDirectory() ? 'dir' : 'file',
        size: 0,
      }));
    } catch {
      return [];
    }
  });

  ipcMain.handle(IPC.READ_FILE, async (_e, filePath: string) => {
    try {
      const stat = await fs.promises.stat(filePath);
      if (stat.size > 1024 * 1024) return { ok: false, error: '文件过大（>1MB）' };
      const content = await fs.promises.readFile(filePath, 'utf8');
      return { ok: true, content };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });

  ipcMain.handle(IPC.MIRROR_SNAPSHOT, () => store.getMirrorSnapshot());

  ipcMain.on(IPC.SUPERVISOR_COMMAND, (_e, cmd: SupervisorCommand) => {
    void codingLoop.handleCommand(cmd);
    send(IPC.SUPERVISOR_COMMAND, cmd);
  });

  // ---- Real terminal (PTY) ----
  const ptys = new Map<string, import('node-pty').IPty>();

  const engineCmd = (engine: string): { cmd: string; args: string[] } => {
    const e = engine.toLowerCase();
    const shell = fs.existsSync('/bin/zsh') ? '/bin/zsh' : '/bin/bash';

    // Lab supervisor terminal = interactive login shell
    if (e === 'shell' || e === 'lab' || e === 'supervisor') {
      return { cmd: shell, args: ['-il'] };
    }

    if (e === 'lab-deepseek' || e.includes('deepseek') || e === 'lab-coding') {
      const script = path.join(__dirname, 'lab-coding', 'index.js');
      const node = resolveNodeBinary();
      // Login shell so PATH matches Terminal.app (Electron GUI PATH is often empty)
      return { cmd: shell, args: ['-lc', `${shellQuote(node)} ${shellQuote(script)}`] };
    }
    if (e.includes('claude')) return { cmd: shell, args: ['-lc', 'claude'] };
    if (e.includes('codex')) return { cmd: shell, args: ['-lc', 'codex'] };
    return { cmd: shell, args: ['-il'] };
  };

  ipcMain.handle(IPC.PTY_SPAWN, (_e, payload: { id: string; engine: string; cols: number; rows: number }) => {
    const { id, engine, cols, rows } = payload;
    if (!pty) return { ok: false, error: 'node-pty 未加载（原生模块缺失）' };
    const existing = ptys.get(id);
    if (existing) {
      try { existing.kill(); } catch { /* ignore */ }
      ptys.delete(id);
    }

    const eng = engine.toLowerCase();
    if (eng === 'lab-deepseek' || eng.includes('deepseek') || eng === 'lab-coding') {
      const script = path.join(__dirname, 'lab-coding', 'index.js');
      if (!fs.existsSync(script)) {
        return { ok: false, error: `缺少 Coding 脚本：${script}（请重新 npm run desktop）` };
      }
    }

    const { cmd, args } = engineCmd(engine);
    try {
      const proc = pty.spawn(cmd, args, {
        name: 'xterm-256color',
        cols: Math.max(20, cols || 80),
        rows: Math.max(5, rows || 24),
        cwd: settings.workspacePath || app.getPath('home'),
        env: enrichedPtyEnv(),
      });
      ptys.set(id, proc);
      proc.onData((data) => send(IPC.PTY_DATA, { id, data }));
      proc.onExit(({ exitCode }) => {
        ptys.delete(id);
        send(IPC.PTY_EXIT, { id, code: exitCode });
      });
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `启动失败 (${cmd}): ${msg}` };
    }
  });

  ipcMain.on(IPC.PTY_WRITE, (_e, payload: { id: string; data: string }) => {
    ptys.get(payload.id)?.write(payload.data);
  });
  ipcMain.on(IPC.PTY_RESIZE, (_e, payload: { id: string; cols: number; rows: number }) => {
    try { ptys.get(payload.id)?.resize(Math.max(20, payload.cols), Math.max(5, payload.rows)); } catch { /* ignore */ }
  });
  ipcMain.on(IPC.PTY_KILL, (_e, payload: { id: string }) => {
    const p = ptys.get(payload.id);
    if (p) {
      try { p.kill(); } catch { /* ignore */ }
      ptys.delete(payload.id);
    }
  });
}

app.whenReady().then(() => {
  applyLabAgentEnv();

  const iconEarly = resolveAppIcon();
  applyDockIcon(iconEarly);

  const envPath = path.join(app.getAppPath(), '.env');
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*DEEPSEEK_API_KEY\s*=\s*(.+)\s*$/);
      if (m) {
        const v = m[1].replace(/^["']|["']$/g, '').trim();
        if (v) settings.deepseekApiKey = v;
      }
    }
  }

  wireLoops();
  registerIpc();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    else mainWin?.show();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
