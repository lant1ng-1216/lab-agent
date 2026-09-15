import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type AgentBridgeEvent, type AgentPromptRequest, type ChatMessage, type CodingMirrorEvent, type ListModelsRequest, type ListModelsResult, type LoopStatus, type SupervisorCommand } from '../shared/protocol';

export type AgentChannel = 'supervisor' | 'coding';

contextBridge.exposeInMainWorld('lab', {
  getRole: () => ipcRenderer.invoke(IPC.GET_ROLE) as Promise<string>,
  getSettings: () => ipcRenderer.invoke(IPC.GET_SETTINGS),
  setApiKey: (key: string) => ipcRenderer.invoke(IPC.SET_API_KEY, key),
  listModels: (payload: ListModelsRequest) =>
    ipcRenderer.invoke(IPC.LIST_MODELS, payload) as Promise<ListModelsResult>,
  agentPrompt: (payload: AgentPromptRequest) =>
    ipcRenderer.invoke(IPC.AGENT_PROMPT, payload) as Promise<{ ok: boolean; error?: string }>,
  agentCancel: (sessionKey: string, opts?: { cwd?: string; sessionId?: string; purge?: boolean }) =>
    ipcRenderer.invoke(IPC.AGENT_CANCEL, {
      sessionKey,
      cwd: opts?.cwd,
      sessionId: opts?.sessionId,
      purge: opts?.purge,
    }),
  agentPermission: (payload: {
    sessionKey: string
    requestId: string
    allow: boolean
    message?: string
    updatedInput?: Record<string, unknown>
    setMode?: string
  }) => ipcRenderer.invoke(IPC.AGENT_PERMISSION, payload) as Promise<boolean>,
  getLabEnv: () =>
    ipcRenderer.invoke(IPC.GET_LAB_ENV) as Promise<{
      ok: boolean;
      apiKey: string;
      baseUrl: string;
      model: string;
    }>,
  getInstallStatus: () =>
    ipcRenderer.invoke(IPC.GET_INSTALL_STATUS) as Promise<import('../shared/protocol').InstallStatusPayload>,
  installToStable: () =>
    ipcRenderer.invoke(IPC.INSTALL_TO_STABLE) as Promise<{ ok: boolean; error?: string; relaunchPath?: string }>,
  ensureDesktopShortcut: () =>
    ipcRenderer.invoke(IPC.ENSURE_DESKTOP_SHORTCUT) as Promise<{ ok: boolean; error?: string }>,
  onAgentEvent: (cb: (sessionKey: string, event: AgentBridgeEvent) => void) => {
    const listener = (_: Electron.IpcRendererEvent, payload: { sessionKey: string; event: AgentBridgeEvent }) =>
      cb(payload.sessionKey, payload.event);
    ipcRenderer.on(IPC.AGENT_EVENT, listener);
    return () => ipcRenderer.removeListener(IPC.AGENT_EVENT, listener);
  },
  sendChat: (agent: AgentChannel, text: string) => ipcRenderer.invoke(IPC.CHAT_SEND, { agent, text }),
  getMirrorSnapshot: () => ipcRenderer.invoke(IPC.MIRROR_SNAPSHOT) as Promise<CodingMirrorEvent[]>,
  sendCommand: (cmd: SupervisorCommand) => ipcRenderer.send(IPC.SUPERVISOR_COMMAND, cmd),
  onChatStream: (cb: (agent: AgentChannel, msg: ChatMessage) => void) => {
    const listener = (_: Electron.IpcRendererEvent, payload: { agent: AgentChannel; msg: ChatMessage }) =>
      cb(payload.agent, payload.msg);
    ipcRenderer.on(IPC.CHAT_STREAM, listener);
    return () => ipcRenderer.removeListener(IPC.CHAT_STREAM, listener);
  },
  onMirrorEvent: (cb: (ev: CodingMirrorEvent) => void) => {
    const listener = (_: Electron.IpcRendererEvent, ev: CodingMirrorEvent) => cb(ev);
    ipcRenderer.on(IPC.MIRROR_EVENT, listener);
    return () => ipcRenderer.removeListener(IPC.MIRROR_EVENT, listener);
  },
  onCommand: (cb: (cmd: SupervisorCommand) => void) => {
    const listener = (_: Electron.IpcRendererEvent, cmd: SupervisorCommand) => cb(cmd);
    ipcRenderer.on(IPC.SUPERVISOR_COMMAND, listener);
    return () => ipcRenderer.removeListener(IPC.SUPERVISOR_COMMAND, listener);
  },
  onLoopStatus: (cb: (agent: AgentChannel, status: LoopStatus) => void) => {
    const listener = (_: Electron.IpcRendererEvent, payload: { agent: AgentChannel; status: LoopStatus }) =>
      cb(payload.agent, payload.status);
    ipcRenderer.on(IPC.LOOP_STATUS, listener);
    return () => ipcRenderer.removeListener(IPC.LOOP_STATUS, listener);
  },

  // ---- Real terminal (PTY) ----
  ptySpawn: (id: string, engine: string, cols: number, rows: number) =>
    ipcRenderer.invoke(IPC.PTY_SPAWN, { id, engine, cols, rows }),
  ptyWrite: (id: string, data: string) => ipcRenderer.send(IPC.PTY_WRITE, { id, data }),
  ptyResize: (id: string, cols: number, rows: number) => ipcRenderer.send(IPC.PTY_RESIZE, { id, cols, rows }),
  ptyKill: (id: string) => ipcRenderer.send(IPC.PTY_KILL, { id }),
  pickFolder: () => ipcRenderer.invoke(IPC.PICK_FOLDER) as Promise<string | null>,
  setWorkspace: (dir: string) => ipcRenderer.invoke(IPC.SET_WORKSPACE, dir) as Promise<boolean>,
  pickFiles: (opts?: { defaultPath?: string; multi?: boolean }) =>
    ipcRenderer.invoke(IPC.PICK_FILES, opts) as Promise<string[]>,
  listFiles: (dir: string) => ipcRenderer.invoke(IPC.LIST_FILES, dir) as Promise<{ name: string; type: string; size: number }[]>,
  readFile: (path: string) => ipcRenderer.invoke(IPC.READ_FILE, path) as Promise<{ ok: boolean; content?: string; error?: string }>,
  onPtyData: (cb: (id: string, data: string) => void) => {
    const listener = (_: Electron.IpcRendererEvent, payload: { id: string; data: string }) => cb(payload.id, payload.data);
    ipcRenderer.on(IPC.PTY_DATA, listener);
    return () => ipcRenderer.removeListener(IPC.PTY_DATA, listener);
  },
  onPtyExit: (cb: (id: string, code: number) => void) => {
    const listener = (_: Electron.IpcRendererEvent, payload: { id: string; code: number }) => cb(payload.id, payload.code);
    ipcRenderer.on(IPC.PTY_EXIT, listener);
    return () => ipcRenderer.removeListener(IPC.PTY_EXIT, listener);
  },
});
