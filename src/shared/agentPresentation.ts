export type AgentAvatarMotion = "full" | "breathe";

export interface AgentWorkSnapshot {
  status: string;
  streamComplete: boolean;
  hasStreamingMessage: boolean;
  hasRunningTool: boolean;
  hasPermission: boolean;
}

/** A terminal result wins over stale progress flags retained for text reveal. */
export function isAgentTurnWorking(snapshot: AgentWorkSnapshot): boolean {
  if (snapshot.streamComplete) return false;
  return (
    snapshot.hasRunningTool ||
    snapshot.hasStreamingMessage ||
    snapshot.hasPermission ||
    snapshot.status === "thinking" ||
    snapshot.status === "streaming" ||
    snapshot.status === "tool" ||
    snapshot.status === "waiting"
  );
}

/** Keep the full work animation tied to actual work, not final-text rendering. */
export function avatarMotionForTurn(isWorking: boolean): AgentAvatarMotion {
  return isWorking ? "full" : "breathe";
}
