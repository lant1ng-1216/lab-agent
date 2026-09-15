/**
 * Pointer / intro gaze rules from jeremy-prt/bloub (`src/ui/gaze.ts`), MIT.
 * Pure helpers — no DOM. Chat follow is tuned separately (no rest bias / no spin).
 */
import type { Look } from "./bot/engine";
import type { ExpressionId } from "./bot/expressions";
import { clamp, easings } from "./bot/math";

export const YAW_MAX = 16;
export const PITCH_MAX = 13;
export const PITCH = 10;
export const TURN = 26;
export const SPIN = 360;
export const TURN_TIME = 1.1;

/**
 * Chat continuous follow — calmer than the demo “look at settings panel” pose.
 * No lateral bias (CHAT_TURN=0): cursor on the avatar looks straight ahead.
 * No spin: spin is for entrance montages, not pointer tracking.
 */
export const CHAT_YAW_MAX = 22;
export const CHAT_PITCH_MAX = 18;
export const CHAT_PITCH = 8;
export const CHAT_HOVER_GAIN = 1.2;
/** Near-instant target update; avoids re-opening a long morph every frame. */
export const CHAT_LOOK_MORPH = 1 / 60;

export const HUMEURS: readonly ExpressionId[] = [
  "surpris",
  "heureux",
  "hilare",
  "excite",
  "fier",
  "blase",
];

export type GazeScript = (t: number) => Look;

export const TOUR_TIME = 1.5;

export const tourLook: GazeScript = (t) => ({
  yaw: 0,
  pitch: 0,
  mix: 0,
  spin: SPIN * (1 - easings.easeInOutCubic(clamp(t / TOUR_TIME))),
  wander: 1,
});

export interface Aim {
  nx: number;
  ny: number;
  tour: number;
  pointer: boolean;
}

export function lookTarget({ nx, ny, tour, pointer }: Aim): Look {
  return {
    yaw: -TURN + nx * YAW_MAX,
    pitch: PITCH - ny * PITCH_MAX,
    mix: tour,
    spin: SPIN * (1 - tour),
    wander: pointer ? 0 : 1,
  };
}

export type ChatAim = {
  nx: number;
  ny: number;
  /** true = cursor known; eyes lock. false = keep last heading but breathe. */
  pointer: boolean;
  gain?: number;
};

/**
 * Stable chat follow: mix stays 1 while tracking, spin always 0, no rightward bias.
 */
export function lookTargetChat({ nx, ny, pointer, gain = 1 }: ChatAim): Look {
  const g = gain;
  return {
    yaw: nx * CHAT_YAW_MAX * g,
    pitch: CHAT_PITCH - ny * CHAT_PITCH_MAX * g,
    mix: 1,
    spin: 0,
    wander: pointer ? 0 : 1,
  };
}
