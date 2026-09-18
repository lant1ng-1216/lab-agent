import type { SectionTokenTotals, TokenUsageSnapshot } from "@shared/protocol";
import { formatTokenCount, reportedTurnTokens, sectionBilledTokens } from "../lib/tokenUsage";

const TOKEN_TOTAL_TITLE =
  "累计所有模型请求的输入与输出 Token；多步工具调用会重复计入上下文，不代表上下文窗口占用或费用";

/** Shows only total token processing for the completed Agent task. */
export function TurnTokenFooter({ usage }: { usage?: TokenUsageSnapshot }) {
  if (!usage) return null;
  const total = reportedTurnTokens(usage);
  if (total === 0) return null;

  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] tabular-nums text-[var(--lab-ink-3)]"
      title={TOKEN_TOTAL_TITLE}
    >
      <span>任务累计 {formatTokenCount(total)} tokens</span>
    </div>
  );
}

type SectionMeterProps = {
  totals?: SectionTokenTotals | null;
  compactHint?: string | null;
  /** Inline for fixed titlebar (default). */
  variant?: "titlebar" | "block";
};

/** Displays cumulative token processing for the current section. */
export function SectionTokenMeter({
  totals,
  compactHint,
  variant = "titlebar",
}: SectionMeterProps) {
  const hasTotals = Boolean(totals && (totals.turns > 0 || sectionBilledTokens(totals) > 0));
  if (!hasTotals && !compactHint) return null;

  const label = (
    <span className="flex min-w-0 items-center gap-1.5 tabular-nums">
      {hasTotals && totals ? (
        <span>本节累计 {formatTokenCount(sectionBilledTokens(totals))} tokens</span>
      ) : null}
      {compactHint ? <span className="text-[var(--lab-ink-2)]">{compactHint}</span> : null}
    </span>
  );

  if (variant === "titlebar") {
    return (
      <div
        className="titlebar-no-drag ml-2 flex min-w-0 max-w-[min(420px,46vw)] items-center text-[11px] text-[var(--lab-ink-3)]"
        title={TOKEN_TOTAL_TITLE}
      >
        <span className="min-w-0 truncate">{label}</span>
      </div>
    );
  }

  return (
    <div className="mb-3 px-1" title={TOKEN_TOTAL_TITLE}>
      <div className="flex items-center text-[11px] text-[var(--lab-ink-3)]">{label}</div>
    </div>
  );
}
