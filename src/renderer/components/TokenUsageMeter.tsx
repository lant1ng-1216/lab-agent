import type { SectionTokenTotals, TokenUsageSnapshot } from "@shared/protocol";
import {
  contextTokensUsed,
  formatContextWindow,
  formatTokenCount,
  resolveModelContextLimit,
  sectionBilledTokens,
  turnUsageTitle,
} from "../lib/tokenUsage";

/** Cache hit rate: cache_read / (input + cache_read + cache_create) */
export function cacheHitPercent(u: TokenUsageSnapshot): number | null {
  const read = u.cacheReadTokens || 0;
  const create = u.cacheCreationTokens || 0;
  const input = u.inputTokens || 0;
  const denom = input + read + create;
  if (denom <= 0) return null;
  if (read <= 0 && create <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((read / denom) * 100)));
}

/** Per-turn: total + ↑input ↓output + hit% (bubble bottom). */
export function TurnTokenFooter({ usage }: { usage?: TokenUsageSnapshot }) {
  if (!usage) return null;
  const inTok = usage.inputTokens || 0;
  const outTok = usage.outputTokens || 0;
  const total = inTok + outTok;
  const hit = cacheHitPercent(usage);
  if (total === 0 && hit == null) return null;

  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] tabular-nums text-[var(--lab-ink-3)]"
      title={turnUsageTitle(usage)}
    >
      <span>{formatTokenCount(total)} token</span>
      <span className="opacity-40">·</span>
      <span title="输入">↑{formatTokenCount(inTok)}</span>
      <span title="输出">↓{formatTokenCount(outTok)}</span>
      {hit != null ? (
        <>
          <span className="opacity-40">·</span>
          <span title="缓存命中率">命中 {hit}%</span>
        </>
      ) : null}
    </div>
  );
}

type SectionMeterProps = {
  totals?: SectionTokenTotals | null;
  lastUsage?: TokenUsageSnapshot | null;
  modelId?: string | null;
  compactHint?: string | null;
  /** Inline for fixed titlebar (default). */
  variant?: "titlebar" | "block";
};

/**
 * Section total + context fill with visualization.
 * titlebar: compact row after folder name; does not scroll with chat.
 */
export function SectionTokenMeter({
  totals,
  lastUsage,
  modelId,
  compactHint,
  variant = "titlebar",
}: SectionMeterProps) {
  const limit = resolveModelContextLimit(modelId);
  const hasTotals = Boolean(totals && (totals.turns > 0 || sectionBilledTokens(totals) > 0));
  const ctxUsed = lastUsage ? contextTokensUsed(lastUsage) : 0;
  const pct =
    lastUsage && limit.contextWindow > 0
      ? Math.min(100, Math.max(0, Math.round((ctxUsed / limit.contextWindow) * 100)))
      : null;

  if (!hasTotals && pct === null && !compactHint) return null;

  const barTone =
    pct == null
      ? "var(--lab-ink-3)"
      : pct >= 90
        ? "var(--lab-danger, #c45c5c)"
        : pct >= 70
          ? "var(--lab-warn, #c4a35c)"
          : "var(--lab-ink-3)";

  const titleParts = [
    totals
      ? `本节累计 in ${totals.inputTokens} · out ${totals.outputTokens} · ${totals.turns} 轮`
      : null,
    lastUsage
      ? `上下文占用 ${ctxUsed} / ${limit.contextWindow} (${limit.source === "official" ? "官方" : "估计"})`
      : `窗口 ${formatContextWindow(limit.contextWindow)} (${limit.source === "official" ? "官方" : "估计"})`,
    compactHint || null,
  ].filter(Boolean);

  const label = (
    <span className="flex min-w-0 items-center gap-1.5 tabular-nums">
      {compactHint ? <span className="text-[var(--lab-ink-2)]">{compactHint}</span> : null}
      {hasTotals && totals ? (
        <span>本节 {formatTokenCount(sectionBilledTokens(totals))}</span>
      ) : (
        <span>本节 —</span>
      )}
      <span className="opacity-40">·</span>
      {pct != null ? (
        <span>
          上下文 {pct}% / {formatContextWindow(limit.contextWindow)}
          {limit.source === "estimate" ? <span className="ml-0.5 opacity-70">估</span> : null}
        </span>
      ) : (
        <span>上下文 — / {formatContextWindow(limit.contextWindow)}</span>
      )}
    </span>
  );

  const bar = (
    <span
      className="inline-block h-[3px] w-[52px] shrink-0 overflow-hidden rounded-full bg-[var(--lab-border-soft)]"
      aria-hidden
    >
      <span
        className="block h-full rounded-full transition-[width] duration-300 ease-out"
        style={{
          width: `${pct ?? 0}%`,
          background: barTone,
          opacity: pct == null ? 0.25 : 0.9,
        }}
      />
    </span>
  );

  if (variant === "titlebar") {
    return (
      <div
        className="titlebar-no-drag ml-2 flex min-w-0 max-w-[min(420px,46vw)] items-center gap-2 text-[11px] text-[var(--lab-ink-3)]"
        title={titleParts.join("\n")}
      >
        {bar}
        <span className="min-w-0 truncate">{label}</span>
      </div>
    );
  }

  return (
    <div className="mb-3 px-1" title={titleParts.join("\n")}>
      <div className="flex items-center gap-2 text-[11px] text-[var(--lab-ink-3)]">
        {bar}
        {label}
      </div>
    </div>
  );
}
