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
      const lang = line.slice(3).trim() || undefined;
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
    return (
      <pre
        className={`overflow-x-auto rounded-[10px] border border-[var(--lab-border-soft)] bg-[var(--lab-inset)] px-3 py-2.5 font-[var(--lab-mono)] text-[11.5px] leading-[1.55] text-[var(--lab-ink-2)] ${
          open ? "opacity-90" : ""
        }`}
      >
        {block.lang || open ? (
          <div className="mb-1.5 text-[10px] tracking-wide text-[var(--lab-ink-3)]">
            {block.lang || "code"}
            {open ? " · …" : ""}
          </div>
        ) : null}
        <code>{block.code}</code>
      </pre>
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
