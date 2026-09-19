"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/* ─────────────────────────────────────────────────────────
 * THINKING — expandable agent trace, four variants
 *
 * Gallery mode uses timed STAGES + demo rows.
 * Production passes `rows` + `controlled` so expand/shimmer
 * follow real tool progress (no invented +/− or fake stages).
 * ───────────────────────────────────────────────────────── */

const STAGES = [800, 600, 1800, 2600, 1600];

function useSequence(steps: number[], enabled: boolean) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    if (stage >= steps.length - 1) return;
    const t = setTimeout(() => setStage((s) => s + 1), steps[stage]);
    return () => clearTimeout(t);
  }, [stage, steps, enabled]);
  return enabled ? stage : steps.length - 1;
}

export type ThinkingRow = {
  primary: string;
  secondary?: string;
  mono?: boolean;
  add?: number;
  del?: number;
  href?: string;
  running?: boolean;
  error?: boolean;
  /** Absolute or workdir-relative path for file preview */
  file?: string;
};

const VARIANTS: Record<
  string,
  { active: string; done: string; rows: ThinkingRow[]; query?: string }
> = {
  Steps: {
    active: "Thinking",
    done: "Thought for 4 seconds",
    rows: [
      { primary: "Reading flavor briefs" },
      { primary: "Scanning supplier lists" },
      { primary: "Comparing tasting notes", secondary: "6 flavors" },
      { primary: "Writing the scoop report" },
    ],
  },
  Reasoning: {
    active: "Thinking",
    done: "Thought for 4 seconds",
    rows: [
      { primary: "Summer demand spikes for stone-fruit flavors — peach and apricot lead." },
      { primary: "I should check cone inventory before promoting a waffle-bowl special." },
    ],
  },
  Search: {
    active: "Searching the web",
    done: "Searched the web",
    query: "best waffle cone supplier",
    rows: [
      { primary: "Joy Cone", secondary: "joycone.com", href: "https://joycone.com/fs_products/waffle-cones/" },
      { primary: "WebstaurantStore", secondary: "webstaurantstore.com", href: "https://www.webstaurantstore.com/ice-cream-shop-supplies.html" },
      { primary: "The Konery", secondary: "thekonery.com", href: "https://thekonery.com/" },
    ],
  },
  Coding: {
    active: "Running tools",
    done: "Ran 3 tools",
    rows: [
      { primary: "Read", secondary: "flavors.ts", mono: true },
      { primary: "Edit", secondary: "ChurnSchedule.tsx", mono: true, add: 74, del: 41 },
      { primary: "Run", secondary: "npm run freeze", mono: true },
    ],
  },
};

function Dot({ tone }: { tone: string }) {
  return (
    <span className={`flex size-3.5 shrink-0 items-center justify-center rounded-full text-white ${tone}`}>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <circle cx="12" cy="12" r="9" />
        <path d="M3.5 12h17M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
      </svg>
    </span>
  );
}

const TONES = ["bg-accent", "bg-orange", "bg-green"];

