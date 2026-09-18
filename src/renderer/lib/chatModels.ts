import type { PromptModel } from "../harness/beautiful-ui/PromptBar";
import type { ApiProtocol } from "@shared/protocol";
import { canonicalModelId, dedupeModelsById } from "@shared/modelCatalog";
import { withoutApiKey } from "@shared/credentialMetadata";

export const CUSTOM_API_KEY = "lab.customApi.v1";
export const CHAT_MODEL_KEY = "lab.chatModel";
export const FETCHED_MODELS_KEY = "lab.fetchedModels.v1";

export type ProviderId = "deepseek" | "openai" | "anthropic" | "kimi" | "glm" | "unknown";
export type ApiVerificationState = "unverified" | "checking" | "verified" | "error";
export type ApiConfigSource = "env" | "user";

export interface FetchedModel {
  id: string;
  /** Display name derived from id */
  name: string;
  ownedBy?: string;
  provider: ProviderId;
}

export interface CustomApiConfig {
  baseUrl: string;
  apiKey: string;
  provider: ProviderId;
  /** Protocol used by the Agent runtime, not merely the /models endpoint. */
  protocol: ApiProtocol;
  /** Last fetched models, or an explicitly marked env fallback when verification failed. */
  models: FetchedModel[];
  /** Whether the current credential was verified against the provider. */
  verification?: ApiVerificationState;
  /** Last time the provider returned a usable model list. */
  verifiedAt?: number;
  /** Sanitized, user-facing reason for the last failed verification. */
  lastError?: string;
  /** Explicitly records whether env bootstrap or the API dialog owns this config. */
  source?: ApiConfigSource;
}

/** Built-in vendor endpoints for「添加 API」(OpenAI-compatible /models where possible). */
export type ApiProviderPresetId = "deepseek" | "openai" | "anthropic" | "kimi" | "glm" | "custom";

export interface ApiProviderPreset {
  id: ApiProviderPresetId;
  label: string;
  /** Empty for custom — user types URL */
  baseUrl: string;
  provider: ProviderId;
  protocol: ApiProtocol;
  hint?: string;
}

export const API_PROVIDER_PRESETS: ApiProviderPreset[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    provider: "deepseek",
    protocol: "anthropic-messages",
    hint: "推荐 · 填 Key 即可",
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    provider: "openai",
    protocol: "openai-chat",
    hint: "模型列表可拉取；当前 Lab Coding 引擎暂需 Anthropic Messages 兼容接口",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com",
    provider: "anthropic",
    protocol: "anthropic-messages",
    hint: "官方 API；若拉模型失败可改用兼容网关",
  },
  {
    id: "kimi",
    label: "Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    provider: "kimi",
    protocol: "openai-chat",
    hint: "模型列表可拉取；当前 Lab Coding 引擎暂需 Anthropic Messages 兼容接口",
  },
  {
    id: "glm",
    label: "GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    provider: "glm",
    protocol: "openai-chat",
    hint: "模型列表可拉取；当前 Lab Coding 引擎暂需 Anthropic Messages 兼容接口",
  },
  {
    id: "custom",
    label: "自定义",
    baseUrl: "",
    provider: "unknown",
    protocol: "anthropic-messages",
    hint: "自行填写 Base URL",
  },
];

export function presetForBaseUrl(baseUrl: string): ApiProviderPresetId {
  const u = baseUrl.trim().replace(/\/+$/, "").toLowerCase();
  if (!u) return "deepseek";
  for (const p of API_PROVIDER_PRESETS) {
    if (p.id === "custom" || !p.baseUrl) continue;
    if (u === p.baseUrl.replace(/\/+$/, "").toLowerCase()) return p.id;
  }
  return "custom";
}

export function detectProvider(baseUrl: string): ProviderId {
  const u = baseUrl.toLowerCase();
  if (u.includes("deepseek")) return "deepseek";
  if (u.includes("openai") || u.includes("api.openai.com")) return "openai";
  if (u.includes("anthropic") || u.includes("claude")) return "anthropic";
  if (u.includes("moonshot") || u.includes("kimi")) return "kimi";
  if (u.includes("bigmodel") || u.includes("zhipu") || u.includes("glm")) return "glm";
  return "unknown";
}

/** Current Lab Coding binary speaks Anthropic Messages; custom gateways default to it. */
export function protocolForProvider(provider: ProviderId): ApiProtocol {
  return provider === "openai" || provider === "kimi" || provider === "glm"
    ? "openai-chat"
    : "anthropic-messages";
}

