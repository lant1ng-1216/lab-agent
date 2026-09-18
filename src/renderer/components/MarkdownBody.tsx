import type { ReactNode } from "react";

/**
 * Agent reply markdown with visual hierarchy:
 * headings, tables, lists, code, quotes — streaming-safe.
 */
export default function MarkdownBody({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const src = streaming ? text.replace(/^\s+/, "") : text.trim();
  const blocks = splitBlocks(src);
  return (
    <div className="lab-md space-y-3.5 text-[14.5px] leading-[1.65] text-[var(--lab-ink)]">
      {blocks.map((b, i) => (
        <Block key={i} block={b} streaming={streaming} />
      ))}
    </div>
  );
}

type MdBlock =
  | { type: "h"; level: 1 | 2 | 3; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; lines: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "code"; lang?: string; code: string; open?: boolean }
  | { type: "hr" };

type FencePresentation =
  | { kind: "tree" }
  | { kind: "terminal" }
  | { kind: "plain"; label?: string }
  | { kind: "code" | "data"; label: string };

const TERMINAL_LANGUAGES = new Set([
  "bash", "sh", "shell", "zsh", "fish", "console", "terminal", "shellsession",
  "powershell", "pwsh", "ps1", "cmd", "bat", "batch",
]);
const PLAIN_LANGUAGES = new Set(["text", "txt", "plain", "plaintext", "output", "log"]);
const DATA_LANGUAGES = new Set([
  "json", "jsonc", "yaml", "yml", "toml", "xml", "csv", "diff", "patch", "md", "markdown",
]);
const DATA_LABELS: Record<string, string> = {
  json: "JSON",
  jsonc: "JSONC",
  yaml: "YAML",
  yml: "YAML",
  toml: "TOML",
  xml: "XML",
  csv: "CSV",
  diff: "Diff",
  patch: "Patch",
  md: "Markdown",
  markdown: "Markdown",
};
const LANGUAGE_LABELS: Record<string, string> = {
  js: "JavaScript",
  javascript: "JavaScript",
  jsx: "JSX",
  ts: "TypeScript",
  typescript: "TypeScript",
  tsx: "TSX",
  py: "Python",
  python: "Python",
  rb: "Ruby",
  rs: "Rust",
  go: "Go",
  java: "Java",
  cpp: "C++",
  csharp: "C#",
  html: "HTML",
  css: "CSS",
  sql: "SQL",
};

function isFileTree(text: string): boolean {
  const connectorRows = text.split(/\r?\n/).filter((line) =>
    /^\s*(?:(?:│|\|)\s*)*(?:├──|└──|\|--|`--|\\--)/.test(line),
  );
  return connectorRows.length >= 2;
}

function classifyFence(lang: string | undefined, text: string): FencePresentation {
  if (isFileTree(text)) return { kind: "tree" };

  const language = lang?.trim().split(/\s+/, 1)[0].toLowerCase();
  if (language === "tree") return { kind: "tree" };
  if (
    (language && TERMINAL_LANGUAGES.has(language)) ||
    /^\s*(?:[$%]\s+|PS\s+[^\n>]+>\s*)/m.test(text)
  ) {
    return { kind: "terminal" };
  }
  if (!language || PLAIN_LANGUAGES.has(language)) {
    const label = language === "output" ? "输出" : language === "log" ? "日志" : undefined;
    return { kind: "plain", label };
  }
  if (DATA_LANGUAGES.has(language)) {
    return { kind: "data", label: DATA_LABELS[language] ?? language.toUpperCase() };
  }
  return {
    kind: "code",
    label: LANGUAGE_LABELS[language] ?? language,
  };
}

function isTableSep(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|[\s:|-]+\|?\s*$/.test(line) && /-+/.test(line);
}

function parseTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

function splitBlocks(src: string): MdBlock[] {
  const lines = src.split(/\r?\n/);
  const out: MdBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim().split(/\s+/, 1)[0] || undefined;
      const body: string[] = [];
      i += 1;
      let closed = false;
      while (i < lines.length) {
        if (lines[i].startsWith("```")) {
          closed = true;
          i += 1;
          break;
        }
        body.push(lines[i]);
        i += 1;
      }
      out.push({ type: "code", lang, code: body.join("\n"), open: !closed });
      continue;
    }

    if (/^---+\s*$/.test(line.trim()) || /^\*\*\*+\s*$/.test(line.trim())) {
      out.push({ type: "hr" });
      i += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      out.push({
        type: "h",
        level: Math.min(3, heading[1].length) as 1 | 2 | 3,
        text: heading[2].trim(),
      });
      i += 1;
      continue;
    }

    // GFM table: header | sep | rows
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      isTableSep(lines[i + 1])
    ) {
      const headers = parseTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(parseTableRow(lines[i]));
        i += 1;
      }
      out.push({ type: "table", headers, rows });
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        q.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      out.push({ type: "quote", lines: q });
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      out.push({ type: "ul", items });
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      out.push({ type: "ol", items });
      continue;
    }

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const para: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith("```") &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !(lines[i].includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) &&
      !/^---+\s*$/.test(lines[i].trim())
    ) {
      para.push(lines[i]);
      i += 1;
    }
    out.push({ type: "p", text: para.join("\n") });
  }
  return out.length ? out : [{ type: "p", text: src }];
}