export default function ThinkingState({
  variant = "Steps",
  onSettled,
  rows,
  active,
  done,
  icon,
  controlled = false,
  working: workingProp,
  footer,
  onFileOpen,
  className,
}: {
  variant?: string;
  onSettled?: () => void;
  rows?: ThinkingRow[];
  active?: string;
  done?: string;
  icon?: ReactNode;
  controlled?: boolean;
  working?: boolean;
  /** Extra content inside the expand panel (e.g. ToolChips) */
  footer?: ReactNode;
  /** Open file / diff preview when a coding row has a file */
  onFileOpen?: (file: string) => void;
  className?: string;
}) {
  const isControlled = controlled && Array.isArray(rows);
  const stage = useSequence(STAGES, !isControlled);
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const base = VARIANTS[variant] ?? VARIANTS.Steps;
  const v = {
    ...base,
    rows: rows ?? base.rows,
    active: active ?? base.active,
    done: done ?? base.done,
  };

  const working = isControlled ? Boolean(workingProp) : stage < 3;
  // Controlled: expand while working; idle/history default collapsed (user can reopen)
  const autoExpanded = isControlled ? working : stage >= 1 && stage < 4;
  const expanded = manualExpanded ?? autoExpanded;

  // When work starts/stops, follow auto expand/collapse (clear manual override)
  useEffect(() => {
    if (!isControlled) return;
    setManualExpanded(null);
  }, [working, isControlled]);
  const visible = isControlled
    ? v.rows.length
    : stage < 2
      ? 0
      : stage === 2
        ? Math.min(2, v.rows.length)
        : v.rows.length;

  const traceRef = useRef<HTMLDivElement>(null);
  const [lineHeight, setLineHeight] = useState(0);
  useLayoutEffect(() => {
    if (traceRef.current) setLineHeight(traceRef.current.offsetHeight);
  }, [visible, expanded, variant, stage, v.rows.length, working]);

  const settledRef = useRef(false);
  useEffect(() => {
    if (working || settledRef.current) return;
    settledRef.current = true;
    onSettled?.();
  }, [working, onSettled]);

  useEffect(() => {
    if (working) settledRef.current = false;
  }, [working]);

  return (
    <div
      key={variant}
      className={`flex w-full max-w-95 flex-col${className ? ` ${className}` : ""}`}
      style={{
        minHeight: working || expanded ? (isControlled ? undefined : 176) : undefined,
        transition: "min-height 400ms cubic-bezier(0.23,1,0.32,1)",
      }}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setManualExpanded((current) => !(current ?? autoExpanded))}
        className="-mx-1.5 flex w-fit items-center gap-2 rounded-control px-1.5 py-1
          transition-colors duration-100 hover:bg-hover-2"
      >
        {icon ? (
          <span className="flex shrink-0 transition-colors duration-200" style={{ color: working ? "var(--ink-2)" : "var(--ink-3)" }}>
            {icon}
          </span>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill={working ? "var(--ink-2)" : "var(--ink-3)"}>
            <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
          </svg>
        )}
        <span role="status" className="contents">
          {working ? (
            <span
              className="bg-clip-text text-[13px] font-medium whitespace-nowrap text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, var(--ink-3) 35%, var(--ink) 50%, var(--ink-3) 65%)",
                backgroundSize: "200% 100%",
                animation: "shimmer-text 1.4s linear infinite",
              }}
            >
              {v.active}
            </span>
          ) : (
            <span
              className="text-[13px] font-medium whitespace-nowrap text-ink-2"
              style={{ animation: "fade-in 350ms ease-out both" }}
            >
              {v.done}
            </span>
          )}
        </span>
        {isControlled && v.rows.length > 8 ? (
          <span className="hidden shrink-0 text-[10.5px] text-ink-3 sm:inline">· 可在内部滚动</span>
        ) : null}
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
          className="transition-transform duration-300"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)" }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <div
        className="grid transition-[grid-template-rows,opacity] duration-400"
        style={{
          gridTemplateRows: expanded ? "1fr" : "0fr",
          opacity: expanded ? 1 : 0,
          transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
        }}
      >
        <div className="overflow-hidden">
          <div className="relative mt-1 ml-[5px] pl-4">
            <span
              aria-hidden
              className="absolute left-[3px] w-px bg-line"
              style={{ top: -8, height: lineHeight ? lineHeight - 2 : 0, transition: "height 500ms cubic-bezier(0.23,1,0.32,1)" }}
            />
            <div
              className="relative max-h-[min(36vh,320px)] overflow-y-auto pr-1"
              style={{ scrollbarGutter: "stable", overscrollBehavior: "contain" }}
            >
            <div ref={traceRef} className="flex flex-col gap-1 py-1">
            {v.query && !isControlled && (
              <div className="flex h-6 items-center gap-2 px-1.5" style={{ animation: expanded ? "fade-up 300ms cubic-bezier(0.23,1,0.32,1) both" : undefined }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round" className="shrink-0">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.3-4.3" />
                </svg>
                <span className="text-[12.5px] text-ink-2">{v.query}</span>
              </div>
            )}
            {v.rows.slice(0, visible).map((row, i) => {
              const rowRunning = isControlled ? Boolean(row.running) : i >= visible - 1 && working;
              const rowError = Boolean(row.error);
              const content = (
                <>
                {variant === "Search" && <Dot tone={TONES[i % 3]} />}
                {(variant === "Steps" || variant === "Coding" || isControlled) && (
                  rowRunning ? (
                    <span className="size-3 shrink-0 rounded-full border-[1.5px] border-line-strong border-t-ink-2" style={{ animation: "spin 700ms linear infinite" }} />
                  ) : rowError ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--red, #e11d48)" strokeWidth="2.5" strokeLinecap="round" className="shrink-0">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  )
                )}
                <span className={`min-w-0 truncate text-[12.5px] ${variant === "Reasoning" ? "whitespace-normal leading-relaxed text-ink-2" : "font-medium text-ink"} ${variant === "Search" ? "animated-underline" : ""}`}>
                  {row.primary}
                </span>
                {row.secondary && (
                  <span className={`min-w-0 truncate text-[11.5px] text-ink-3 ${row.mono ? "font-mono" : ""}`}>
                    {row.secondary}
                  </span>
                )}
                {!rowError && row.add !== undefined && (
                  <span className="shrink-0 font-mono text-[11px] tabular-nums">
                    <span className="text-green">+{row.add}</span>
                    {row.del !== undefined ? (
                      <>
                        {" "}
                        <span className="text-red">−{row.del}</span>
                      </>
                    ) : null}
                  </span>
                )}
                {rowError ? (
                  <span className="shrink-0 text-[11px] text-red">失败</span>
                ) : null}
                </>
              );
              const rowClass = "flex min-h-7 w-full items-center gap-2 rounded-[6px] px-1.5 py-0.5 text-left";
              const animation = { animation: `fade-up 320ms cubic-bezier(0.23,1,0.32,1) ${Math.min(i, 6) * 80}ms both` };
              const key = `${row.primary}-${row.secondary ?? i}`;

              if (variant === "Search") {
                return (
                  <a
                    key={key}
                    href={row.href}
                    target="_blank"
                    rel="noreferrer"
                    className={`${rowClass} transition-colors duration-150 hover:bg-hover`}
                    style={animation}
                  >
                    {content}
                  </a>
                );
              }

              if (variant === "Coding") {
                const selected = selectedTool === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      if (row.file && onFileOpen) {
                        onFileOpen(row.file);
                        return;
                      }
                      setSelectedTool(selected ? null : key);
                    }}
                    className={`${rowClass} transition-colors duration-150 ${selected ? "bg-inset" : "hover:bg-hover"}`}
                    style={animation}
                  >
                    {content}
                  </button>
                );
              }

              return (
                <div key={key} className={rowClass} style={animation}>
                  {content}
                </div>
              );
            })}
            {variant === "Search" && !isControlled && stage >= 3 && (
              <span className="text-[12px] text-ink-3" style={{ animation: "fade-in 300ms ease-out both" }}>
                +7 more
              </span>
            )}
            </div>
            {footer ? <div className="mt-1.5 pb-1">{footer}</div> : null}
            </div>
            {isControlled && v.rows.length > 8 ? (
              <div
                aria-hidden="true"
                className="pointer-events-none sticky bottom-0 -mt-6 flex h-6 items-end justify-center pb-0.5 text-[10px] text-ink-3"
                style={{ background: "linear-gradient(to top, var(--main, var(--lab-main)) 15%, transparent)" }}
              >
                向下滚动查看其余工具
              </div>
            ) : null}
            </div>
          </div>
      </div>
    </div>
  );
}
