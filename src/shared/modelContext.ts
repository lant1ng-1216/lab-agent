/**
 * Model context-window registry for Desktop meters + engine alignment hints.
 * Official numbers where known; unknown models fall back to 200k (estimate).
 */

import type { SectionTokenTotals, TokenUsageSnapshot } from './protocol';

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

type UsageShape = {
  inputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  inputIncludesCache?: boolean;
};

/** Normalize provider usage into the total input represented by one snapshot. */
export function contextTokensUsed(u: UsageShape): number {
  if (u.inputIncludesCache) return u.inputTokens || 0;
  return (u.inputTokens || 0) + (u.cacheCreationTokens || 0) + (u.cacheReadTokens || 0);
}

/** API usage formats differ: Anthropic splits cache input; OpenAI prompt_tokens includes it. */
export function parseTokenUsageSnapshot(raw: unknown): import('./protocol').TokenUsageSnapshot | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const u = raw as Record<string, unknown>;
  const isTokenNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const num = (value: unknown) => isTokenNumber(value) ? value : 0;
  const detailsValue = u.prompt_tokens_details ?? u.input_tokens_details;
  const details = detailsValue && typeof detailsValue === 'object'
    ? detailsValue as Record<string, unknown>
    : {};
  const hasOpenAiPrompt =
    'prompt_tokens' in u ||
    'prompt_cache_hit_tokens' in u ||
    'prompt_cache_miss_tokens' in u ||
    'input_tokens_details' in u;
  if (hasOpenAiPrompt) {
    const prompt = isTokenNumber(u.prompt_tokens)
      ? u.prompt_tokens
      : isTokenNumber(u.input_tokens) ? u.input_tokens : undefined;
    const cacheHit = isTokenNumber(u.prompt_cache_hit_tokens)
      ? u.prompt_cache_hit_tokens
      : isTokenNumber(details.cached_tokens) ? details.cached_tokens : undefined;
    const cacheMiss = isTokenNumber(u.prompt_cache_miss_tokens) ? u.prompt_cache_miss_tokens : undefined;
    if (prompt === undefined && (cacheHit === undefined || cacheMiss === undefined)) return undefined;
    const cached = cacheHit ?? 0;
    const input = prompt ?? (cached + (cacheMiss ?? 0));
    return {
      inputTokens: input,
      outputTokens: num(u.completion_tokens ?? u.output_tokens),
      cacheReadTokens: cached || undefined,
      inputIncludesCache: true,
      usageFormat: 'openai',
    };
  }

  const anthropicKeys = ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'];
  if (!anthropicKeys.some((key) => key in u)) return undefined;
  if (!isTokenNumber(u.input_tokens)) return undefined;
  return {
    inputTokens: num(u.input_tokens),
    outputTokens: num(u.output_tokens),
    cacheReadTokens: num(u.cache_read_input_tokens) || undefined,
    cacheCreationTokens: num(u.cache_creation_input_tokens) || undefined,
    inputIncludesCache: false,
    usageFormat: 'anthropic',
  };
}

/** Total input plus output represented by this snapshot (request or task aggregate). */
export function reportedTurnTokens(u: UsageShape & { outputTokens: number; totalInputTokens?: number }): number {
  return (u.totalInputTokens ?? contextTokensUsed(u)) + (u.outputTokens || 0);
}

/** Cache read share of total input represented by one usage snapshot. */
export function cacheHitPercent(u: UsageShape): number | null {
  const read = u.cacheReadTokens || 0;
  const create = u.cacheCreationTokens || 0;
  const denom = contextTokensUsed(u);
  if (denom <= 0 || (read <= 0 && create <= 0)) return null;
  return Math.min(100, Math.max(0, Math.round((read / denom) * 100)));
}

/** Keep the snapshot with the largest single-request prompt; never compare task sums to a window. */
export function peakContextUsage<T extends UsageShape>(
  current: T | undefined,
  candidate: T,
): T {
  return !current || contextTokensUsed(candidate) > contextTokensUsed(current) ? candidate : current;
}

/** Accumulate task/section usage without losing the provider-normalized input total. */
export function addUsageToSectionTotals(
  previous: SectionTokenTotals | null | undefined,
  usage: TokenUsageSnapshot,
): SectionTokenTotals {
  const base = previous ?? {
    inputTokens: 0,
    totalInputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    turns: 0,
  };
  return {
    inputTokens: base.inputTokens + (usage.inputTokens || 0),
    totalInputTokens: (base.totalInputTokens ?? contextTokensUsed(base)) + contextTokensUsed(usage),
    outputTokens: base.outputTokens + (usage.outputTokens || 0),
    cacheReadTokens: base.cacheReadTokens + (usage.cacheReadTokens || 0),
    cacheCreationTokens: base.cacheCreationTokens + (usage.cacheCreationTokens || 0),
    turns: base.turns + 1,
  };
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