export function providerBrand(provider: ProviderId): string | undefined {
  if (provider === "deepseek") return "deepseek";
  if (provider === "openai") return "openai";
  if (provider === "anthropic") return "claude";
  if (provider === "kimi") return "kimi";
  if (provider === "glm") return "glm";
  return undefined;
}

const PROVIDER_LABELS: Record<ProviderId, string> = {
  deepseek: "DeepSeek",
  openai: "OpenAI",
  anthropic: "Anthropic",
  kimi: "Kimi",
  glm: "GLM",
  unknown: "自定义 API",
};

/** A safe, recognizable label for the one API configuration currently in use. */
export function describeApiSource(config: CustomApiConfig): string {
  let host = "未配置地址";
  try {
    host = new URL(config.baseUrl).host || host;
  } catch {
    // Never echo an arbitrary URL here: custom URLs may contain credentials.
  }
  const source = config.source === "env" ? "环境配置" : config.source === "user" ? "本机配置" : "待配置";
  return `${PROVIDER_LABELS[config.provider] || "自定义 API"} · ${host} · ${source}`;
}

export function modelListStatusHint(config: CustomApiConfig): string {
  if (config.protocol === "openai-chat") {
    return "接口返回了模型列表，但当前 Coding 引擎要求 Anthropic Messages 兼容协议。";
  }
  return config.verification === "verified"
    ? "已确认模型列表可读取；列表中的模型尚未逐个实测生成。"
    : "模型列表连接状态不代表每个模型都能正常生成。";
}

/** Pretty-print model ids with known DeepSeek product names */
const KNOWN_MODEL_NAMES: Record<string, string> = {
  "deepseek-flash": "DeepSeek V4.1 Flash",
  "deepseek-v4-flash": "DeepSeek V4.1 Flash",
  "deepseek-v4.1-flash": "DeepSeek V4.1 Flash",
  "deepseek-v4-pro": "DeepSeek V4 Pro",
  "deepseek-pro": "DeepSeek V4 Pro",
  "deepseek-chat": "DeepSeek Chat",
  "deepseek-reasoner": "DeepSeek Reasoner",
  "deepseek-coder": "DeepSeek Coder",
};

