import { redactSensitiveText } from "./protocol";

export const DESKTOP_RUNTIME_MARKER = "desktop-diagnostics-v1";

export function isLikelyToolFailure(isError: boolean, output: string): boolean {
  return isError || /no such tool available|tool not found|permission denied|(?:^|\n)\s*(?:fatal|error|failed):|repository not found|could not resolve|failed to connect|destination path .* already exists|unable to access/i.test(output);
}

export function sanitizeDesktopDiagnostic(
  value: string,
  homeDirectory = "",
  maxLength = 1_000,
): string {
  let text = redactSensitiveText(value);
  text = text
    .replace(/\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_-]{8,}\b/gi, "[token hidden]")
    .replace(/((?:api[-_ ]?key|authorization|token|password|secret)\s*[:=]\s*)([^\s,;]+)/gi, "$1[hidden]")
    .replace(/https?:\/\/[^\s"'<>]+/gi, (rawUrl) => {
      try {
        const url = new URL(rawUrl);
        url.username = "";
        url.password = "";
        url.search = "";
        url.hash = "";
        return url.toString();
      } catch {
        return rawUrl.replace(/[?#].*$/, "");
      }
    });
  if (homeDirectory) text = text.split(homeDirectory).join("~");
  return text.replace(/\s+/g, " ").trim().slice(0, maxLength);
}
