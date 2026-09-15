/** Per-section recent file paths for the Normal-mode file workspace. */

const PREFIX = "lab.fileRecents.";
const MAX = 24;

function key(sessionKey: string) {
  return `${PREFIX}${sessionKey}`;
}

export function loadFileRecents(sessionKey: string | null | undefined): string[] {
  if (!sessionKey) return [];
  try {
    const raw = localStorage.getItem(key(sessionKey));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((p): p is string => typeof p === "string" && p.length > 0).slice(0, MAX);
  } catch {
    return [];
  }
}

export function pushFileRecent(sessionKey: string | null | undefined, path: string): string[] {
  if (!sessionKey || !path) return [];
  const next = [path, ...loadFileRecents(sessionKey).filter((p) => p !== path)].slice(0, MAX);
  try {
    localStorage.setItem(key(sessionKey), JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