function Block({ block, streaming }: { block: MdBlock; streaming?: boolean }) {
  if (block.type === "h") {
    const cls =
      block.level === 1
        ? "text-[18px] font-semibold tracking-[-0.02em] text-[var(--lab-ink)]"
        : block.level === 2
          ? "text-[16px] font-semibold tracking-[-0.015em] text-[var(--lab-ink)]"
          : "text-[14.5px] font-semibold text-[var(--lab-ink)]";
    const Tag = block.level === 1 ? "h2" : block.level === 2 ? "h3" : "h4";
    return <Tag className={`${cls} mt-1`}>{inline(block.text)}</Tag>;
  }

  if (block.type === "hr") {
    return <hr className="border-0 border-t border-[var(--lab-border-soft)]" />;
  }

  if (block.type === "quote") {
    return (
      <blockquote className="border-l-2 border-[var(--lab-border)] pl-3 text-[12.5px] leading-relaxed text-[var(--lab-ink-2)]">
        {block.lines.map((l, i) => (
          <p key={i} className={i ? "mt-1" : undefined}>
            {inline(l)}
          </p>
        ))}
      </blockquote>
    );
  }

  if (block.type === "table") {
    const cols = Math.max(block.headers.length, ...block.rows.map((r) => r.length), 1);
    const pad = (cells: string[]) => {
      const next = [...cells];
      while (next.length < cols) next.push("");
      return next.slice(0, cols);
    };
    return (
      <div className="overflow-x-auto rounded-[10px] border border-[var(--lab-border-soft)]">
        <table className="w-full min-w-[240px] border-collapse text-left text-[12px]">
          <thead>
            <tr className="border-b border-[var(--lab-border-soft)] bg-[var(--lab-inset)]">
              {pad(block.headers).map((h, i) => (
                <th
                  key={i}
                  className="px-2.5 py-1.5 font-semibold text-[var(--lab-ink)]"
                >
                  {inline(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr
                key={ri}
                className="border-b border-[var(--lab-border-soft)] last:border-0"
              >
                {pad(row).map((c, ci) => (
                  <td key={ci} className="px-2.5 py-1.5 text-[var(--lab-ink-2)]">
                    {inline(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (block.type === "code") {
    const open = Boolean(block.open && streaming);
    const presentation = classifyFence(block.lang, block.code);
    const pre = (
      <pre className="overflow-x-auto whitespace-pre font-[var(--lab-mono)] text-[11.5px] leading-[1.6] text-[var(--lab-ink)]">
        <code>{block.code}</code>
      </pre>
    );

    if (presentation.kind === "tree") {
      return (
        <pre className="lab-md-tree overflow-x-auto whitespace-pre py-0.5 font-[var(--lab-mono)] text-[12px] leading-[1.55] text-[var(--lab-ink-2)]">
          <code>{block.code}</code>
        </pre>
      );
    }

    if (presentation.kind === "plain") {
      return (
        <div className="lab-md-plain">
          {presentation.label ? (
            <div className="mb-1 text-[10px] font-medium tracking-wide text-[var(--lab-ink-3)]">
              {presentation.label}
            </div>
          ) : null}
          {pre}
        </div>
      );
    }

    if (presentation.kind === "terminal") {
      return (
        <div className={`lab-md-terminal overflow-hidden rounded-[8px] ${open ? "opacity-90" : ""}`}>
          <div className="lab-md-terminal-header px-3 py-1 text-[10px] font-medium text-[var(--lab-ink-3)]">
            终端
            {open ? " · 运行中" : ""}
          </div>
          <div className="px-3 py-2.5">{pre}</div>
        </div>
      );
    }

    return (
      <div className={`lab-md-code ${presentation.kind === "data" ? "lab-md-data" : ""} overflow-hidden rounded-[8px] border ${open ? "opacity-90" : ""}`}>
        <div className="lab-md-code-header flex items-center gap-2 px-3 py-1">
          <span className="font-[var(--lab-mono)] text-[9.5px] font-medium tracking-wide text-[var(--lab-ink-3)]">
            {presentation.label}
          </span>
          {open ? <span className="text-[10px] text-[var(--lab-ink-3)]">生成中</span> : null}
        </div>
        <div className="px-3 py-2">{pre}</div>
      </div>
    );
  }

  if (block.type === "ul") {
    return (
      <ul className="list-disc space-y-1 pl-5 marker:text-[var(--lab-ink-3)]">
        {block.items.map((item, i) => (
          <li key={i}>{inline(item)}</li>
        ))}
      </ul>
    );
  }

  if (block.type === "ol") {
    return (
      <ol className="list-decimal space-y-1 pl-5 marker:font-medium marker:text-[var(--lab-ink-3)]">
        {block.items.map((item, i) => (
          <li key={i}>{inline(item)}</li>
        ))}
      </ol>
    );
  }

  return <p className="whitespace-pre-wrap text-[14.5px] leading-[1.65]">{inline(block.text)}</p>;
}

function inline(text: string): ReactNode {
  const parts: ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) {
      parts.push(
        <code
          key={key++}
          className="rounded-[4px] bg-[var(--lab-inset)] px-1 py-0.5 font-[var(--lab-mono)] text-[11.5px] text-[var(--lab-ink)]"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith("**") || tok.startsWith("__")) {
      parts.push(
        <strong key={key++} className="font-semibold text-[var(--lab-ink)]">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else {
      parts.push(
        <em key={key++} className="italic text-[var(--lab-ink-2)]">
          {tok.slice(1, -1)}
        </em>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}
