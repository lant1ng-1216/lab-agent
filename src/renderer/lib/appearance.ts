/**
 * Appearance pack + day/night mode.
 * - default: solid Lab shell tokens
 * - skin (璃 / Glass): full-window fluid text (day) / skull (night) + glass chrome
 */

export type AppearancePackId = "default" | "skin";
export type ColorMode = "light" | "dark";

export interface AppearanceState {
  pack: AppearancePackId;
  mode: ColorMode;
}

const PACK_KEY = "lab.appearancePack.v1";
const MODE_KEY = "lab.theme"; // keep existing key so current theme survives

export function loadAppearance(): AppearanceState {
  let pack: AppearancePackId = "default";
  // Product default: 白昼 (light). Persisted user choice still wins when present.
  let mode: ColorMode = "light";
  try {
    const p = localStorage.getItem(PACK_KEY);
    if (p === "default" || p === "skin") pack = p;
  } catch {
    /* ignore */
  }
  try {
    const t = localStorage.getItem(MODE_KEY);
    if (t === "light" || t === "dark") mode = t;
  } catch {
    /* ignore */
  }
  return { pack, mode };
}

export function saveAppearance(next: AppearanceState) {
  try {
    localStorage.setItem(PACK_KEY, next.pack);
    localStorage.setItem(MODE_KEY, next.mode);
  } catch {
    /* ignore */
  }
}

/** Apply to <html> — color mode drives tokens; pack drives 璃 glass chrome. */
export function applyAppearanceToDocument(state: AppearanceState) {
  const root = document.documentElement;
  root.classList.toggle("dark", state.mode === "dark");
  root.setAttribute("data-theme", state.mode);
  root.setAttribute("data-lab-theme", state.mode);
  root.setAttribute("data-appearance", state.pack);
}

export const APPEARANCE_PACKS: {
  id: AppearancePackId;
  title: string;
  desc: string;
  placeholder?: boolean;
}[] = [
  {
    id: "default",
    title: "默认",
    desc: "实色壳 · 侧栏切昼夜",
  },
  {
    id: "skin",
    title: "璃 / Glass",
    desc: "fluid / skull · 侧栏切昼夜",
  },
];
