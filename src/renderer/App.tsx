import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, CodingMirrorEvent, LoopStatus, SupervisorCommand, AgentToolTrace } from "@shared/protocol";
import CanvasFlow, { type AgentState } from "./canvas/CanvasFlow";
import type { LabNodeKind } from "./canvas/LabNode";
import FileTree from "./components/FileTree";
import Composer from "./components/Composer";
import NormalChatView from "./components/NormalChatView";
import { SectionTokenMeter } from "./components/TokenUsageMeter";
import FileWorkspaceSidebar, {
  FILE_SIDEBAR_DEFAULT_WIDTH,
} from "./components/FileWorkspaceSidebar";
import type { FilePreviewPayload } from "./components/FileInspectSidebar";
import { pushFileRecent } from "./lib/fileRecents";
import ShellModeToggle from "./components/ShellModeToggle";
import WorkspacePicker from "./components/WorkspacePicker";
import ThinkingAdapter from "./components/ThinkingAdapter";
import NoticeStack, { type NoticeIcon, type NoticeItem } from "./components/NoticeStack";
import LineFaceAvatar, { newAvatarSeed } from "./components/LineFaceAvatar";
import MarkdownBody from "./components/MarkdownBody";
import { loadWorkdirRecents, pushWorkdirRecent, removeWorkdirRecent, workdirLabel } from "./lib/workdirRecents";
import SidebarSessionList from "./components/SidebarSessionList";
import { hasLabBridge, LAB_PREVIEW_HINT } from "./lib/labBridge";
import { applyAgentEvent, commitStreamingReveal, toolsToThinkingRows } from "./lib/agentTurn";
import { addUsageToTotals } from "./lib/tokenUsage";
import {
  applyAppearanceToDocument,
  loadAppearance,
  resetAppearanceToDefaults,
  saveAppearance,
  type AppearanceState,
  type ColorMode,
} from "./lib/appearance";
import AppearancePickCards from "./components/AppearancePickCards";

const SkinAtmosphere = lazy(() => import("./skin/SkinAtmosphere"));

import {
  loadSessionBucket,
  saveSessionBucket,
  interruptAgentState,
  type Experiment,
  type ShellMode,
} from "./lib/sessionStores";
import {
  API_PROVIDER_PRESETS,
  CHAT_MODEL_KEY,
  detectProvider,
  loadChatModelKey,
  loadCustomApi,
  mapModelsResponse,
  presetForBaseUrl,
  prettifyModelId,
  saveCustomApi,
  type ApiProviderPresetId,
  type CustomApiConfig,
} from "./lib/chatModels";
import {
  loadPermissionMode,
  savePermissionMode,
  type PermissionModeId,
} from "./lib/permissionModes";
import PermissionModal, { type PermissionAction } from "./components/PermissionModal";
import labAgentIcon from "./assets/brands/labagent-icon.png";
import StreamingText from "./harness/beautiful-ui/StreamingText";
import LoadingState from "./harness/beautiful-ui/LoadingState";
import { ApprovalPanel, AssistantBlock, ToolRow, UserBubble } from "@harness";

const SIDEBAR_KEY = "lab.sidebar.width";
const SIDEBAR_MIN = 220;
const SIDEBAR_MAX = 360;
const SIDEBAR_RAIL = 56;

const INSPECTOR_KEY = "lab.inspector.width";
const INSPECTOR_MIN = 320;
const INSPECTOR_MAX = 640;

const FILE_SIDE_KEY = "lab.fileSide.width";
const FILE_SIDE_MIN = 340;
const FILE_SIDE_MAX = 640;

const PROFILE_KEY = "lab.profile.v1";
const SHELL_MODE_KEY = "lab.shellMode";
const DEFAULT_AVATAR_SEED = "lab-guest";

function loadShellMode(): ShellMode {
  try {
    const v = localStorage.getItem(SHELL_MODE_KEY);
    if (v === "normal" || v === "supervisor") return v;
  } catch {}
  return "normal";
}

interface LocalProfile {
  displayName: string;
  avatarSeed: string;
}

function loadProfile(): LocalProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return { displayName: "", avatarSeed: DEFAULT_AVATAR_SEED };
    const d = JSON.parse(raw);
    return {
      displayName: typeof d.displayName === "string" ? d.displayName : "",
      avatarSeed: typeof d.avatarSeed === "string" && d.avatarSeed ? d.avatarSeed : DEFAULT_AVATAR_SEED,
    };
  } catch {
    return { displayName: "", avatarSeed: DEFAULT_AVATAR_SEED };
  }
}

interface Engine {
  id: string;
  name: string;
  color: string;
  abbr: string;
  preset: boolean;
}
const ENGINES: Engine[] = [
  { id: "lab-deepseek", name: "Lab Coding", color: "#3b82f6", abbr: "L", preset: false },
  { id: "claude-code", name: "Claude Code", color: "#d97757", abbr: "C", preset: true },
  { id: "codex", name: "Codex", color: "#10a37f", abbr: "Cx", preset: true },
  { id: "cursor", name: "Cursor", color: "#8b5cf6", abbr: "Cu", preset: true },
  { id: "opencode", name: "OpenCode", color: "#64748b", abbr: "O", preset: true },
];

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(v)));
}

function readNum(key: string, fallback: number, min: number, max: number) {
  try {
    const raw = localStorage.getItem(key);
    const n = raw != null ? Number(raw) : fallback;
    return Number.isFinite(n) ? clamp(n, min, max) : fallback;
  } catch {
    return fallback;
  }
}

function initialLab(): AgentState {
  return { status: "idle", messages: [], streaming: null, mirror: [], approval: null, tools: [] };
}

function initialCoding(engine: string): AgentState {
  return { status: "idle", messages: [], streaming: null, commands: [], mirror: [], tools: [], engine };
}

function makeExperiment(n: number, engine: string, shellMode: ShellMode = "supervisor"): Experiment {
  const isNormal = shellMode === "normal";
  return {
    id: `exp-${Date.now()}`,
    name: isNormal ? `对话 ${n}` : `实验 ${n}`,
    ts: Date.now(),
    workdir: null,
    nodes: [],
    lab: initialLab(),
    coding: initialCoding(engine),
  };
}

