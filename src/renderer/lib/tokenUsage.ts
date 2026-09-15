import type { SectionTokenTotals, TokenUsageSnapshot } from "@shared/protocol";
import {
  contextTokensUsed,
  formatContextWindow,
  formatTokenCount,
  resolveModelContextLimit,
} from "@shared/modelContext";

export function emptySectionTotals(): SectionTokenTotals {
  return {
    inputTokens: 0,
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
  const base = prev ?? emptySectionTotals();
  return {
    inputTokens: base.inputTokens + (usage.inputTokens || 0),
    outputTokens: base.outputTokens + (usage.outputTokens || 0),
    cacheReadTokens: base.cacheReadTokens + (usage.cacheReadTokens || 0),
    cacheCreationTokens: base.cacheCreationTokens + (usage.cacheCreationTokens || 0),
    turns: base.turns + 1,
  };
}

export function sectionBilledTokens(t: SectionTokenTotals): number {
  return t.inputTokens + t.outputTokens;
}

export function turnUsageTitle(u: TokenUsageSnapshot): string {
  const parts = [
    `input ${u.inputTokens}`,
    `output ${u.outputTokens}`,
  ];
  if (u.cacheReadTokens) parts.push(`cache read ${u.cacheReadTokens}`);
  if (u.cacheCreationTokens) parts.push(`cache write ${u.cacheCreationTokens}`);
  return parts.join(" · ");
}

export {
  contextTokensUsed,
  formatContextWindow,
  formatTokenCount,
  resolveModelContextLimit,
};
