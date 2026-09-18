export interface ChatScrollMetrics {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}

export const CHAT_BOTTOM_THRESHOLD_PX = 32;
export const CHAT_FOLLOW_RESUME_DELAY_MS = 2_500;
export const CHAT_MANUAL_BROWSE_MIN_DISTANCE_PX = 320;
export const CHAT_MANUAL_BROWSE_VIEWPORT_RATIO = 0.75;

export function chatDistanceFromBottom(metrics: ChatScrollMetrics): number {
  return Math.max(0, metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight);
}

export function isNearChatBottom(
  metrics: ChatScrollMetrics,
  threshold = CHAT_BOTTOM_THRESHOLD_PX,
): boolean {
  return chatDistanceFromBottom(metrics) <= threshold;
}

/**
 * A large move away from the latest content means the user is browsing history;
 * keep following paused instead of snapping them back after the idle timer.
 */
export function isIntentionalChatBrowse(
  metrics: ChatScrollMetrics,
  scrollDeltaY = 0,
): boolean {
  const distanceAfterScroll = Math.max(0, chatDistanceFromBottom(metrics) - scrollDeltaY);
  const browseThreshold = Math.max(
    CHAT_MANUAL_BROWSE_MIN_DISTANCE_PX,
    metrics.clientHeight * CHAT_MANUAL_BROWSE_VIEWPORT_RATIO,
  );
  return distanceAfterScroll >= browseThreshold;
}

export function chatBottomInset(composerHeight: number, gap = 32): number {
  return Math.max(0, Math.ceil(composerHeight)) + gap;
}
