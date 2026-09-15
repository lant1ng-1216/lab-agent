import type { PromptModel } from "../harness/beautiful-ui/PromptBar";

export const CUSTOM_API_KEY = "lab.customApi.v1";
export const CHAT_MODEL_KEY = "lab.chatModel";
export const FETCHED_MODELS_KEY = "lab.fetchedModels.v1";

export type ProviderId = "deepseek" | "openai" | "anthropic" | "unknown";

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
  /** Last successfully fetched models for this credential */
  models: FetchedModel[];
}

export function detectProvider(baseUrl: string): ProviderId {
  const u = baseUrl.toLowerCase();
  if (u.includes("deepseek")) return "deepseek";
  if (u.includes("openai") || u.includes("api.openai.com")) return "openai";
  if (u.includes("anthropic") || u.includes("claude")) return "anthropic";
  // Moonshot / Kimi, Zhipu / GLM use OpenAI-compatible /models — brand unknown is fine
  if (u.includes("moonshot") || u.includes("kimi")) return "unknown";
  if (u.includes("bigmodel") || u.includes("zhipu") || u.includes("glm")) return "unknown";
  return "unknown";
}

export function providerBrand(provider: ProviderId): string | undefined {
  if (provider === "deepseek") return "deepseek";
  if (provider === "openai") return "openai";
  if (provider === "anthropic") return "claude";
  return undefined;
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
    const models = Array.isArray(d.models)
      ? d.models
          .map((m: Partial<FetchedModel> & { key?: string; name?: string }) => {
            const id = typeof m.id === "string" ? m.id : typeof m.key === "string" ? m.key.replace(/^custom:/, "") : "";
            if (!id) return null;
            const provider = (m.provider as ProviderId) || detectProvider(baseUrl);
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
    return {
      baseUrl,
      apiKey: typeof d.apiKey === "string" ? d.apiKey : "",
      provider: (d.provider as ProviderId) || detectProvider(baseUrl),
      models,
    };
  } catch {
    return emptyApi();
  }
}

function emptyApi(): CustomApiConfig {
  return { baseUrl: "", apiKey: "", provider: "unknown", models: [] };
}

export function saveCustomApi(cfg: CustomApiConfig) {
  try {
    localStorage.setItem(CUSTOM_API_KEY, JSON.stringify(cfg));
  } catch {}
}

export function loadChatModelKey(fallbackModels: FetchedModel[]): string {
  try {
    const saved = localStorage.getItem(CHAT_MODEL_KEY);
    if (saved && fallbackModels.some((m) => m.id === saved)) return saved;
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
  const rows: PromptModel[] = custom.models.map((m) => ({
    key: m.id,
    name: prettifyModelId(m.id),
    tag: m.ownedBy || custom.provider,
    brand: providerBrand(m.provider) || brand,
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
    out.push({
      id: id.trim(),
      name: prettifyModelId(id.trim()),
      ownedBy: typeof ownedBy === "string" ? ownedBy : undefined,
      provider,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
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
