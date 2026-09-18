import { useEffect, useMemo, useState } from "react";
import PromptBar, { type SourceActionResult } from "../harness/beautiful-ui/PromptBar";
import type { LabNodeKind } from "../canvas/LabNode";
import { hasLabBridge, LAB_PREVIEW_HINT } from "../lib/labBridge";
import {
  buildChatModels,
  describeApiSource,
  modelListStatusHint,
  type CustomApiConfig,
} from "../lib/chatModels";
import type { PermissionModeId } from "../lib/permissionModes";

/** Supervisor mode: switch coding engines (Lab Coding ready; others placeholder). */
export const LAB_ENGINE_MODELS = [
  { key: "lab-deepseek", name: "Lab Coding", tag: "自建", brand: "lab-coding" },
  { key: "claude-code", name: "Claude Code", tag: "CLI", brand: "claude" },
  { key: "codex", name: "Codex", tag: "CLI", brand: "openai" },
  { key: "cursor", name: "Cursor", tag: "CLI", brand: "cursor" },
  { key: "opencode", name: "OpenCode", tag: "CLI", brand: "opencode" },
];

export const LAB_SOURCES_SUPERVISOR = [
  { key: "attach", name: "上传文件", desc: "从电脑选择文件", glyph: "clip", attach: true },
  { key: "cite", name: "引用文件", desc: "从工作目录选择并 @ 引用", glyph: "layers" },
  { key: "lab", name: "Lab 监工", desc: "发给监工 Agent", glyph: "chart" },
  { key: "coding", name: "Coding Agent", desc: "发给 Coding 终端", glyph: "globe" },
  { key: "prd", name: "PRD / 验收", desc: "查看产出与验收块", glyph: "clip" },
];

export const LAB_SOURCES_NORMAL = [
  { key: "attach", name: "上传文件", desc: "从电脑选择文件", glyph: "clip", attach: true },
  { key: "cite", name: "引用文件", desc: "从工作目录选择并 @ 引用", glyph: "layers" },
];

export const LAB_COMMANDS = [
  { key: "help", name: "/help", desc: "查看可用指令" },
  { key: "status", name: "/status", desc: "当前会话与模型状态" },
  { key: "clear", name: "/clear", desc: "清空当前对话" },
  { key: "run", name: "/run", desc: "开始执行当前任务" },
  { key: "stop", name: "/stop", desc: "停止当前任务" },
];

/** @deprecated */
export const LAB_MODELS = LAB_ENGINE_MODELS;
/** @deprecated */
export const LAB_SOURCES = LAB_SOURCES_SUPERVISOR;

const READY_ENGINES = new Set(["lab-deepseek"]);

export type ComposerShellMode = "normal" | "supervisor";

interface Props {
  shellMode?: ComposerShellMode;
  onSend: (text: string, attachments?: string[]) => void;
  placeholder?: string;
  engineKey?: string;
  onEngineChange?: (key: string) => void;
  onEnginePending?: (name: string) => void;
  customApi?: CustomApiConfig;
  onRequestCustomApi?: () => void;
  workdir?: string | null;
  onNeedWorkdir?: () => void;
  onRetarget?: (kind: LabNodeKind) => void;
  onOpenPrd?: () => void;
  showToast?: (msg: string) => void;
  /** Agent turn in progress — lock input; Stop in PromptBar */
  busy?: boolean;
  onStop?: () => void;
  permissionMode?: PermissionModeId;
  onPermissionModeChange?: (mode: PermissionModeId) => void;
}

function basename(p: string) {
  return p.split(/[/\\]/).filter(Boolean).pop() || p;
}