export default function App() {
  const [appearance, setAppearance] = useState<AppearanceState>(() => loadAppearance());
  const theme = appearance.mode;
  const setTheme = (next: ColorMode | ((prev: ColorMode) => ColorMode)) => {
    setAppearance((a) => {
      const mode = typeof next === "function" ? next(a.mode) : next;
      return { ...a, mode };
    });
  };
  const [sidebarW, setSidebarW] = useState(() => readNum(SIDEBAR_KEY, 248, SIDEBAR_MIN, SIDEBAR_MAX));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState<LocalProfile>(() => loadProfile());
  const [profileDraft, setProfileDraft] = useState<LocalProfile>(() => loadProfile());
  const [engine, setEngine] = useState<string>("lab-deepseek");
  const [chatModel, setChatModel] = useState<string>(() => {
    const api = loadCustomApi();
    return loadChatModelKey(api.models);
  });
  const [permissionMode, setPermissionMode] = useState<PermissionModeId>(() => loadPermissionMode());
  const [shellMode, setShellMode] = useState<ShellMode>(() => loadShellMode());
  const [apiKey, setApiKey] = useState("");
  const [customApiOpen, setCustomApiOpen] = useState(false);
  const [customApi, setCustomApi] = useState<CustomApiConfig>(() => loadCustomApi());
  const [customApiDraft, setCustomApiDraft] = useState<CustomApiConfig>(() => loadCustomApi());
  const [apiPreset, setApiPreset] = useState<ApiProviderPresetId>(() =>
    presetForBaseUrl(loadCustomApi().baseUrl),
  );
  const [fetchingModels, setFetchingModels] = useState(false);

  const initialMode = useRef(loadShellMode());
  const persisted = useRef(loadSessionBucket(initialMode.current));
  const [experiments, setExperiments] = useState<Experiment[]>(persisted.current.experiments);
  const [activeExp, setActiveExp] = useState<string | null>(persisted.current.activeId);
  const isNormal = shellMode === "normal";

  const [target, setTarget] = useState<LabNodeKind>("lab");
  const [inspector, setInspector] = useState<LabNodeKind | null>(null);
  const [inspectorTab, setInspectorTab] = useState<"chat" | "output" | "files">("chat");
  const [inspectorW, setInspectorW] = useState(() => readNum(INSPECTOR_KEY, 400, INSPECTOR_MIN, INSPECTOR_MAX));
  const [filePreview, setFilePreview] = useState<FilePreviewPayload | null>(null);
  const [fileSideOpen, setFileSideOpen] = useState(false);
  const [fileSideW, setFileSideW] = useState(() =>
    readNum(FILE_SIDE_KEY, FILE_SIDEBAR_DEFAULT_WIDTH, FILE_SIDE_MIN, FILE_SIDE_MAX),
  );
  const [composerMode, setComposerMode] = useState<"chat" | "term">("chat");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [intervention, setIntervention] = useState<{ kind: LabNodeKind; type: "confirm" | "select" | "input"; prompt: string; options?: string[] } | null>(null);
  const [workdirRecents, setWorkdirRecents] = useState<string[]>(() => loadWorkdirRecents());
  /** Single source of truth for current workspace (sidebar + composer + tools). */
  const [activeWorkspace, setActiveWorkspace] = useState<string | null>(() => {
    const id = persisted.current.activeId;
    const e = persisted.current.experiments.find((x) => x.id === id);
    return e?.workdir ?? null;
  });

  const resizingSide = useRef<{ startX: number; startW: number } | null>(null);
  const resizingInsp = useRef<{ startX: number; startW: number } | null>(null);
  const draftHistory = useRef<string[]>([]);

  const exp = useMemo(() => experiments.find((e) => e.id === activeExp) ?? null, [experiments, activeExp]);
  const lab = exp?.lab ?? initialLab();
  const coding = exp?.coding ?? initialCoding(engine);
  const nodes = exp?.nodes ?? [];

  const turnToolTraces = useMemo(() => {
    const msgs = coding.messages;
    let start = 0;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i]?.role === "user") {
        start = i;
        break;
      }
    }
    const archived: AgentToolTrace[] = [];
    for (let i = start; i < msgs.length; i++) {
      const t = msgs[i]?.tools;
      if (t?.length) archived.push(...t);
    }
    return [...archived, ...(coding.tools ?? []), ...(coding.streaming?.tools ?? [])];
  }, [coding.messages, coding.tools, coding.streaming?.tools]);

  const patchExp = useCallback((id: string, patch: Partial<Experiment>) => {
    setExperiments((xs) => xs.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  const setLab = useCallback((fn: (s: AgentState) => AgentState) => {
    setExperiments((xs) => xs.map((e) => (e.id === activeExp ? { ...e, lab: fn(e.lab) } : e)));
  }, [activeExp]);
  const setCoding = useCallback((fn: (s: AgentState) => AgentState) => {
    setExperiments((xs) => xs.map((e) => (e.id === activeExp ? { ...e, coding: fn(e.coding) } : e)));
  }, [activeExp]);

  const inferToastIcon = (msg: string): NoticeIcon => {
    if (/失败|错误|不可|请先|先选择|取消/.test(msg)) return "warning";
    if (/新对话|新实验|^已/.test(msg) || /已[删除选择添加保存切换开信任清空撤回拉取切]/.test(msg)) return "check";
    if (/工作区|目录|文件夹/.test(msg)) return "folder";
    return "info";
  };

  /** Light tips only → NoticeStack (does not touch work/approval modals). */
  const showToast = useCallback((msg: string, opts?: { icon?: NoticeIcon; body?: string }) => {
    const title = msg.trim();
    if (!title) return;
    const id = `n-toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const icon = opts?.icon ?? inferToastIcon(title);
    setNotices((xs) => [...xs.slice(-3), { id, title, body: opts?.body, icon }]);
    window.setTimeout(() => {
      setNotices((xs) => xs.filter((n) => n.id !== id));
    }, 2600);
  }, []);

  const desktopReady = hasLabBridge();

  useEffect(() => {
    if (!desktopReady) {
      showToast(LAB_PREVIEW_HINT);
    }
  }, [desktopReady, showToast]);

  // Cold-start: mount main cwd to active workspace
  useEffect(() => {
    if (!desktopReady || !activeWorkspace) return;
    void window.lab?.setWorkspace(activeWorkspace);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on bridge ready
  }, [desktopReady]);

  // Seed shell Custom API from agents/lab-coding/lab-agent.env (once).
  useEffect(() => {
    if (!desktopReady || !window.lab?.getLabEnv) return;
    let cancelled = false;
    void (async () => {
      const existing = loadCustomApi();
      const env = await window.lab.getLabEnv();
      if (cancelled || !env.ok || !env.apiKey) return;

      const baseUrl = (existing.baseUrl || env.baseUrl || "https://api.deepseek.com").replace(/\/+$/, "");
      const apiKey = existing.apiKey || env.apiKey;
      const provider = detectProvider(baseUrl);
      let models = existing.models;

      if (!models.length && env.model) {
        models = [{ id: env.model, name: prettifyModelId(env.model), provider }];
      }

      try {
        const res = await window.lab.listModels({ baseUrl, apiKey });
        if (res.ok && res.models?.length) {
          models = mapModelsResponse({ data: res.models }, provider);
        }
      } catch {
        /* keep env model fallback */
      }

      if (cancelled) return;
      const next: CustomApiConfig = { baseUrl, apiKey, provider, models };
      saveCustomApi(next);
      setCustomApi(next);
      setCustomApiDraft(next);
      void window.lab.setApiKey(apiKey);
      const preferred = loadChatModelKey(models) || env.model || models[0]?.id || "";
      if (preferred) setChatModel(preferred);
      if (!existing.apiKey) showToast("已从 lab-agent.env 载入 API");
    })();
    return () => {
      cancelled = true;
    };
  }, [desktopReady, showToast]);

  const ENGINE_BRAND_BY_ID: Record<string, string> = {
    "lab-deepseek": "lab-coding",
    "claude-code": "claude",
    codex: "openai",
    cursor: "cursor",
    opencode: "opencode",
  };

  const pushEnginePendingNotice = useCallback((name: string, engineId?: string) => {
    const id = `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const brand =
      (engineId && ENGINE_BRAND_BY_ID[engineId]) ||
      (name.includes("Claude") ? "claude" : name.includes("Codex") ? "openai" : name.includes("Cursor") ? "cursor" : name.includes("OpenCode") ? "opencode" : undefined);
    setNotices((xs) => [...xs.slice(-3), { id, title: name, body: "开发中 / 连接中 — 暂未接入，接入后可真嵌官方 CLI。", brand }]);
    window.setTimeout(() => {
      setNotices((xs) => xs.filter((n) => n.id !== id));
    }, 3800);
  }, []);

  const pushModeNotice = useCallback((mode: ShellMode) => {
    const id = `n-mode-${Date.now()}`;
    const item =
      mode === "normal"
        ? {
            id,
            title: "Lab Agent",
            body: "已切换到常规态 · 单 Agent 工作台",
            brand: "lab-coding",
          }
        : {
            id,
            title: "监工态",
            body: "概念预览 · 暂不可用 — 双 Agent 工作台形态展示中，正式能力后续开放。",
            brand: "lab-coding",
          };
    setNotices((xs) => [...xs.slice(-3), item]);
    window.setTimeout(() => {
      setNotices((xs) => xs.filter((n) => n.id !== id));
    }, 3800);
  }, []);

  const dismissNotice = useCallback((id: string) => {
    setNotices((xs) => xs.filter((n) => n.id !== id));
  }, []);


  // appearance — pack + day/night (default pack == today's light/dark tokens)
  useEffect(() => {
    applyAppearanceToDocument(appearance);
    saveAppearance(appearance);
  }, [appearance]);

  // persist sidebar/inspector width
  useEffect(() => { try { localStorage.setItem(SIDEBAR_KEY, String(sidebarW)); } catch {} }, [sidebarW]);
  useEffect(() => { try { localStorage.setItem(INSPECTOR_KEY, String(inspectorW)); } catch {} }, [inspectorW]);
  useEffect(() => { try { localStorage.setItem(FILE_SIDE_KEY, String(fileSideW)); } catch {} }, [fileSideW]);

  useEffect(() => {
    setFilePreview(null);
  }, [activeExp]);

  const onFilePreview = useCallback((preview: FilePreviewPayload) => {
    setFilePreview(preview);
    setFileSideOpen(true);
    if (activeExp && preview.path) pushFileRecent(activeExp, preview.path);
  }, [activeExp]);
  useEffect(() => { try { localStorage.setItem(SHELL_MODE_KEY, shellMode); } catch {} }, [shellMode]);
  useEffect(() => { try { localStorage.setItem(CHAT_MODEL_KEY, chatModel); } catch {} }, [chatModel]);
  useEffect(() => { savePermissionMode(permissionMode); }, [permissionMode]);

  const toggleShellMode = () => {
    const next: ShellMode = shellMode === "normal" ? "supervisor" : "normal";
    if (shellMode === "normal" && activeExp) {
      void window.lab?.agentCancel(activeExp);
    }
    // Flush current bucket, then load the other — sessions never mix.
    saveSessionBucket(shellMode, { experiments, activeId: activeExp });
    const other = loadSessionBucket(next);
    setExperiments(other.experiments);
    setActiveExp(other.activeId);
    setInspector(null);
    setTarget(next === "normal" ? "coding" : "lab");
    setDeleteConfirm(null);
    setRenaming(null);
    setShellMode(next);
    pushModeNotice(next);
  };

  // persist experiments into the active mode bucket only (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      saveSessionBucket(shellMode, { experiments, activeId: activeExp });
    }, 500);
    return () => clearTimeout(timer);
  }, [experiments, activeExp, shellMode]);

  // sync engine into coding state
  useEffect(() => {
    if (!activeExp) return;
    setCoding((s) => ({ ...s, engine }));
  }, [engine, activeExp, setCoding]);

  // IPC wiring
  useEffect(() => {
    const bridge = window.lab;
    if (!bridge) return;
    void bridge.getMirrorSnapshot().then((mirror) => setLab((s) => ({ ...s, mirror })));

    const offChat = bridge.onChatStream((agent, msg) => {
      const kind: LabNodeKind = agent === "supervisor" ? "lab" : "coding";
      if (msg.role === "user") return;
      const set = kind === "lab" ? setLab : setCoding;
      set((s) => ({ ...s, streaming: msg, status: "streaming" }));
      setTimeout(() => {
        set((s) => {
          if (!s.streaming || s.streaming.id !== msg.id) return s;
          const isApproval = /确认|PRD|验收|打回|偏离|派发/.test(msg.content);
          return {
            ...s,
            streaming: null,
            messages: [...s.messages, msg],
            status: "idle",
            approval: kind === "lab" && isApproval ? { headline: "确认后派发 Coding", detail: msg.content.slice(0, 320) } : s.approval,
          };
        });
      }, 650);
    });

    const offMirror = bridge.onMirrorEvent((ev: CodingMirrorEvent) => {
      setLab((s) => ({ ...s, mirror: [ev, ...(s.mirror ?? [])].slice(0, 30) }));
    });
    const offCmd = bridge.onCommand((cmd: SupervisorCommand) => {
      setCoding((s) => ({ ...s, commands: [cmd, ...(s.commands ?? [])].slice(0, 20) }));
    });
    const offStatus = bridge.onLoopStatus((agent, status: LoopStatus) => {
      const kind: LabNodeKind = agent === "supervisor" ? "lab" : "coding";
      const set = kind === "lab" ? setLab : setCoding;
      set((s) => ({ ...s, status }));
    });

    const offAgent = bridge.onAgentEvent?.((sessionKey, event) => {
      setExperiments((xs) =>
        xs.map((e) => {
          if (e.id !== sessionKey) return e;
          const coding = applyAgentEvent(e.coding, event);
          let engineSessionId = e.engineSessionId;
          let tokenTotals = e.tokenTotals;
          let lastTurnUsage = e.lastTurnUsage;
          if (event.kind === "result" && event.sessionId) {
            engineSessionId = event.sessionId;
          } else if (event.kind === "error" && /无法续聊/.test(event.text)) {
            engineSessionId = null;
          }
          if (event.kind === "result" && event.usage) {
            tokenTotals = addUsageToTotals(e.tokenTotals, event.usage);
            lastTurnUsage = event.usage;
          }
          return { ...e, coding, engineSessionId, tokenTotals, lastTurnUsage };
        }),
      );
    });

    return () => {
      offChat();
      offMirror();
      offCmd();
      offStatus();
      offAgent?.();
    };
  }, [setLab, setCoding]);

  const sendTo = (kind: LabNodeKind, text: string) => {
    if (!activeExp) return;
    const agent = kind === "lab" ? "supervisor" : "coding";
    const userMsg: ChatMessage = { id: `u-${Date.now()}-${kind}`, role: "user", content: text, ts: Date.now() };
    const set = kind === "lab" ? setLab : setCoding;
    set((s) => ({ ...s, messages: [...s.messages, userMsg], status: "thinking" }));
    draftHistory.current.unshift(text);
    void window.lab?.sendChat(agent, text);
  };

  const handleApproval = (action: "approve" | "reject", detail: string) => {
    const cmd: SupervisorCommand = { id: `cmd-${Date.now()}`, type: action === "approve" ? "instruction" : "reject", payload: detail, ts: Date.now() };
    window.lab?.sendCommand(cmd);
    setLab((s) => ({ ...s, approval: null }));
  };

  // PTY output intervention detection
  useEffect(() => {
    const bridge = window.lab;
    if (!bridge?.onPtyData) return;
    const off = bridge.onPtyData((id, data) => {
      const kind = id as LabNodeKind;
      const text = data.replace(/\x1b\[[0-9;]*m/g, ""); // strip ANSI
      // permission confirm: [Y/n], Allow?, Proceed?, (y/n)
      if (/\[(Y|y)\/(N|n)\]|Allow\?|Proceed\?|Continue\?|\(y\/n\)/i.test(text)) {
        setIntervention({ kind, type: "confirm", prompt: text.split("\n").filter(Boolean).pop() ?? text.slice(-120) });
        return;
      }
      // numbered options: "1. xxx\n2. yyy" pattern
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      const optLines = lines.filter((l) => /^\d+[.)]\s+\S/.test(l));
      if (optLines.length >= 2) {
        setIntervention({ kind, type: "select", prompt: lines[0] ?? "请选择：", options: optLines });
        return;
      }
      // input prompt: "Enter ...:" or "...: " ending
      if (/[:：]\s*$/.test(text) && text.length < 200) {
        setIntervention({ kind, type: "input", prompt: text.split("\n").filter(Boolean).pop() ?? "输入：" });
      }
    });
    return off;
  }, []);

  const handleIntervention = (value: string) => {
    if (!intervention) return;
    window.lab?.ptyWrite(intervention.kind, value + "\n");
    setIntervention(null);
  };

  const sameWorkdir = (a: string | null | undefined, b: string) => {
    if (!a) return false;
    const norm = (p: string) => p.replace(/[/\\]+$/, "");
    return norm(a) === norm(b);
  };

  /**
   * Dual entry: sidebar / composer both call this.
   * - Draft (no active session): only bind workspace — stay on empty new-chat.
   * - Viewing a session: switch to latest session in that workspace, or draft bound to it.
   */
  const selectWorkspace = (dir: string, opts?: { toast?: string }) => {
    pushWorkdirRecent(dir);
    setWorkdirRecents(loadWorkdirRecents());
    setActiveWorkspace(dir);
    void window.lab?.setWorkspace(dir);

    if (!activeExp) {
      // Problem 2: draft empty → only sync bind, do not insert a session
      showToast(opts?.toast ?? `已选择工作区：${workdirLabel(dir)}`);
      return;
    }

    const current = experiments.find((e) => e.id === activeExp);
    if (current && sameWorkdir(current.workdir, dir)) {
      showToast(opts?.toast ?? `当前工作区：${workdirLabel(dir)}`);
      return;
    }

    const inWs = experiments
      .filter((e) => !e.archived && sameWorkdir(e.workdir, dir))
      .sort((a, b) => b.ts - a.ts);
    window.lab?.ptyKill("lab");
    window.lab?.ptyKill("coding");
    setInspector(null);
    setTarget(isNormal ? "coding" : "lab");
    if (inWs[0]) {
      setActiveExp(inWs[0].id);
    } else {
      // No session in this workspace → bound draft (still no list row until first send)
      setActiveExp(null);
    }
    showToast(opts?.toast ?? `当前工作区：${workdirLabel(dir)}`);
  };

  const addWorkspace = (dir: string) => {
    selectWorkspace(dir, { toast: `已添加工作区：${workdirLabel(dir)}` });
  };

  /** Global New Chat (A1): unbound draft — no sidebar row, no folder highlight. */
  const startNewChat = () => {
    window.lab?.ptyKill("lab");
    window.lab?.ptyKill("coding");
    setActiveExp(null);
    setActiveWorkspace(null);
    setInspector(null);
    setTarget(isNormal ? "coding" : "lab");
    showToast(isNormal ? "新对话" : "新实验", { icon: "check" });
  };

  /** Folder-row +: draft pre-bound to that workspace — still no list row until send. */
  const startNewChatInWorkspace = (dir: string) => {
    window.lab?.ptyKill("lab");
    window.lab?.ptyKill("coding");
    pushWorkdirRecent(dir);
    setWorkdirRecents(loadWorkdirRecents());
    setActiveExp(null);
    setActiveWorkspace(dir);
    setInspector(null);
    setTarget(isNormal ? "coding" : "lab");
    void window.lab?.setWorkspace(dir);
    showToast(`新对话 · ${workdirLabel(dir)}`, { icon: "check" });
  };

  const switchExperiment = (id: string) => {
    if (id === activeExp) return;
    window.lab?.ptyKill("lab");
    window.lab?.ptyKill("coding");
    setActiveExp(id);
    setInspector(null);
    setTarget(isNormal ? "coding" : "lab");
    const next = experiments.find((x) => x.id === id);
    if (next?.workdir) {
      setActiveWorkspace(next.workdir);
      void window.lab?.setWorkspace(next.workdir);
    }
  };

  const deleteExperiment = (id: string) => {
    const target = experiments.find((e) => e.id === id);
    void window.lab?.agentCancel(id, {
      cwd: target?.workdir ?? undefined,
      sessionId: target?.engineSessionId ?? undefined,
      purge: true,
    });
    if (id === activeExp) {
      window.lab?.ptyKill("lab");
      window.lab?.ptyKill("coding");
    }
    setExperiments((xs) => {
      const rest = xs.filter((e) => e.id !== id);
      if (activeExp === id) {
        const next = rest[0] ?? null;
        setActiveExp(next?.id ?? null);
        if (next?.workdir) {
          setActiveWorkspace(next.workdir);
          void window.lab?.setWorkspace(next.workdir);
        }
      }
      return rest;
    });
    setDeleteConfirm(null);
    showToast(isNormal ? "已删除对话" : "已删除实验");
  };

  const renameExperiment = (id: string, name: string) => {
    const n = name.trim();
    if (n) patchExp(id, { name: n });
    setRenaming(null);
  };

  /** Remove workspace + cascade-delete every session under it. */
  const removeWorkspace = (dir: string) => {
    const label = workdirLabel(dir);
    const victims = experiments.filter((e) => sameWorkdir(e.workdir, dir));
    const ok = window.confirm(
      victims.length > 0
        ? `移除工作区「${label}」将删除其下 ${victims.length} 个会话，不可恢复。确定？`
        : `确定移除工作区「${label}」？`,
    );
    if (!ok) return;

    for (const e of victims) {
      void window.lab?.agentCancel(e.id, {
        cwd: e.workdir ?? undefined,
        sessionId: e.engineSessionId ?? undefined,
        purge: true,
      });
    }
    if (victims.some((e) => e.id === activeExp)) {
      window.lab?.ptyKill("lab");
      window.lab?.ptyKill("coding");
    }
    const survivors = experiments.filter((e) => !sameWorkdir(e.workdir, dir));
    setExperiments(() => {
      if (victims.some((e) => e.id === activeExp)) {
        const next = survivors[0] ?? null;
        setActiveExp(next?.id ?? null);
      }
      return survivors;
    });
    const left = removeWorkdirRecent(dir);
    setWorkdirRecents(left);
    if (activeWorkspace && sameWorkdir(activeWorkspace, dir)) {
      const fallback = left[0] ?? survivors.find((e) => e.workdir)?.workdir ?? null;
      setActiveWorkspace(fallback);
      if (fallback) void window.lab?.setWorkspace(fallback);
    }
    showToast(
      victims.length > 0
        ? `已移除工作区 ${label}（含 ${victims.length} 个会话）`
        : `已移除工作区 ${label}`,
    );
  };

  const pickFolder = async (mode: "add-workspace" | "select-workspace" = "add-workspace") => {
    if (!hasLabBridge()) {
      showToast(LAB_PREVIEW_HINT);
      return;
    }
    try {
      const dir = await window.lab.pickFolder();
      if (!dir) {
        showToast("已取消选择目录");
        return;
      }
      if (mode === "add-workspace") addWorkspace(dir);
      else selectWorkspace(dir);
    } catch (err) {
      showToast(`选目录失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const addNode = (kind: LabNodeKind) => {
    // Empty home: creating an Agent auto-opens an experiment first.
    if (!activeExp || !experiments.some((e) => e.id === activeExp)) {
      if (!activeWorkspace) {
        showToast("请先选择或添加工作区");
        return;
      }
      const e = makeExperiment(experiments.length + 1, engine, shellMode);
      e.nodes = [kind];
      e.workdir = activeWorkspace;
      setExperiments((xs) => [e, ...xs]);
      setActiveExp(e.id);
      setTarget(kind);
      void window.lab?.setWorkspace(activeWorkspace);
      showToast(`已开「${e.name}」并添加 Agent`);
      return;
    }
    setExperiments((xs) =>
      xs.map((e) => {
        if (e.id !== activeExp) return e;
        if (e.nodes.includes(kind)) return e;
        return { ...e, nodes: [...e.nodes, kind] };
      }),
    );
  };

  const removeNode = (kind: LabNodeKind) => {
    if (!activeExp) return;
    setExperiments((xs) =>
      xs.map((e) => (e.id === activeExp ? { ...e, nodes: e.nodes.filter((n) => n !== kind) } : e)),
    );
    if (inspector === kind) setInspector(null);
    window.lab?.ptyKill(kind);
  };

  // composer
  const activeState = isNormal ? coding : target === "lab" ? lab : coding;
  const dockBusy =
    activeState.status === "thinking" ||
    activeState.status === "streaming" ||
    activeState.status === "tool" ||
    activeState.status === "waiting" ||
    Boolean(activeState.streaming && !activeState.streamComplete) ||
    Boolean(coding.permission);
  const dockSend = (
    text: string,
    attachments?: string[],
    opts?: { replaceUserId?: string },
  ) => {
    if (!isNormal) {
      showToast("监工态为概念预览 · 暂不可用");
      return;
    }
    const parts = [text.trim()];
    if (attachments?.length) {
      parts.push("", "[附件]", ...attachments.map((a) => `- ${a}`));
    }
    const payload = parts.filter((p, i) => p.length > 0 || i === 0).join("\n").trim();
    if (!payload) return;

    const kind: LabNodeKind = "coding";
    const workdir = activeWorkspace;
    if (!workdir) {
      showToast("请先选择或添加工作区");
      return;
    }

    let existing = activeExp ? experiments.find((e) => e.id === activeExp) : null;
    // Plan A: never send under a foreign session cwd — open/create in active workspace
    if (existing && !sameWorkdir(existing.workdir, workdir)) {
      existing = null;
    }

    const replaceUserId = opts?.replaceUserId ?? null;
    const msgs = existing?.coding.messages ?? [];
    let cutBeforeUserText: string | undefined;
    let resumeSessionAt: string | undefined =
      existing?.engineResumeAt?.trim() || undefined;

    if (replaceUserId) {
      const idx = msgs.findIndex((m) => m.id === replaceUserId);
      if (idx >= 0) {
        cutBeforeUserText = msgs[idx].content;
        const kept = msgs.slice(0, idx);
        for (let i = kept.length - 1; i >= 0; i--) {
          const u = kept[i].engineUuid?.trim();
          if (u) {
            resumeSessionAt = u;
            break;
          }
        }
        if (!resumeSessionAt) cutBeforeUserText = msgs[idx].content;
      }
    } else if (!resumeSessionAt && existing?.engineCutBefore) {
      cutBeforeUserText = existing.engineCutBefore;
    }

    const truncating = Boolean(replaceUserId || resumeSessionAt || cutBeforeUserText);

    const userMsg: ChatMessage = { id: `u-${Date.now()}-${kind}`, role: "user", content: payload, ts: Date.now() };

    let expId = existing?.id ?? null;
    if (!expId) {
      const e = makeExperiment(experiments.length + 1, engine, shellMode);
      expId = e.id;
      setExperiments((xs) => [{
        ...e,
        workdir,
        coding: {
          ...e.coding,
          messages: [userMsg],
          status: "thinking" as const,
          streaming: null,
          tools: [],
          permission: null,
          thinkingText: undefined,
          statusLabel: "Lab Code 启动中…",
        },
      }, ...xs]);
      setActiveExp(e.id);
      setTarget(kind);
    } else {
      setCoding((s) => {
        const base =
          s.streaming && s.streamComplete ? commitStreamingReveal(s) : s.streaming ? commitStreamingReveal({ ...s, streamComplete: true }) : s;
        let prior = base.messages;
        if (replaceUserId) {
          const idx = prior.findIndex((m) => m.id === replaceUserId);
          if (idx >= 0) prior = prior.slice(0, idx);
        }
        return {
          ...base,
          messages: [...prior, userMsg],
          status: "thinking",
          streaming: null,
          streamComplete: false,
          tools: [],
          permission: null,
          thinkingText: undefined,
          statusLabel: truncating ? "在记忆节点处续写…" : "继续对话…",
        };
      });
    }

    const prevSessionId = existing?.engineSessionId ?? undefined;

    draftHistory.current.unshift(payload);
    const model = chatModel && chatModel !== "__add_api__" ? chatModel : undefined;

    void (async () => {
      // Soft stop live process so spawn can apply --resume-session-at; never purge on edit
      if (truncating && expId) {
        await window.lab?.agentCancel(expId, {
          cwd: workdir,
          sessionId: prevSessionId,
          purge: false,
        });
        patchExp(expId, { engineResumeAt: null, engineCutBefore: null });
      } else if (expId && (existing?.engineResumeAt || existing?.engineCutBefore)) {
        patchExp(expId, { engineResumeAt: null, engineCutBefore: null });
      }
      const res = await window.lab?.agentPrompt({
        sessionKey: expId!,
        cwd: workdir,
        prompt: payload,
        sessionId: prevSessionId,
        resumeSessionAt,
        cutBeforeUserText,
        model,
        permissionMode,
        apiKey: customApi.apiKey || undefined,
        baseUrl: customApi.baseUrl || undefined,
      });
      if (res && !res.ok) {
        showToast(res.error || "Agent 启动失败");
        setExperiments((xs) =>
          xs.map((e) =>
            e.id === expId
              ? {
                  ...e,
                  coding: applyAgentEvent(e.coding, { kind: "error", text: res.error || "Agent 启动失败" }),
                }
              : e,
          ),
        );
      }
    })();
  };

  const resendFromUser = (userId: string, text: string) => {
    dockSend(text, undefined, { replaceUserId: userId });
  };

  const withdrawUser = (userId: string) => {
    if (!activeExp) return;
    const existing = experiments.find((e) => e.id === activeExp);
    const workdir = existing?.workdir ?? null;
    const sid = existing?.engineSessionId ?? undefined;
    const msgs = existing?.coding.messages ?? [];
    const idx = msgs.findIndex((m) => m.id === userId);
    if (idx < 0) return;
    const withdrawn = msgs[idx];
    const kept = msgs.slice(0, idx);
    let tip: string | null = null;
    for (let i = kept.length - 1; i >= 0; i--) {
      const u = kept[i].engineUuid?.trim();
      if (u) {
        tip = u;
        break;
      }
    }
    setCoding((s) => {
      const i = s.messages.findIndex((m) => m.id === userId);
      if (i < 0) return s;
      return {
        ...s,
        messages: s.messages.slice(0, i),
        streaming: null,
        streamComplete: false,
        tools: [],
        permission: null,
        thinkingText: undefined,
        status: "idle",
        statusLabel: undefined,
      };
    });
    void (async () => {
      await window.lab?.agentCancel(activeExp, {
        cwd: workdir ?? undefined,
        sessionId: sid,
        purge: kept.length === 0,
      });
      if (kept.length === 0) {
        patchExp(activeExp, {
          engineSessionId: null,
          engineResumeAt: null,
          engineCutBefore: null,
          tokenTotals: null,
          lastTurnUsage: null,
        });
      } else {
        patchExp(activeExp, {
          engineResumeAt: tip,
          engineCutBefore: tip ? null : withdrawn.content,
        });
      }
    })();
    showToast(kept.length === 0 ? "已清空会话" : "已撤回该消息");
  };

  const respondAgentPermission = (action: PermissionAction) => {
    const p = coding.permission;
    if (!p || !activeExp) return;

    if (action.type === "deny") {
      void window.lab?.agentPermission({
        sessionKey: activeExp,
        requestId: p.requestId,
        allow: false,
        message: "User denied in Lab Agent",
      });
      setCoding((s) => ({
        ...s,
        permission: null,
        statusLabel: "已拒绝该操作",
      }));
      return;
    }

    if (action.type === "answer") {
      void window.lab?.agentPermission({
        sessionKey: activeExp,
        requestId: p.requestId,
        allow: true,
        updatedInput: { answers: action.answers },
      });
      setCoding((s) => ({
        ...s,
        permission: null,
        status: "tool",
        statusLabel: "已选择 · 继续执行",
      }));
      return;
    }

    // trust_workspace — acceptEdits immediately for this process + UI
    setPermissionMode("acceptEdits");
    showToast("已信任本工作区 · 读写将自动放行");
    void window.lab?.agentPermission({
      sessionKey: activeExp,
      requestId: p.requestId,
      allow: true,
      setMode: "acceptEdits",
    });
    setCoding((s) => ({
      ...s,
      permission: null,
      status: "tool",
      statusLabel: "已批准 · 继续执行",
    }));
  };

  // shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "n") { e.preventDefault(); startNewChat(); }
      else if (meta && e.key === ",") { e.preventDefault(); setSettingsOpen((v) => !v); }
      else if (e.key === "Escape") { setInspector(null); setSettingsOpen(false); setProfileOpen(false); setCustomApiOpen(false); setDeleteConfirm(null); setRenaming(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experiments, engine, activeExp, nodes]);

  // resizers
  const startSidebarResize = (e: React.MouseEvent) => {
    e.preventDefault();
    resizingSide.current = { startX: e.clientX, startW: sidebarW };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: MouseEvent) => { const d = resizingSide.current; if (d) setSidebarW(clamp(d.startW + (ev.clientX - d.startX), SIDEBAR_MIN, SIDEBAR_MAX)); };
    const onUp = () => { resizingSide.current = null; document.body.style.cursor = ""; document.body.style.userSelect = ""; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const startInspectorResize = (e: React.MouseEvent) => {
    e.preventDefault();
    resizingInsp.current = { startX: e.clientX, startW: inspectorW };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: MouseEvent) => { const d = resizingInsp.current; if (d) setInspectorW(clamp(d.startW - (ev.clientX - d.startX), INSPECTOR_MIN, INSPECTOR_MAX)); };
    const onUp = () => { resizingInsp.current = null; document.body.style.cursor = ""; document.body.style.userSelect = ""; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const inspectorState = inspector === "lab" ? lab : inspector === "coding" ? coding : null;

  const prdBlock = useMemo(() => {
    if (!inspectorState) return null;
    const prd = inspectorState.messages.filter((m) => /PRD|需求|目标|验收/.test(m.content)).slice(-2);
    return prd.length ? prd : null;
  }, [inspectorState]);

  const skinOn = appearance.pack === "skin";
  const mainColRef = useRef<HTMLElement | null>(null);

  return (
    <div className="lab-root relative flex h-full">
      {skinOn ? (
        <Suspense fallback={null}>
          <SkinAtmosphere
            mode={appearance.mode}
            mainRef={mainColRef}
            layoutKey={`${sidebarCollapsed}:${sidebarW}:${fileSideOpen}:${fileSideW}`}
          />
        </Suspense>
      ) : null}

      {/* ============ Left sidebar ============ */}
      <aside
        className={`titlebar-drag relative z-[1] flex shrink-0 flex-col border-r border-[var(--lab-border-soft)] bg-[var(--lab-sidebar)] ${
          skinOn ? "lab-skin-glass" : ""
        }`}
        style={{ width: sidebarCollapsed ? SIDEBAR_RAIL : sidebarW, transition: sidebarCollapsed ? "width 0.18s ease" : undefined }}
      >
        <div
          className={`flex h-11 shrink-0 items-center gap-1.5 border-b border-[var(--lab-border-soft)] ${
            sidebarCollapsed ? "justify-center px-1" : "gap-2 pl-[78px] pr-3"
          }`}
        >
          {sidebarCollapsed ? (
            <button
              type="button"
              className="titlebar-no-drag flex size-8 items-center justify-center rounded-md text-[13px] text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
              onClick={() => setSidebarCollapsed(false)}
              title="展开侧栏"
              aria-label="展开侧栏"
            >
              »
            </button>
          ) : (
            <>
              <img
                src={labAgentIcon}
                alt=""
                width={20}
                height={20}
                draggable={false}
                className="size-5 shrink-0 rounded-[4px]"
                style={{ imageRendering: "pixelated" }}
              />
              <ShellModeToggle mode={shellMode} onToggle={toggleShellMode} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-semibold text-[var(--lab-ink)]">Lab Agent</div>
                <div className="truncate text-[10px] text-[var(--lab-ink-3)]">
                  {isNormal ? "Lab Coding" : "双 Agent · 概念预览"}
                </div>
              </div>
              <button
                type="button"
                className="titlebar-no-drag shrink-0 rounded-md px-1.5 py-1 text-[11px] text-[var(--lab-ink-3)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
                onClick={() => setSidebarCollapsed(true)}
                title="收起"
                aria-label="收起侧栏"
              >
                «
              </button>
            </>
          )}
        </div>

        <div className="titlebar-no-drag min-h-0 flex-1 overflow-y-auto px-2 py-2.5">
          {/* session / experiment list */}
          <SidebarSessionList
            experiments={experiments}
            activeExp={activeExp}
            activeWorkspace={activeWorkspace}
            isNormal={isNormal}
            collapsed={sidebarCollapsed}
            renaming={renaming}
            recents={workdirRecents}
            onNew={startNewChat}
            onNewInWorkspace={startNewChatInWorkspace}
            onPickWorkspace={() => void pickFolder("add-workspace")}
            onRemoveWorkspace={removeWorkspace}
            onRenameStart={(id) => setRenaming(id)}
            onRenameCommit={(id, name) => renameExperiment(id, name)}
            onRenameCancel={() => setRenaming(null)}
            onSwitch={switchExperiment}
            onDeleteAsk={(id) => setDeleteConfirm(id)}
            onTogglePin={(id) => {
              setExperiments((xs) =>
                xs.map((e) => (e.id === id ? { ...e, pinned: !e.pinned } : e)),
              );
            }}
            onToggleArchive={(id) => {
              setExperiments((xs) =>
                xs.map((e) =>
                  e.id === id
                    ? { ...e, archived: !e.archived, pinned: e.archived ? e.pinned : false }
                    : e,
                ),
              );
            }}
            onSelectWorkspace={selectWorkspace}
          />

          {/* supervisor-only: current experiment agent rows */}
          {!isNormal && exp ? (
            <div className="mb-3">
              {!sidebarCollapsed ? (
                <div className="mb-1 px-1.5 text-[10px] font-semibold tracking-[0.08em] text-[var(--lab-ink-3)]">当前实验</div>
              ) : null}
              {(
                [
                  { kind: "lab" as const, label: `Lab · ${lab.status}`, state: lab },
                  { kind: "coding" as const, label: `Coding · ${coding.status}`, state: coding },
                ]
              ).map((row) => (
                <button
                  key={row.kind}
                  type="button"
                  onClick={() => { setTarget(row.kind); if (nodes.includes(row.kind)) setInspector(row.kind); }}
                  className={`mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] ${
                    inspector === row.kind
                      ? "bg-[var(--lab-hover)] text-[var(--lab-ink)]"
                      : "text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
                  }`}
                  title={sidebarCollapsed ? row.label : undefined}
                >
                  <span className="size-1.5 shrink-0 rounded-full" style={{ background: row.kind === "lab" ? "var(--lab-accent)" : "var(--lab-green)" }} />
                  {sidebarCollapsed ? row.label.slice(0, 1) : row.label}
                  {!sidebarCollapsed && nodes.includes(row.kind) ? <span className="ml-auto text-[9px] text-[var(--lab-ink-3)]">画布</span> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* 底部：用户占位（左）+ 设置（右）+ 主题切换 */}
        <div className="titlebar-no-drag shrink-0 border-t border-[var(--lab-border-soft)] p-2">
          <div className={`mb-2 flex items-center ${sidebarCollapsed ? "flex-col gap-1.5" : "gap-1.5"}`}>
            <button
              type="button"
              onClick={() => {
                setProfileDraft(profile);
                setProfileOpen(true);
              }}
              className={`flex min-w-0 items-center gap-2 rounded-[10px] text-left hover:bg-[var(--lab-hover)] ${
                sidebarCollapsed ? "size-8 justify-center p-0" : "flex-1 px-1.5 py-1"
              }`}
              title="个性化（登录即将接入）"
            >
              <LineFaceAvatar seed={profile.avatarSeed} size={sidebarCollapsed ? 28 : 28} />
              {!sidebarCollapsed ? (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-[var(--lab-ink)]">
                    {profile.displayName.trim() || "未登录"}
                  </span>
                  <span className="block truncate text-[10px] text-[var(--lab-ink-3)]">点击个性化</span>
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className="flex size-8 shrink-0 items-center justify-center rounded-[10px] text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
              onClick={() => setSettingsOpen(true)}
              title="设置 (⌘,)"
              aria-label="设置"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={theme === "light"}
            aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
            title={theme === "dark" ? "切到纯白" : "切到纯黑"}
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            className={`relative flex h-8 items-center rounded-full p-0.5 transition-colors ${
              sidebarCollapsed ? "mx-auto w-8 justify-center overflow-hidden" : "w-full"
            }`}
            style={{ background: "var(--lab-hover)" }}
          >
            {!sidebarCollapsed ? (
              <>
                <span className="relative z-[1] flex h-7 w-1/2 items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={theme === "light" ? "text-[var(--lab-ink)]" : "text-[var(--lab-ink-3)]"}>
                    <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                  </svg>
                </span>
                <span className="relative z-[1] flex h-7 w-1/2 items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={theme === "dark" ? "text-[var(--lab-ink)]" : "text-[var(--lab-ink-3)]"}>
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  </svg>
                </span>
                <span
                  className="pointer-events-none absolute top-0.5 z-0 h-7 rounded-full bg-[var(--lab-surface-solid)] shadow-[0_1px_3px_rgba(0,0,0,0.18)] transition-[left] duration-200 ease-out"
                  style={{
                    width: "calc(50% - 2px)",
                    left: theme === "light" ? 2 : "calc(50% + 0px)",
                  }}
                  aria-hidden
                />
              </>
            ) : (
              <span className="flex size-7 items-center justify-center rounded-full bg-[var(--lab-surface-solid)] text-[var(--lab-ink)] shadow-[0_1px_3px_rgba(0,0,0,0.18)]">
                {theme === "dark" ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                )}
              </span>
            )}
          </button>
        </div>

        {!sidebarCollapsed ? (
          <div role="separator" aria-orientation="vertical" className="titlebar-no-drag absolute inset-y-0 right-0 w-1.5 cursor-col-resize" onMouseDown={startSidebarResize} />
        ) : null}
      </aside>

      {/* ============ Main ============ */}
      <main
        ref={mainColRef}
        className={`relative z-[1] flex min-w-0 flex-1 ${
          skinOn ? "bg-transparent" : "bg-[var(--lab-main)]"
        }`}
      >
        <div className="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col">
          {/* title bar: breadcrumb */}
          <div
            className={`titlebar-drag flex h-11 items-center justify-between border-b border-[var(--lab-border-soft)] px-4 ${
              skinOn ? "lab-skin-glass" : ""
            }`}
            style={{
              background: skinOn
                ? "color-mix(in srgb, var(--lab-surface-solid) 72%, transparent)"
                : "var(--lab-main)",
            }}
          >
            <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px]">
              <span className="text-[var(--lab-ink-3)]">{isNormal ? "对话" : "实验"}</span>
              <span className="text-[var(--lab-ink-3)]">/</span>
              <span className="truncate font-medium text-[var(--lab-ink)]">
                {exp?.name ?? (isNormal ? "新对话" : "新实验")}
              </span>
              {activeWorkspace ? (
                <span
                  className="ml-1 truncate font-[var(--lab-mono)] text-[11px] text-[var(--lab-ink-3)]"
                  title={activeWorkspace}
                >
                  {activeWorkspace.split(/[/\\]/).filter(Boolean).pop()}
                </span>
              ) : null}
              {isNormal ? (
                <SectionTokenMeter
                  totals={exp?.tokenTotals}
                  lastUsage={exp?.lastTurnUsage}
                  modelId={chatModel}
                  compactHint={
                    coding.statusLabel && /压缩/.test(coding.statusLabel) ? coding.statusLabel : null
                  }
                  variant="titlebar"
                />
              ) : null}
            </div>
          </div>

          {!isNormal ? (
            <div className="titlebar-no-drag border-b border-[var(--lab-warn-border)]/40 bg-[var(--lab-warn-soft)] px-4 py-2 text-[11.5px] text-[var(--lab-ink-2)]">
              <span className="font-medium text-[var(--lab-warn)]">概念预览</span>
              <span className="text-[var(--lab-ink-3)]"> · 监工态暂不可用，仅展示双 Agent 工作台形态。正式能力后续开放。</span>
            </div>
          ) : null}

          {(() => {
            const normalEmpty =
              isNormal &&
              coding.messages.length === 0 &&
              !coding.streaming &&
              coding.status !== "thinking";

            const composerBlock = (
              <div
                className={`pointer-events-auto w-full max-w-[640px] ${skinOn ? "lab-skin-glass rounded-[18px]" : ""}`}
              >
                <WorkspacePicker
                  workdir={activeWorkspace}
                  preview={!desktopReady}
                  onPickMac={() => void pickFolder("add-workspace")}
                  onSelectRecent={selectWorkspace}
                  onRemoveRecent={(dir) => setWorkdirRecents(removeWorkdirRecent(dir))}
                  onRemote={() => showToast("远程目录即将开放")}
                  onStartScratch={() => {
                    startNewChat();
                  }}
                  onUseExisting={() => void pickFolder("add-workspace")}
                  onNewFolder={() => void pickFolder("add-workspace")}
                />
                <Composer
                  shellMode={shellMode}
                  onSend={dockSend}
                  placeholder={
                    isNormal
                      ? "Plan, build, / 指令, @ 引用上下文…"
                      : "监工态为概念预览 · 暂不可用"
                  }
                  engineKey={isNormal ? chatModel : engine}
                  onEngineChange={(key) => {
                    if (isNormal) setChatModel(key);
                    else setEngine(key);
                  }}
                  onEnginePending={(name) => pushEnginePendingNotice(name)}
                  customApi={customApi}
                  onRequestCustomApi={() => {
                    setCustomApiDraft(customApi);
                    setApiPreset(presetForBaseUrl(customApi.baseUrl));
                    setCustomApiOpen(true);
                  }}
                  busy={isNormal && dockBusy}
                  onStop={() => {
                    if (!activeExp) return;
                    setExperiments((xs) =>
                      xs.map((e) =>
                        e.id === activeExp
                          ? { ...e, coding: interruptAgentState(e.coding) }
                          : e,
                      ),
                    );
                    void window.lab?.agentCancel(activeExp);
                  }}
                  permissionMode={permissionMode}
                  onPermissionModeChange={setPermissionMode}
                  workdir={activeWorkspace}
                  onNeedWorkdir={() => void pickFolder("add-workspace")}
                  onRetarget={(kind) => {
                    setTarget(kind);
                    if (!nodes.includes(kind)) addNode(kind);
                    setInspector(kind);
                    setInspectorTab("chat");
                  }}
                  onOpenPrd={() => {
                    const kind = nodes.includes("lab") ? "lab" : nodes.includes("coding") ? "coding" : "lab";
                    if (!nodes.includes(kind)) addNode(kind);
                    setTarget(kind);
                    setInspector(kind);
                    setInspectorTab("output");
                  }}
                  showToast={showToast}
                />
              </div>
            );

            if (isNormal && normalEmpty) {
              return (
                <div className="flex h-[calc(100%-44px)] flex-col items-center justify-center px-4 pb-8">
                  <NormalChatView
                    state={coding}
                    sessionName={exp?.name ?? "新对话"}
                    workdir={activeWorkspace}
                    emptyHero
                    appearance={appearance}
                    onAppearanceChange={setAppearance}
                    onStreamingSettled={() => setCoding((s) => commitStreamingReveal(s))}
                    onFilePreview={onFilePreview}
                    onResendFromUser={resendFromUser}
                    onWithdrawUser={withdrawUser}
                  />
                  <div className="titlebar-no-drag mt-1 w-full max-w-[640px]">{composerBlock}</div>
                </div>
              );
            }

            return (
              <>
                <div className={`h-[calc(100%-44px)] ${isNormal ? "pb-36" : !isNormal ? "pb-36" : ""}`}>
                  {isNormal ? (
                    <NormalChatView
                      state={coding}
                      sessionName={exp?.name ?? "新对话"}
                      workdir={activeWorkspace}
                      appearance={appearance}
                      onAppearanceChange={setAppearance}
                      onStreamingSettled={() => setCoding((s) => commitStreamingReveal(s))}
                      onFilePreview={onFilePreview}
                      onResendFromUser={resendFromUser}
                      onWithdrawUser={withdrawUser}
                    />
                  ) : (
                    <CanvasFlow
                      lab={lab}
                      coding={coding}
                      nodes={nodes}
                      target={target}
                      onSelectTarget={() => showToast("监工态为概念预览 · 暂不可用")}
                      onOpenDetail={() => showToast("监工态为概念预览 · 暂不可用")}
                      onAddNode={() => showToast("监工态为概念预览 · 暂不可用")}
                      onRemoveNode={() => showToast("监工态为概念预览 · 暂不可用")}
                    />
                  )}
                </div>
                <div className="titlebar-no-drag pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
                  {composerBlock}
                </div>
              </>
            );
          })()}
        </div>

        {/* ============ File workspace (normal mode · tree / turn / recent + preview) ============ */}
        {isNormal ? (
          <FileWorkspaceSidebar
            workdir={activeWorkspace}
            sessionKey={activeExp}
            tools={turnToolTraces}
            preview={filePreview}
            open={fileSideOpen}
            width={fileSideW}
            onWidthChange={setFileSideW}
            onCollapse={() => setFileSideOpen(false)}
            onExpand={() => setFileSideOpen(true)}
            onPreview={onFilePreview}
          />
        ) : null}

        {/* ============ Right Inspector (push-style split pane) ============ */}
        {!isNormal && inspector && inspectorState ? (
          <section
            className="titlebar-no-drag relative flex shrink-0 flex-col border-l border-[var(--lab-border-soft)] bg-[var(--lab-surface-solid)] transition-[width] duration-200 ease-out"
            style={{ width: inspectorW }}
            data-lab-glass
          >
            <div role="separator" aria-orientation="vertical" className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize" onMouseDown={startInspectorResize} />
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--lab-border-soft)] px-3">
              <div className="flex items-center gap-1">
                {(
                  [
                    { kind: "lab" as const, label: "Lab" },
                    { kind: "coding" as const, label: "Coding" },
                  ]
                ).map((t) => (
                  <button
                    key={t.kind}
                    type="button"
                    onClick={() => setInspector(t.kind)}
                    className={`rounded-md px-2 py-1 text-[11.5px] ${
                      inspector === t.kind ? "bg-[var(--lab-hover)] text-[var(--lab-ink)]" : "text-[var(--lab-ink-3)] hover:text-[var(--lab-ink)]"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
                <span className="mx-1 h-3.5 w-px bg-[var(--lab-border)]" />
                {(
                  [
                    { id: "chat" as const, label: "对话" },
                    { id: "output" as const, label: "产出" },
                    { id: "files" as const, label: "文件" },
                  ]
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setInspectorTab(t.id)}
                    className={`rounded-md px-2 py-1 text-[11.5px] ${
                      inspectorTab === t.id ? "bg-[var(--lab-accent-soft)] text-[var(--lab-accent)]" : "text-[var(--lab-ink-3)] hover:text-[var(--lab-ink)]"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-[11px] text-[var(--lab-ink-3)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
                onClick={() => setInspector(null)}
              >
                收起
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {inspectorTab === "chat" ? (
                <div className="space-y-2.5">
                  {inspectorState.messages.length === 0 && !inspectorState.streaming ? (
                    <div className="rounded-lg border border-dashed border-[var(--lab-border)] px-3 py-8 text-center text-[11.5px] text-[var(--lab-ink-3)]">
                      还没有对话。用底部输入框跟 {inspector === "lab" ? "Lab 监工" : "Coding"} 说话。
                    </div>
                  ) : null}
                  {inspectorState.messages.map((msg) =>
                    msg.role === "user" ? (
                      <UserBubble key={msg.id}>{msg.content}</UserBubble>
                    ) : (
                      <AssistantBlock key={msg.id} name={inspector === "lab" ? "Lab Agent" : "Coding Agent"} role={inspector === "lab" ? "监工" : "coding"}>
                        <MarkdownBody text={msg.content} />
                      </AssistantBlock>
                    ),
                  )}

                  {inspector === "lab" && lab.mirror && lab.mirror.length > 0 ? (
                    <div className="space-y-1 rounded-lg border border-[var(--lab-border-soft)] p-2">
                      <div className="mb-1 text-[10px] font-semibold tracking-[0.08em] text-[var(--lab-ink-3)]">MIRROR</div>
                      {lab.mirror.slice(0, 12).map((m) => (
                        <ToolRow
                          key={m.id}
                          title={m.kind}
                          summary={m.summary}
                          state={m.detail === "running" ? "running" : m.detail === "error" ? "error" : "done"}
                        />
                      ))}
                    </div>
                  ) : null}

                  {inspector === "coding" && coding.commands && coding.commands.length > 0 ? (
                    <div className="space-y-1 rounded-lg border border-[var(--lab-border-soft)] p-2">
                      <div className="mb-1 text-[10px] font-semibold tracking-[0.08em] text-[var(--lab-ink-3)]">指令通道</div>
                      {coding.commands.slice(0, 12).map((c) => <ToolRow key={c.id} title={c.type} summary={c.payload} state="done" />)}
                    </div>
                  ) : null}

                  {inspectorState.status === "thinking" && !(inspectorState.tools?.length) && !inspectorState.streaming ? (
                    <LoadingState
                      variant="Drive"
                      label={inspectorState.statusLabel || (inspector === "lab" ? "监工梳理意图" : "Coding 思考中")}
                    />
                  ) : null}

                  {(inspectorState.tools?.length ?? 0) > 0 ? (
                    <ThinkingAdapter
                      variant="Coding"
                      controlled
                      working={
                        (inspectorState.tools ?? []).some((t) => t.state === "running") ||
                        Boolean(inspectorState.streaming) ||
                        inspectorState.status === "tool" ||
                        inspectorState.status === "thinking"
                      }
                      label="Running tools"
                      doneLabel={`Ran ${inspectorState.tools!.length} tools`}
                      rows={toolsToThinkingRows(inspectorState.tools ?? [])}
                    />
                  ) : null}

                  {inspectorState.streaming ? (
                    <AssistantBlock name={inspector === "lab" ? "Lab Agent" : "Coding Agent"} role={inspector === "lab" ? "监工" : "coding"}>
                      <StreamingText
                        mode="live"
                        liveText={inspectorState.streaming.content}
                        complete={false}
                        fill
                        sources={[]}
                        followUps={[]}
                      />
                    </AssistantBlock>
                  ) : null}

                  {inspectorState.approval ? (
                    <ApprovalPanel
                      headline={inspectorState.approval.headline}
                      detail={inspectorState.approval.detail}
                      onDismiss={() => setLab((s) => ({ ...s, approval: null }))}
                      onReject={() => inspectorState.approval && handleApproval("reject", inspectorState.approval.detail)}
                      onApprove={() => inspectorState.approval && handleApproval("approve", inspectorState.approval.detail)}
                    />
                  ) : null}
                </div>
              ) : inspectorTab === "output" ? (
                <div className="space-y-2">
                  {prdBlock ? (
                    prdBlock.map((m) => (
                      <div key={m.id} className="rounded-lg border border-[var(--lab-border)] bg-[var(--lab-inset)] p-2.5">
                        <div className="mb-1 text-[10px] font-semibold tracking-[0.08em] text-[var(--lab-ink-3)]">PRD / 验收</div>
                        <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--lab-ink)]">{m.content}</p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-dashed border-[var(--lab-border)] px-3 py-8 text-center text-[11.5px] text-[var(--lab-ink-3)]">
                      暂无产出。PRD / Plan / diff 会在这里按块展示。
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <FileTree root={activeWorkspace} />
                </div>
              )}
            </div>
          </section>
        ) : null}

        {/* Agent tool permission modal (bridge can_use_tool) */}
        {isNormal && coding.permission ? (
          <PermissionModal permission={coding.permission} onAction={respondAgentPermission} />
        ) : null}

        {/* Intervention modal */}
        {intervention ? (
          <div className="titlebar-no-drag absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setIntervention(null)}>
            <div className="w-[380px] rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-overlay)]" onClick={(e) => e.stopPropagation()}>
              <div className="mb-2 flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ background: intervention.kind === "lab" ? "var(--accent)" : "var(--green)" }} />
                <span className="text-[13px] font-semibold text-[var(--ink)]">
                  {intervention.kind === "lab" ? "Lab 监工" : "Coding Agent"} 需要你的输入
                </span>
              </div>
              <div className="mb-3 rounded-[10px] border border-[var(--line-soft)] bg-[var(--inset)] p-2.5 font-[var(--lab-mono)] text-[11.5px] leading-relaxed text-[var(--ink-2)]">
                {intervention.prompt}
              </div>
              {intervention.type === "confirm" ? (
                <div className="flex gap-2">
                  <button type="button" className="flex-1 rounded-[8px] bg-[var(--green)] px-3 py-2 text-[12px] font-medium text-white" onClick={() => handleIntervention("y")}>允许 (y)</button>
                  <button type="button" className="flex-1 rounded-[8px] bg-[var(--red)] px-3 py-2 text-[12px] font-medium text-white" onClick={() => handleIntervention("n")}>拒绝 (n)</button>
                  <button type="button" className="rounded-[8px] border border-[var(--line)] px-3 py-2 text-[12px] text-[var(--ink-2)] hover:bg-[var(--hover)]" onClick={() => handleIntervention("a")}>总是</button>
                </div>
              ) : intervention.type === "select" ? (
                <div className="space-y-1">
                  {intervention.options?.map((opt, i) => (
                    <button key={i} type="button" className="w-full rounded-[8px] border border-[var(--line)] px-3 py-2 text-left text-[12px] text-[var(--ink-2)] hover:bg-[var(--hover)] hover:text-[var(--ink)]" onClick={() => handleIntervention(String(i + 1))}>
                      {opt}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex gap-2">
                  <input autoFocus type="text" placeholder="输入内容…" className="min-w-0 flex-1 rounded-[8px] border border-[var(--line)] bg-[var(--field)] px-3 py-2 text-[12px] text-[var(--ink)] outline-none" onKeyDown={(e) => { if (e.key === "Enter") handleIntervention((e.target as HTMLInputElement).value); }} />
                  <button type="button" className="rounded-[8px] bg-[var(--ink)] px-3 py-2 text-[12px] font-medium text-[var(--surface)]" onClick={(e) => { const input = (e.target as HTMLElement).parentElement?.querySelector("input"); if (input) handleIntervention(input.value); }}>确认</button>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Light tips — NoticeStack (mode / engine / toast) */}
        <NoticeStack items={notices} onDismiss={dismissNotice} />

        {/* Delete confirm */}
        {deleteConfirm ? (
          <div className="titlebar-no-drag absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)}>
            <div className="w-[300px] rounded-xl border border-[var(--lab-border)] bg-[var(--lab-surface-solid)] p-4 shadow-[0_18px_50px_#000a]" data-lab-glass onClick={(e) => e.stopPropagation()}>
              <div className="mb-1 text-[13px] font-semibold text-[var(--lab-ink)]">{isNormal ? "删除对话？" : "删除实验？"}</div>
              <div className="mb-3 text-[11.5px] leading-relaxed text-[var(--lab-ink-3)]">
                「{experiments.find((e) => e.id === deleteConfirm)?.name}」的对话与产出会被一并删除，不可恢复。
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="rounded-md px-3 py-1.5 text-[11.5px] text-[var(--lab-ink-3)] hover:bg-[var(--lab-hover)]" onClick={() => setDeleteConfirm(null)}>
                  取消
                </button>
                <button type="button" className="rounded-md bg-[var(--lab-red)] px-3 py-1.5 text-[11.5px] font-medium text-white" onClick={() => deleteExperiment(deleteConfirm)}>
                  删除
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Profile personalization modal (placeholder for future auth) */}
        {profileOpen ? (
          <div className="titlebar-no-drag absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setProfileOpen(false)}>
            <div className="w-[420px] max-w-[92vw] rounded-2xl border border-[var(--lab-border)] bg-[var(--lab-surface-solid)] p-5 shadow-[0_24px_64px_rgba(0,0,0,0.45)]" data-lab-glass onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="text-[15px] font-semibold text-[var(--lab-ink)]">个性化</div>
                  <div className="mt-0.5 text-[11.5px] text-[var(--lab-ink-3)]">本地占位 · 正式登录稍后接入</div>
                </div>
                <button type="button" className="rounded-md px-2 py-1 text-[12px] text-[var(--lab-ink-3)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]" onClick={() => setProfileOpen(false)}>×</button>
              </div>

              <div className="mb-4 flex items-center gap-3">
                <LineFaceAvatar seed={profileDraft.avatarSeed} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="mb-1 text-[10px] font-semibold tracking-[0.08em] text-[var(--lab-ink-3)]">显示名</div>
                  <input
                    value={profileDraft.displayName}
                    onChange={(e) => setProfileDraft((p) => ({ ...p, displayName: e.target.value }))}
                    placeholder="例如 dan"
                    className="w-full rounded-lg border border-[var(--lab-border)] bg-[var(--lab-inset)] px-2.5 py-2 text-[12.5px] text-[var(--lab-ink)] outline-none focus:border-[var(--lab-ink-3)]"
                  />
                  <button
                    type="button"
                    className="mt-2 rounded-lg border border-[var(--lab-border)] px-2.5 py-1.5 text-[11px] text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
                    onClick={() => setProfileDraft((p) => ({ ...p, avatarSeed: newAvatarSeed() }))}
                  >
                    换一张头像
                  </button>
                </div>
              </div>

              <div className="mb-4 rounded-xl border border-dashed border-[var(--lab-border)] bg-[var(--lab-inset)] p-3">
                <div className="mb-2 text-[11px] font-medium text-[var(--lab-ink-2)]">登录（即将开放）</div>
                <div className="flex gap-2">
                  <button type="button" className="flex-1 rounded-lg border border-[var(--lab-border)] px-2 py-2 text-[11.5px] text-[var(--lab-ink-3)] opacity-70" onClick={() => showToast("GitHub 登录即将开放")}>GitHub</button>
                  <button type="button" className="flex-1 rounded-lg border border-[var(--lab-border)] px-2 py-2 text-[11.5px] text-[var(--lab-ink-3)] opacity-70" onClick={() => showToast("邮箱登录即将开放")}>邮箱</button>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button type="button" className="rounded-lg px-3 py-1.5 text-[12px] text-[var(--lab-ink-3)] hover:bg-[var(--lab-hover)]" onClick={() => setProfileOpen(false)}>取消</button>
                <button
                  type="button"
                  className="rounded-lg bg-[var(--lab-ink)] px-3 py-1.5 text-[12px] font-medium text-[var(--lab-bg)]"
                  onClick={() => {
                    const next = { ...profileDraft, displayName: profileDraft.displayName.trim() };
                    setProfile(next);
                    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(next)); } catch {}
                    setProfileOpen(false);
                    showToast("已保存个性化");
                  }}
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Settings modal (centered) */}
        {settingsOpen ? (
          <div className="titlebar-no-drag absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSettingsOpen(false)}>
            <div className="max-h-[85vh] w-[460px] max-w-[92vw] overflow-y-auto rounded-2xl border border-[var(--lab-border)] bg-[var(--lab-surface-solid)] p-5 shadow-[0_24px_64px_rgba(0,0,0,0.45)]" data-lab-glass onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between">
                <div className="text-[15px] font-semibold text-[var(--lab-ink)]">设置</div>
                <button type="button" className="rounded-md px-2 py-1 text-[12px] text-[var(--lab-ink-3)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]" onClick={() => setSettingsOpen(false)}>×</button>
              </div>

              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-[10px] font-semibold tracking-[0.08em] text-[var(--lab-ink-3)]">
                    外观
                  </div>
                  <button
                    type="button"
                    className="rounded-md px-2 py-0.5 text-[11px] text-[var(--lab-ink-3)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
                    onClick={() => {
                      const next = resetAppearanceToDefaults();
                      setAppearance(next);
                      showToast("已恢复默认外观（默认皮肤 · 白昼）");
                    }}
                  >
                    恢复默认
                  </button>
                </div>
                <AppearancePickCards appearance={appearance} onChange={setAppearance} />
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--lab-ink-3)]">
                  昼夜仍在侧栏底部切换。璃 / Glass 模式下壳层为玻璃态。
                </p>
              </div>

              <div className="mb-4">
                <div className="mb-1 text-[10px] font-semibold tracking-[0.08em] text-[var(--lab-ink-3)]">
                  {isNormal ? "模型" : "Coding 引擎"}
                </div>
                <div className="space-y-1">
                  {isNormal ? (
                    <>
                      {customApi.models.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-[var(--lab-border)] px-2.5 py-3 text-[11.5px] text-[var(--lab-ink-3)]">
                          尚未拉取模型。添加 API Key 后会列出该账号可用的全部模型。
                        </div>
                      ) : (
                        customApi.models.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setChatModel(m.id)}
                            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] ${
                              chatModel === m.id ? "bg-[var(--lab-hover)] text-[var(--lab-ink)]" : "text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)]"
                            }`}
                          >
                            <span className="min-w-0 flex-1 truncate">{m.name}</span>
                            <span className="shrink-0 font-[var(--lab-mono)] text-[9px] text-[var(--lab-ink-3)]">{m.id}</span>
                            {chatModel === m.id ? <span className="text-[var(--lab-accent)]">✓</span> : null}
                          </button>
                        ))
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setCustomApiDraft(customApi);
                          setApiPreset(presetForBaseUrl(customApi.baseUrl));
                          setCustomApiOpen(true);
                          setSettingsOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)]"
                      >
                        <span className="flex-1">{customApi.models.length ? "刷新 / 更换 API…" : "添加 API…"}</span>
                        {customApi.baseUrl ? <span className="text-[9px] text-[var(--lab-ink-3)]">已配置</span> : null}
                      </button>
                    </>
                  ) : (
                    ENGINES.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => {
                          if (e.preset) {
                            pushEnginePendingNotice(e.name, e.id);
                            return;
                          }
                          setEngine(e.id);
                        }}
                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] ${
                          engine === e.id ? "bg-[var(--lab-hover)] text-[var(--lab-ink)]" : "text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)]"
                        }`}
                      >
                        <span className="flex size-5 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: e.color }}>
                          {e.abbr}
                        </span>
                        <span className="flex-1">{e.name}</span>
                        {e.preset ? <span className="rounded-sm bg-[var(--lab-hover)] px-1 text-[8px] leading-[1.4] text-[var(--lab-ink-3)]">CLI 占位</span> : null}
                        {engine === e.id ? <span className="text-[var(--lab-accent)]">✓</span> : null}
                      </button>
                    ))
                  )}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-[var(--lab-ink-3)]">
                  {isNormal
                    ? "填入 API 后自动拉取可用模型；底栏切换的是真实 model id。Agent 身份固定为 Lab Agent。"
                    : "「Lab Coding」是产品自建引擎（需下方 DeepSeek Key）。其余为官方 CLI 占位。"}
                </p>
              </div>

              {!isNormal ? (
                <>
              <div className="mb-2 text-[10px] font-semibold tracking-[0.08em] text-[var(--lab-ink-3)]">
                产品自建 Coding Agent（DeepSeek）
              </div>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="DeepSeek API Key"
                className="mb-2 w-full rounded-lg border border-[var(--lab-border)] bg-[var(--lab-inset)] px-2.5 py-2 text-[12px] text-[var(--lab-ink)] outline-none"
              />
              <button
                type="button"
                className="w-full rounded-lg bg-[var(--lab-ink)] px-2 py-2.5 text-[12px] font-medium text-[var(--lab-bg)]"
                onClick={() => {
                  if (!apiKey.trim()) return;
                  void window.lab?.setApiKey(apiKey.trim());
                  setApiKey("");
                  showToast("已保存 Key");
                }}
              >
                保存 Key
              </button>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {customApiOpen ? (
          <div className="titlebar-no-drag absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => !fetchingModels && setCustomApiOpen(false)}>
            <div className="w-[440px] max-w-[92vw] rounded-2xl border border-[var(--lab-border)] bg-[var(--lab-surface-solid)] p-5 shadow-[0_24px_64px_rgba(0,0,0,0.45)]" data-lab-glass onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="text-[15px] font-semibold text-[var(--lab-ink)]">添加 API</div>
                  <div className="mt-0.5 text-[11.5px] text-[var(--lab-ink-3)]">选择厂商后只需填写 API Key，保存后拉取可用模型</div>
                </div>
                <button type="button" className="rounded-md px-2 py-1 text-[12px] text-[var(--lab-ink-3)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]" onClick={() => !fetchingModels && setCustomApiOpen(false)} disabled={fetchingModels}>×</button>
              </div>

              <div className="mb-2 text-[10px] font-semibold tracking-[0.08em] text-[var(--lab-ink-3)]">厂商</div>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {API_PROVIDER_PRESETS.map((p) => {
                  const selected = apiPreset === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={fetchingModels}
                      onClick={() => {
                        setApiPreset(p.id);
                        setCustomApiDraft((d) => ({
                          ...d,
                          baseUrl: p.id === "custom" ? d.baseUrl : p.baseUrl,
                          provider: p.id === "custom" ? detectProvider(d.baseUrl || p.baseUrl) : p.provider,
                        }));
                      }}
                      className={`rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors ${
                        selected
                          ? "border-[var(--lab-ink)]/40 bg-[var(--lab-hover)] font-medium text-[var(--lab-ink)]"
                          : "border-[var(--lab-border-soft)] text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)]"
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>

              {apiPreset === "custom" ? (
                <>
                  <div className="mb-2 text-[10px] font-semibold tracking-[0.08em] text-[var(--lab-ink-3)]">Base URL</div>
                  <input
                    value={customApiDraft.baseUrl}
                    onChange={(e) =>
                      setCustomApiDraft((d) => ({
                        ...d,
                        baseUrl: e.target.value,
                        provider: detectProvider(e.target.value),
                      }))
                    }
                    placeholder="https://…"
                    className="mb-3 w-full rounded-lg border border-[var(--lab-border)] bg-[var(--lab-inset)] px-2.5 py-2 text-[12px] text-[var(--lab-ink)] outline-none"
                  />
                </>
              ) : (
                <div className="mb-3 rounded-lg border border-[var(--lab-border-soft)] bg-[var(--lab-inset)] px-2.5 py-2">
                  <div className="text-[10px] font-semibold tracking-[0.08em] text-[var(--lab-ink-3)]">Base URL</div>
                  <div className="mt-0.5 truncate font-[var(--lab-mono)] text-[11.5px] text-[var(--lab-ink-2)]">
                    {customApiDraft.baseUrl || "—"}
                  </div>
                  {API_PROVIDER_PRESETS.find((p) => p.id === apiPreset)?.hint ? (
                    <div className="mt-1 text-[10.5px] text-[var(--lab-ink-3)]">
                      {API_PROVIDER_PRESETS.find((p) => p.id === apiPreset)?.hint}
                    </div>
                  ) : null}
                </div>
              )}

              <div className="mb-2 text-[10px] font-semibold tracking-[0.08em] text-[var(--lab-ink-3)]">API Key</div>
              <input
                type="password"
                value={customApiDraft.apiKey}
                onChange={(e) => setCustomApiDraft((d) => ({ ...d, apiKey: e.target.value }))}
                placeholder="sk-…"
                className="mb-3 w-full rounded-lg border border-[var(--lab-border)] bg-[var(--lab-inset)] px-2.5 py-2 text-[12px] text-[var(--lab-ink)] outline-none"
                autoFocus
              />
              {customApi.models.length > 0 ? (
                <div className="mb-4 max-h-32 space-y-1 overflow-y-auto rounded-lg border border-[var(--lab-border-soft)] p-2">
                  <div className="px-1 text-[10px] font-semibold tracking-[0.08em] text-[var(--lab-ink-3)]">已缓存 {customApi.models.length} 个模型</div>
                  {customApi.models.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-[12px] text-[var(--lab-ink-2)]">
                      <span className="min-w-0 flex-1 truncate">{m.name}</span>
                      <span className="shrink-0 font-[var(--lab-mono)] text-[9px] text-[var(--lab-ink-3)]">{m.id}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mb-4 text-[11px] text-[var(--lab-ink-3)]">选好厂商后粘贴 Key，点保存即可拉取模型列表。</p>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" className="rounded-lg px-3 py-1.5 text-[12px] text-[var(--lab-ink-3)] hover:bg-[var(--lab-hover)]" disabled={fetchingModels} onClick={() => setCustomApiOpen(false)}>取消</button>
                <button
                  type="button"
                  className="rounded-lg bg-[var(--lab-ink)] px-3 py-1.5 text-[12px] font-medium text-[var(--lab-bg)] disabled:opacity-60"
                  disabled={fetchingModels}
                  onClick={() => {
                    void (async () => {
                      const baseUrl = customApiDraft.baseUrl.trim();
                      const key = customApiDraft.apiKey.trim();
                      if (!baseUrl || !key) {
                        showToast(apiPreset === "custom" ? "请填写 Base URL 和 API Key" : "请填写 API Key");
                        return;
                      }
                      if (!hasLabBridge() || !window.lab?.listModels) {
                        showToast(LAB_PREVIEW_HINT);
                        return;
                      }
                      setFetchingModels(true);
                      try {
                        const res = await window.lab.listModels({ baseUrl, apiKey: key });
                        if (!res.ok || !res.models?.length) {
                          showToast(res.error || "拉取模型失败");
                          return;
                        }
                        const provider =
                          API_PROVIDER_PRESETS.find((p) => p.id === apiPreset)?.provider ||
                          detectProvider(baseUrl);
                        const models = mapModelsResponse({ data: res.models }, provider === "unknown" ? detectProvider(baseUrl) : provider).map((m) => ({
                          ...m,
                          name: prettifyModelId(m.id),
                        }));
                        const next: CustomApiConfig = {
                          baseUrl,
                          apiKey: key,
                          provider: provider === "unknown" ? detectProvider(baseUrl) : provider,
                          models,
                        };
                        setCustomApi(next);
                        setCustomApiDraft(next);
                        setApiPreset(presetForBaseUrl(baseUrl));
                        saveCustomApi(next);
                        void window.lab.setApiKey(key);
                        setChatModel(models[0].id);
                        setCustomApiOpen(false);
                        showToast(`已拉取 ${models.length} 个模型${res.endpoint ? ` · ${res.endpoint}` : ""}`);
                      } catch (err) {
                        showToast(`拉取失败：${err instanceof Error ? err.message : String(err)}`);
                      } finally {
                        setFetchingModels(false);
                      }
                    })();
                  }}
                >
                  {fetchingModels ? "拉取中…" : "保存并拉取模型"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

      </main>
    </div>
  );
}
