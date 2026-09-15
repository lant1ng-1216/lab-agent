/** Lab Coding / Claude-compatible permission modes for Desktop */

export type PermissionModeId = "default" | "acceptEdits" | "bypassPermissions";

export const PERMISSION_MODE_KEY = "lab.permissionMode.v1";

export const PERMISSION_MODES: {
  id: PermissionModeId;
  name: string;
  short: string;
  desc: string;
}[] = [
  {
    id: "acceptEdits",
    name: "信任工作区",
    short: "信任",
    desc: "工作区内读写自动允许；高风险命令仍询问",
  },
  {
    id: "default",
    name: "每次询问",
    short: "询问",
    desc: "敏感操作前都征求批准",
  },
  {
    id: "bypassPermissions",
    name: "完全允许",
    short: "允许",
    desc: "本机会话尽量不打断（仍会问你选择题）",
  },
];

export function loadPermissionMode(): PermissionModeId {
  try {
    const v = localStorage.getItem(PERMISSION_MODE_KEY);
    if (v === "default" || v === "acceptEdits" || v === "bypassPermissions") return v;
  } catch {}
  return "acceptEdits";
}

export function savePermissionMode(mode: PermissionModeId) {
  try {
    localStorage.setItem(PERMISSION_MODE_KEY, mode);
  } catch {}
}

export function permissionModeMeta(id: PermissionModeId) {
  return PERMISSION_MODES.find((m) => m.id === id) ?? PERMISSION_MODES[0];
}