export function prettifyModelId(id: string): string {
  const raw = id.trim();
  if (!raw) return raw;
  const known = KNOWN_MODEL_NAMES[raw.toLowerCase()];
  if (known) return known;
  // deepseek-v4-flash-xxx → DeepSeek V4 Flash Xxx
  return raw
    .replace(/^deepseek[-_]?/i, "DeepSeek ")
    .replace(/^gpt[-_]?/i, "GPT ")
    .replace(/^claude[-_]?/i, "Claude ")
    .replace(/[-_]+/g, " ")
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

export function loadCustomApi(): CustomApiConfig {
  try {
    const raw = localStorage.getItem(CUSTOM_API_KEY);
    if (!raw) return emptyApi();
    const d = JSON.parse(raw);
    const baseUrl = typeof d.baseUrl === "string" ? d.baseUrl : "";
    const provider = (d.provider as ProviderId) || detectProvider(baseUrl);
    const parsedModels = Array.isArray(d.models)
      ? d.models.map((m: Partial<FetchedModel> & { key?: string; name?: string }) => {
          const rawId = (
            typeof m.id === "string"
              ? m.id
              : typeof m.key === "string"
                ? m.key.replace(/^custom:/, "")
                : ""
          ).trim();
            if (!rawId) return null;
            const modelProvider = (m.provider as ProviderId) || provider;
            const id = canonicalModelId(modelProvider, rawId);
            // Always remapp known product names (stale localStorage e.g. "DeepSeek Flash")
            return {
              id,
              name: prettifyModelId(id),
              ownedBy: typeof m.ownedBy === "string" ? m.ownedBy : undefined,
              provider,
            } satisfies FetchedModel;
        })
          .filter(Boolean) as FetchedModel[]
      : [];
    const models = dedupeModelsById(parsedModels);
    const protocol: ApiProtocol =
      d.protocol === "openai-chat" || d.protocol === "anthropic-messages"
        ? d.protocol
        : protocolForProvider(provider);
    const verification: ApiVerificationState =
      d.verification === "checking" || d.verification === "verified" || d.verification === "error"
        ? d.verification
        : "unverified";
    const source: ApiConfigSource | undefined = d.source === "env" || d.source === "user" ? d.source : undefined;
    return {
      baseUrl,
      apiKey: typeof d.apiKey === "string" ? d.apiKey : "",
      provider,
      protocol,
      models,
      verification,
      verifiedAt: typeof d.verifiedAt === "number" ? d.verifiedAt : undefined,
      lastError: typeof d.lastError === "string" ? d.lastError : undefined,
      source,
    };
  } catch {
    return emptyApi();
  }
}

function emptyApi(): CustomApiConfig {
  const deepseek = API_PROVIDER_PRESETS.find((p) => p.id === "deepseek")!;
  return {
    baseUrl: deepseek.baseUrl,
    apiKey: "",
    provider: "deepseek",
    protocol: "anthropic-messages",
    models: [],
    verification: "unverified",
    source: undefined,
  };
}

export function saveCustomApi(cfg: CustomApiConfig) {
  try {
    // Credentials belong in Electron's OS-backed safeStorage, never renderer localStorage.
    localStorage.setItem(CUSTOM_API_KEY, JSON.stringify(withoutApiKey(cfg)));
  } catch {}
}

export function loadChatModelKey(fallbackModels: FetchedModel[]): string {
  try {
    const saved = localStorage.getItem(CHAT_MODEL_KEY);
    if (saved && fallbackModels.some((m) => m.id === saved)) return saved;
    const provider = fallbackModels[0]?.provider;
    const canonicalSaved = saved ? canonicalModelId(provider, saved) : "";
    if (canonicalSaved && fallbackModels.some((m) => m.id === canonicalSaved)) return canonicalSaved;
  } catch {}
  return fallbackModels[0]?.id ?? "";
}

/**
 * Normal-mode picker: every model returned by the user's API key
 * (DeepSeek / Kimi / GLM / …) via GET /models — no hardcoded catalog.
 * Trailing「添加 API…」for refresh / credential change.
 */
export function buildChatModels(custom: CustomApiConfig): PromptModel[] {
  const brand = providerBrand(custom.provider) || providerBrand(detectProvider(custom.baseUrl));
  const models = dedupeModelsById(custom.models);
  const displayNameCounts = new Map<string, number>();
  for (const model of models) {
    const name = prettifyModelId(model.id).toLocaleLowerCase();
    displayNameCounts.set(name, (displayNameCounts.get(name) || 0) + 1);
  }
  const statusTag =
    custom.verification === "verified"
      ? undefined
      : custom.verification === "error"
        ? "列表读取失败"
        : custom.verification === "checking"
          ? "读取中"
          : "列表未读取";
  const rows: PromptModel[] = models.map((m) => ({
    key: m.id,
    name: prettifyModelId(m.id),
    // Keep IDs available only to disambiguate genuinely colliding display names.
    subtitle: displayNameCounts.get(prettifyModelId(m.id).toLocaleLowerCase())! > 1 ? m.id : undefined,
    tag:
      custom.protocol === "openai-chat"
        ? "协议不兼容"
        : m.ownedBy || statusTag || custom.provider,
    brand: providerBrand(m.provider) || brand,
    disabled: custom.protocol === "openai-chat",
  }));
  rows.push({ key: "__add_api__", name: "添加 / 刷新 API…", tag: "配置" });
  return rows;
}

/** Normalize OpenAI-style /models JSON into FetchedModel[] */
export function mapModelsResponse(
  payload: unknown,
  provider: ProviderId,
): FetchedModel[] {
  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const out: FetchedModel[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const id = (row as { id?: unknown }).id;
    if (typeof id !== "string" || !id.trim()) continue;
    const ownedBy = (row as { owned_by?: unknown }).owned_by;
    const canonicalId = canonicalModelId(provider, id);
    out.push({
      id: canonicalId,
      name: prettifyModelId(canonicalId),
      ownedBy: typeof ownedBy === "string" ? ownedBy : undefined,
      provider,
    });
  }
  return dedupeModelsById(out).sort((a, b) => a.name.localeCompare(b.name));
}

/** Build candidate /models URLs from a user-entered base. */
export function modelsEndpointCandidates(baseUrl: string): string[] {
  const raw = baseUrl.trim().replace(/\/+$/, "");
  if (!raw) return [];
  const urls = new Set<string>();
  if (/\/models$/i.test(raw)) {
    urls.add(raw);
    return [...urls];
  }
  if (/\/v1$/i.test(raw)) {
    urls.add(`${raw}/models`);
  } else {
    urls.add(`${raw}/models`);
    urls.add(`${raw}/v1/models`);
  }
  return [...urls];
}
