/** Limits for detecting a genuinely stalled desktop-agent turn. */
export const AGENT_WATCHDOG_LIMITS = {
  noOutputMs: 5 * 60_000,
  toolNoOutputMs: 10 * 60_000,
  shellNoOutputMs: 15 * 60_000,
} as const;

export type AgentWatchdogStopReason = "idle" | "tool-idle" | "shell-idle";

export interface AgentWatchdogSnapshot {
  turnBusy: boolean;
  permissionPending: boolean;
  runningTool: boolean;
  runningShell: boolean;
  now: number;
  lastActivityAt: number;
}

/** A pending user decision suspends automatic timeouts until the user responds. */
export function getAgentWatchdogStopReason(
  snapshot: AgentWatchdogSnapshot,
): AgentWatchdogStopReason | null {
  if (!snapshot.turnBusy || snapshot.permissionPending) return null;

  const idleLimit = snapshot.runningShell
    ? AGENT_WATCHDOG_LIMITS.shellNoOutputMs
    : snapshot.runningTool
      ? AGENT_WATCHDOG_LIMITS.toolNoOutputMs
      : AGENT_WATCHDOG_LIMITS.noOutputMs;
  if (snapshot.now - snapshot.lastActivityAt < idleLimit) return null;

  return snapshot.runningShell ? "shell-idle" : snapshot.runningTool ? "tool-idle" : "idle";
}
