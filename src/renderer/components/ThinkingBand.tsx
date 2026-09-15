import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

type Props = {
  /** Full thinking / reasoning text (may stream). Only mount when non-empty. */
  text: string;
  /** True while turn still in progress */
  working?: boolean;
};

function firstLine(src: string): string {
  const line = src
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);
  return line || src.trim();
}

function latestSnippet(src: string): string {
  const lines = src
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return src.trim();
  return lines[lines.length - 1]!;
}

/**
 * Additive think band (DSH-style): under Lab Agent header, before reply.
 * Does not replace LoadingState / ThinkingAdapter — only shows when `text` exists.
 */
export default function ThinkingBand({ text, working = false }: Props) {
  const body = text.trim();
  const [expanded, setExpanded] = useState(false);
  const endRef = useRef<HTMLSpanElement>(null);

  const summary = useMemo(() => {
    if (!body) return "";
    return working ? latestSnippet(body) : firstLine(body);
  }, [body, working]);

  useLayoutEffect(() => {
    if (expanded || !working) return;
    endRef.current?.scrollIntoView({ inline: "end", block: "nearest", behavior: "smooth" });
  }, [summary, expanded, working]);

  useEffect(() => {
    if (working) setExpanded(false);
  }, [working]);

  if (!body) return null;

  return (
    <div
      className="overflow-hidden rounded-[10px] border border-[var(--lab-border-soft)]/70"
      style={{
        background: "color-mix(in srgb, var(--lab-ink) 4.5%, transparent)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--lab-hover)]/40"
      >
        <span
          className="size-1.5 shrink-0 rounded-full bg-[var(--lab-ink-3)]"
          style={working ? { animation: "lab-pulse 1.4s ease-in-out infinite" } : { opacity: 0.45 }}
        />
        <span className="shrink-0 text-[11px] font-medium tracking-[0.04em] text-[var(--lab-ink-3)]">
          {working ? "思考中" : "思考"}
        </span>
        {!expanded ? (
          <div
            className="relative min-w-0 flex-1 overflow-x-auto"
            style={{
              maskImage: "linear-gradient(90deg, transparent, #000 12px, #000 calc(100% - 14px), transparent)",
              WebkitMaskImage:
                "linear-gradient(90deg, transparent, #000 12px, #000 calc(100% - 14px), transparent)",
              scrollbarWidth: "none",
            }}
          >
            <div className="inline-flex max-w-none whitespace-nowrap pr-3 text-[12px] leading-[1.45] text-[var(--lab-ink-3)]">
              <span
                className={working ? "opacity-90" : "opacity-75"}
                style={
                  working
                    ? {
                        backgroundImage:
                          "linear-gradient(90deg, var(--lab-ink-3) 30%, var(--lab-ink-2) 50%, var(--lab-ink-3) 70%)",
                        backgroundSize: "200% 100%",
                        WebkitBackgroundClip: "text",
                        backgroundClip: "text",
                        color: "transparent",
                        animation: "shimmer-text 2s linear infinite",
                      }
                    : undefined
                }
              >
                {summary}
              </span>
              <span ref={endRef} aria-hidden className="inline-block w-px" />
            </div>
          </div>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--lab-ink-3)]">完整过程</span>
        )}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          className="shrink-0 text-[var(--lab-ink-3)] transition-transform duration-250"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)" }}
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <div
        className="grid transition-[grid-template-rows,opacity] duration-300"
        style={{
          gridTemplateRows: expanded ? "1fr" : "0fr",
          opacity: expanded ? 1 : 0,
          transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
        }}
      >
        <div className="overflow-hidden">
          <div className="border-t border-[var(--lab-border-soft)]/60 px-2.5 py-2 text-[12px] leading-[1.55] whitespace-pre-wrap text-[var(--lab-ink-3)]">
            {body}
          </div>
        </div>
      </div>
    </div>
  );
}
