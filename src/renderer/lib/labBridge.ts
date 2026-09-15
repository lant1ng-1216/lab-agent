/** True when running inside Electron with preload bridge. */
export function hasLabBridge(): boolean {
  return typeof window !== "undefined" && typeof window.lab !== "undefined" && typeof window.lab.pickFolder === "function";
}

export const LAB_PREVIEW_HINT = "请在桌面端（Electron）使用：终端运行 npm run dev";