async function pickFilesSafe(
  opts: { defaultPath?: string; multi?: boolean },
  showToast?: (msg: string) => void,
): Promise<string[] | null> {
  if (!hasLabBridge()) {
    showToast?.(LAB_PREVIEW_HINT);
    return null;
  }
  try {
    const paths = await window.lab.pickFiles(opts);
    return paths ?? [];
  } catch (err) {
    showToast?.(`选文件失败：${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export default function Composer({
  shellMode = "supervisor",
  onSend,
  placeholder,
  engineKey,
  onEngineChange,
  onEnginePending,
  customApi = { baseUrl: "", apiKey: "", provider: "unknown", protocol: "anthropic-messages", models: [] },
  onRequestCustomApi,
  workdir = null,
  onNeedWorkdir,
  onRetarget,
  onOpenPrd,
  showToast,
  busy = false,
  onStop,
  permissionMode = "default",
  onPermissionModeChange,
}: Props) {
  const [barEpoch, setBarEpoch] = useState(0);
  const [workspaceFiles, setWorkspaceFiles] = useState<string[]>([]);
  const isNormal = shellMode === "normal";
  const models = useMemo(
    () => (isNormal ? buildChatModels(customApi) : LAB_ENGINE_MODELS),
    [isNormal, customApi],
  );
  const sources = isNormal ? LAB_SOURCES_NORMAL : LAB_SOURCES_SUPERVISOR;
  const initialKey =
    engineKey ||
    (isNormal ? customApi.models[0]?.id || "__add_api__" : "lab-deepseek");

  useEffect(() => {
    let cancelled = false;
    if (!workdir || !hasLabBridge()) {
      setWorkspaceFiles([]);
      return;
    }
    void window.lab.listFiles(workdir).then((list) => {
      if (cancelled) return;
      setWorkspaceFiles(
        (list || [])
          .filter((e) => e.type === "file")
          .map((e) => e.name)
          .slice(0, 80),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [workdir]);

  const handleSource = async (key: string): Promise<SourceActionResult> => {
    if (key.startsWith("file:")) {
      const name = key.slice("file:".length);
      if (!workdir) {
        showToast?.("先选择工作目录");
        onNeedWorkdir?.();
        return { handled: true };
      }
      const full = `${workdir.replace(/[/\\]$/, "")}/${name}`;
      return { handled: true, attachments: [full], insert: `@${name} ` };
    }

    if (key === "attach") {
      const paths = await pickFilesSafe({ defaultPath: workdir ?? undefined, multi: true }, showToast);
      if (paths === null) return { handled: true };
      if (!paths.length) {
        showToast?.("已取消选择文件");
        return { handled: true };
      }
      showToast?.(`已添加 ${paths.length} 个文件`);
      return {
        handled: true,
        attachments: paths,
        insert: paths.map((p) => `@${basename(p)}`).join(" ") + " ",
      };
    }

    if (key === "cite") {
      if (!workdir) {
        showToast?.("先选择工作目录");
        onNeedWorkdir?.();
        return { handled: true };
      }
      const paths = await pickFilesSafe({ defaultPath: workdir, multi: true }, showToast);
      if (paths === null) return { handled: true };
      if (!paths.length) {
        showToast?.("已取消选择文件");
        return { handled: true };
      }
      showToast?.(`已引用 ${paths.length} 个文件`);
      return {
        handled: true,
        attachments: paths,
        insert: paths.map((p) => `@${basename(p)}`).join(" ") + " ",
      };
    }

    if (!isNormal && key === "lab") {
      onRetarget?.("lab");
      showToast?.("已切到 Lab 监工");
      return { handled: true };
    }

    if (!isNormal && key === "coding") {
      onRetarget?.("coding");
      showToast?.("已切到 Coding Agent");
      return { handled: true };
    }

    if (!isNormal && key === "prd") {
      onOpenPrd?.();
      showToast?.("已打开 PRD / 验收");
      return { handled: true };
    }

    return { handled: false };
  };

  return (
    <PromptBar
      key={`${shellMode}-${initialKey}-${barEpoch}-${models.map((m) => m.key).join(",")}`}
      variant="Rounded"
      demo={false}
      placeholder={placeholder ?? "Write a message…"}
      onSend={onSend}
      models={models}
      modelSource={isNormal ? describeApiSource(customApi) : undefined}
      modelListHint={isNormal ? modelListStatusHint(customApi) : undefined}
      sources={sources}
      commands={LAB_COMMANDS}
      files={workspaceFiles}
      initialModelKey={initialKey}
      onSourceAction={handleSource}
      dictationEnabled={false}
      busy={busy}
      onStop={onStop}
      permissionMode={permissionMode}
      onPermissionModeChange={onPermissionModeChange}
      onModelChange={(m) => {
        if (isNormal) {
          if (m.key === "__add_api__") {
            onRequestCustomApi?.();
            setBarEpoch((n) => n + 1);
            return;
          }
          onEngineChange?.(m.key);
          return;
        }
        if (!READY_ENGINES.has(m.key)) {
          onEnginePending?.(m.name);
          setBarEpoch((n) => n + 1);
          return;
        }
        onEngineChange?.(m.key);
      }}
    />
  );
}
