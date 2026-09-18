import type { SectionTokenTotals, TokenUsageSnapshot } from "@shared/protocol";
import {
  addUsageToSectionTotals,
  contextTokensUsed,
  cacheHitPercent,
  formatContextWindow,
  formatTokenCount,
  reportedTurnTokens,
  resolveModelContextLimit,
} from "@shared/modelContext";

export function emptySectionTotals(): SectionTokenTotals {
  return {
    inputTokens: 0,
    totalInputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    turns: 0,
  };
}

export function addUsageToTotals(
  prev: SectionTokenTotals | null | undefined,
  usage: TokenUsageSnapshot,
): SectionTokenTotals {
  return addUsageToSectionTotals(prev ?? emptySectionTotals(), usage);
}

export function sectionBilledTokens(t: SectionTokenTotals): number {
  return reportedTurnTokens(t);
}

export function turnUsageTitle(u: TokenUsageSnapshot, requestCount?: number): string {
  const parts = [
    `本次 Agent 任务累计处理 ${reportedTurnTokens(u)} tokens = 输入 ${contextTokensUsed(u)} + 输出 ${u.outputTokens || 0}`,
    `输入来源：${u.usageFormat === "openai" ? "prompt_tokens（已含缓存）" : "input_tokens + cache read + cache create"}`,
  ];
  if (requestCount != null) parts.push(`独立模型响应 ${requestCount} 次；上下文峰值按单次响应计算`);
  if (u.cacheReadTokens) parts.push(`cache read ${u.cacheReadTokens}`);
  if (u.cacheCreationTokens) parts.push(`cache create ${u.cacheCreationTokens}`);
  return parts.join(" · ");
}

export {
  contextTokensUsed,
  cacheHitPercent,
  formatContextWindow,
  formatTokenCount,
  reportedTurnTokens,
  resolveModelContextLimit,
};
