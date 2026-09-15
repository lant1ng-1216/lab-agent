/**
 * Model context-window registry for Desktop meters + engine alignment hints.
 * Official numbers where known; unknown models fall back to 200k (estimate).
 */

export type ContextLimitSource = "official" | "estimate";

export interface ModelContextLimit {
  /** Total context window (input+output shared envelope where applicable) */
  contextWindow: number;
  /** Max output tokens when known */
  maxOutput?: number;
  source: ContextLimitSource;
  label?: string;
}

const DEFAULT_WINDOW = 200_000;

/** Normalized id → limit. Keys are lowercase. */
const OFFICIAL: Record<string, ModelContextLimit> = {
  // DeepSeek V4 / V4.1 — official 1M context, 384K max output
  "deepseek-flash": {
    contextWindow: 1_000_000,
    maxOutput: 384_000,
    source: "official",
    label: "DeepSeek V4.1 Flash",
  },
  "deepseek-v4-flash": {
    contextWindow: 1_000_000,
    maxOutput: 384_000,
    source: "official",
    label: "DeepSeek V4 Flash",
  },
  "deepseek-v4.1-flash": {
    contextWindow: 1_000_000,
    maxOutput: 384_000,
    source: "official",
    label: "DeepSeek V4.1 Flash",
  },
  "deepseek-v4-pro": {
    contextWindow: 1_000_000,
    maxOutput: 384_000,
    source: "official",
    label: "DeepSeek V4 Pro",
  },
  "deepseek-pro": {
    contextWindow: 1_000_000,
    maxOutput: 384_000,
    source: "official",
    label: "DeepSeek V4 Pro",
  },
  "deepseek-chat": {
    contextWindow: 128_000,
    source: "official",
    label: "DeepSeek Chat",
  },
  "deepseek-reasoner": {
    contextWindow: 128_000,
    source: "official",
    label: "DeepSeek Reasoner",
  },
};

function normalizeModelId(modelId: string): string {
  return modelId.trim().toLowerCase().replace(/^models\//, "");
}

/**
 * Resolve context window for a model id (provider-agnostic Desktop helper).
 */
export function resolveModelContextLimit(modelId: string | undefined | null): ModelContextLimit {
  if (!modelId || modelId === "__add_api__") {
    return { contextWindow: DEFAULT_WINDOW, source: "estimate" };
  }
  const id = normalizeModelId(modelId);
  if (OFFICIAL[id]) return OFFICIAL[id];

  // Suffix / family heuristics
  if (/deepseek.*(?:v4|flash|pro)/i.test(id) || /(?:v4|flash).*deepseek/i.test(id)) {
    return {
      contextWindow: 1_000_000,
      maxOutput: 384_000,
      source: "official",
      label: modelId,
    };
  }
  if (/\[1m\]/i.test(modelId) || /1m/.test(id) && /claude|sonnet|opus/.test(id)) {
    return { contextWindow: 1_000_000, source: "official", label: modelId };
  }
  if (/claude|sonnet|opus|haiku/.test(id)) {
    return { contextWindow: 200_000, source: "official", label: modelId };
  }
  if (/gpt-4|gpt-5|o[1-9]/.test(id)) {
    return { contextWindow: 128_000, source: "estimate", label: modelId };
  }

  return { contextWindow: DEFAULT_WINDOW, source: "estimate", label: modelId };
}

/** Context fill uses input + cache create + cache read (matches Lab Coding). */
export function contextTokensUsed(u: {
  inputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}): number {
  return (
    (u.inputTokens || 0) +
    (u.cacheCreationTokens || 0) +
    (u.cacheReadTokens || 0)
  );
}

export function formatTokenCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n < 1000) return String(Math.round(n));
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  const m = n / 1_000_000;
  return `${m >= 10 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, "")}M`;
}

export function formatContextWindow(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${m >= 10 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, "")}M`;
  }
  return formatTokenCount(n);
}
