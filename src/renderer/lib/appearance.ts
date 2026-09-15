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
/** One-shot: wipe stale dark/璃 prefs from pre-0.1.2 installs so product default wins once. */
const DEFAULTS_MIGRATION_KEY = "lab.appearance.defaults.v2";

export const DEFAULT_APPEARANCE: AppearanceState = {
  pack: "default",
  mode: "light",
};

function readStoredAppearance(): AppearanceState {
  let pack: AppearancePackId = DEFAULT_APPEARANCE.pack;
  let mode: ColorMode = DEFAULT_APPEARANCE.mode;
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

export function loadAppearance(): AppearanceState {
  try {
    if (!localStorage.getItem(DEFAULTS_MIGRATION_KEY)) {
      saveAppearance(DEFAULT_APPEARANCE);
      localStorage.setItem(DEFAULTS_MIGRATION_KEY, "1");
      return { ...DEFAULT_APPEARANCE };
    }
  } catch {
    /* ignore */
  }
  return readStoredAppearance();
}

/** Reset to product default (默认皮肤 + 白昼) and keep migration flag set. */
export function resetAppearanceToDefaults(): AppearanceState {
  const next = { ...DEFAULT_APPEARANCE };
  saveAppearance(next);
  try {
    localStorage.setItem(DEFAULTS_MIGRATION_KEY, "1");
  } catch {
    /* ignore */
  }
  return next;
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
