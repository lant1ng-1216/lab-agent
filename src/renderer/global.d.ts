export {};

import type {
  AgentBridgeEvent,
  AgentPromptRequest,
  ChatMessage,
  CodingMirrorEvent,
  ListModelsRequest,
  ListModelsResult,
  LoopStatus,
  SupervisorCommand,
} from "../../shared/protocol";

declare module "*.png" {
  const src: string;
  export default src;
}

declare module "*.svg" {
  const src: string;
  export default src;
}

declare global {
  interface Window {
    lab: {
      platform?: string;
      getRole: () => Promise<string>;
      getSettings: () => Promise<{ model: string; hasKey: boolean; workspacePath: string }>;
      setApiKey: (key: string, opts?: { baseUrl?: string; model?: string }) => Promise<boolean>;
      listModels: (payload: ListModelsRequest) => Promise<ListModelsResult>;
      agentPrompt: (payload: AgentPromptRequest) => Promise<{ ok: boolean; error?: string }>;
      agentCancel: (
        sessionKey: string,
        opts?: { cwd?: string; sessionId?: string; purge?: boolean },
      ) => Promise<boolean>;
      agentPermission: (payload: {
        sessionKey: string;
        requestId: string;
        allow: boolean;
        message?: string;
        updatedInput?: Record<string, unknown>;
        setMode?: string;
      }) => Promise<boolean>;
      getLabEnv: () => Promise<{ ok: boolean; credentialStored: boolean; baseUrl: string; model: string }>;
      onAgentEvent: (cb: (sessionKey: string, event: AgentBridgeEvent) => void) => () => void;
      sendChat: (agent: "supervisor" | "coding", text: string) => Promise<void>;
      getMirrorSnapshot: () => Promise<CodingMirrorEvent[]>;
      sendCommand: (cmd: SupervisorCommand) => void;
      onChatStream: (cb: (agent: "supervisor" | "coding", msg: ChatMessage) => void) => () => void;
      onMirrorEvent: (cb: (ev: CodingMirrorEvent) => void) => () => void;
      onCommand: (cb: (cmd: SupervisorCommand) => void) => () => void;
      onLoopStatus: (cb: (agent: "supervisor" | "coding", status: LoopStatus) => void) => () => void;
      ptySpawn: (id: string, engine: string, cols: number, rows: number) => Promise<{ ok: boolean; error?: string }>;
      ptyWrite: (id: string, data: string) => void;
      ptyResize: (id: string, cols: number, rows: number) => void;
      ptyKill: (id: string) => void;
      onPtyData: (cb: (id: string, data: string) => void) => () => void;
      onPtyExit: (cb: (id: string, code: number) => void) => () => void;
      pickFolder: () => Promise<string | null>;
      setWorkspace: (dir: string) => Promise<boolean>;
      pickFiles: (opts?: { defaultPath?: string; multi?: boolean }) => Promise<string[]>;
      listFiles: (dir: string) => Promise<{ name: string; type: string; size: number }[]>;
      readFile: (path: string) => Promise<{ ok: boolean; content?: string; error?: string }>;
    };
  }
}
