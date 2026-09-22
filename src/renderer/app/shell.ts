/**
 * Shared app-shell primitives extracted from App.tsx.
 *
 * This layer holds the pieces that used to live inline in the 2.5k-line
 * App component: layout constants, small local-storage helpers and the
 * profile/shell-mode loaders. Behaviour is intentionally identical — this is
 * a pure move so the shell can be shrunk without touching semantics.
 */
import type { ShellMode } from "../../lib/sessionStores";
import { FILE_SIDEBAR_DEFAULT_WIDTH } from "../../components/FileWorkspaceSidebar";

export const SIDEBAR_KEY = "lab.sidebar.width";
export const SIDEBAR_MIN = 220;
export const SIDEBAR_MAX = 360;
export const SIDEBAR_RAIL = 56;

export const INSPECTOR_KEY = "lab.inspector.width";
export const INSPECTOR_MIN = 320;
export const INSPECTOR_MAX = 640;

export const FILE_SIDE_KEY = "lab.fileSide.width";
export const FILE_SIDE_MIN = 340;
export const FILE_SIDE_MAX = 640;

export const PROFILE_KEY = "lab.profile.v1";
export const SHELL_MODE_KEY = "lab.shellMode";
const DEFAULT_AVATAR_SEED = "lab-guest";

export function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(v)));
}

export function readNum(key: string, fallback: number, min: number, max: number) {
  try {
    const raw = localStorage.getItem(key);
    const n = raw != null ? Number(raw) : fallback;
    return Number.isFinite(n) ? clamp(n, min, max) : fallback;
  } catch {
    return fallback;
  }
}

export interface LocalProfile {
  displayName: string;
  avatarSeed: string;
}

export function loadProfile(): LocalProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return { displayName: "", avatarSeed: DEFAULT_AVATAR_SEED };
    const d = JSON.parse(raw);
    return {
      displayName: typeof d.displayName === "string" ? d.displayName : "",
      avatarSeed: typeof d.avatarSeed === "string" && d.avatarSeed ? d.avatarSeed : DEFAULT_AVATAR_SEED,
    };
  } catch {
    return { displayName: "", avatarSeed: DEFAULT_AVATAR_SEED };
  }
}

export function loadShellMode(): ShellMode {
  try {
    const v = localStorage.getItem(SHELL_MODE_KEY);
    if (v === "supervisor") {
      // The supervisor shell is still being built. Migrate old installs back
      // to the only public mode instead of reopening an unfinished workspace.
      localStorage.setItem(SHELL_MODE_KEY, "normal");
      return "normal";
    }
    if (v === "normal") return v;
  } catch {}
  return "normal";
}

export const FILE_SIDEBAR_FALLBACK_WIDTH = FILE_SIDEBAR_DEFAULT_WIDTH;
