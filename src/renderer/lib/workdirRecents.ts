const RECENTS_KEY = "lab.workdir.recents.v1";
const MAX_RECENTS = 12;

export function loadWorkdirRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
  } catch {
    return [];
  }
}

export function pushWorkdirRecent(dir: string): string[] {
  const next = [dir, ...loadWorkdirRecents().filter((d) => d !== dir)].slice(0, MAX_RECENTS);
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function removeWorkdirRecent(dir: string): string[] {
  const next = loadWorkdirRecents().filter((d) => d !== dir);
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function workdirLabel(dir: string | null | undefined): string {
  if (!dir) return "未选择目录";
  const parts = dir.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || dir;
}
