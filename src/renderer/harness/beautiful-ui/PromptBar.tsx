"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ENGINE_BRANDS } from "../../components/EngineBrandMarks";
import { modelMatchesQuery } from "@shared/modelCatalog";
import {
  PERMISSION_MODES,
  permissionModeMeta,
  type PermissionModeId,
} from "../../lib/permissionModes";

/* The built-in "prism" palette is only cyan→indigo→magenta, so a sweep
 * reads as blue/purple. Build a true full-spectrum rainbow instead. */
const RAINBOW = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#a855f7"];

/* ─────────────────────────────────────────────────────────
 * PROMPT BAR
 * A composer with real controls: attach, @ data sources,
 * / commands, a model picker, dictation, and send.
 * Type @ or / to open the menus; ↑↓ + Enter to pick.
 * Variants: Rounded (card radius) · Pill (full radius).
 * ───────────────────────────────────────────────────────── */

function Icon({ children, size = 15, strokeWidth = 1.8 }: { children: React.ReactNode; size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const GLYPHS: Record<string, React.ReactNode> = {
  clip: <path d="m21.4 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  layers: <g><path d="M12 2 2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5M2 12l10 5 10-5" /></g>,
  globe: <g><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></g>,
};

/* real product marks, inline so the file stays self-contained */
const BRANDS: Record<string, React.ReactNode> = {
  figma: (
    <svg width="11" height="16" viewBox="0 0 38 57" aria-hidden="true">
      <path d="M9.5 57A9.5 9.5 0 0 0 19 47.5V38H9.5a9.5 9.5 0 0 0 0 19z" fill="#0ACF83" />
      <path d="M0 28.5A9.5 9.5 0 0 1 9.5 19H19v19H9.5A9.5 9.5 0 0 1 0 28.5z" fill="#A259FF" />
      <path d="M0 9.5A9.5 9.5 0 0 1 9.5 0H19v19H9.5A9.5 9.5 0 0 1 0 9.5z" fill="#F24E1E" />
      <path d="M19 0h9.5a9.5 9.5 0 1 1 0 19H19V0z" fill="#FF7262" />
      <path d="M38 28.5a9.5 9.5 0 1 1-19 0 9.5 9.5 0 0 1 19 0z" fill="#1ABCFE" />
    </svg>
  ),
  slack: (
    <svg width="15" height="15" viewBox="0 0 127 127" aria-hidden="true">
      <path d="M27.2 80c0 7.3-5.9 13.2-13.2 13.2C6.7 93.2.8 87.3.8 80c0-7.3 5.9-13.2 13.2-13.2h13.2V80zm6.6 0c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2v33c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V80z" fill="#E01E5A" />
      <path d="M47 27.2c-7.3 0-13.2-5.9-13.2-13.2C33.8 6.7 39.7.8 47 .8c7.3 0 13.2 5.9 13.2 13.2v13.2H47zm0 6.7c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H13.9C6.6 60.3.7 54.4.7 47.1c0-7.3 5.9-13.2 13.2-13.2H47z" fill="#36C5F0" />
      <path d="M99.9 47.1c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H99.9V47.1zm-6.6 0c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V13.9C66.9 6.6 72.8.7 80.1.7c7.3 0 13.2 5.9 13.2 13.2v33.2z" fill="#2EB67D" />
      <path d="M80.1 99.8c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V99.8h13.2zm0-6.6c-7.3 0-13.2-5.9-13.2-13.2 0-7.3 5.9-13.2 13.2-13.2h33.1c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H80.1z" fill="#ECB22E" />
    </svg>
  ),
  gmail: (
    <svg width="15" height="12" viewBox="0 0 256 193" aria-hidden="true">
      <path d="M58.182 192.05V93.14L27.507 65.077 0 49.504v125.091c0 9.658 7.825 17.455 17.455 17.455h40.727Z" fill="#4285F4" />
      <path d="M197.818 192.05h40.727c9.659 0 17.455-7.826 17.455-17.455V49.505l-31.156 17.837-27.026 25.798v98.91Z" fill="#34A853" />
      <path d="m58.182 93.14-4.174-38.647 4.174-36.989L128 69.868l69.818-52.364 4.669 34.992-4.669 40.644L128 145.504 58.182 93.14Z" fill="#EA4335" />
      <path d="M197.818 17.504V93.14L256 49.504V26.231c0-21.585-24.64-33.89-41.89-20.945l-16.292 12.218Z" fill="#FBBC04" />
      <path d="m0 49.504 26.759 20.07L58.182 93.14V17.504L41.89 5.286C24.61-7.66 0 4.646 0 26.23v23.273Z" fill="#C5221F" />
    </svg>
  ),
  ...ENGINE_BRANDS,
};

type Source = {
  key: string;
  name: string;
  desc: string;
  glyph?: string;
  brand?: string;
  attach?: boolean;
  connect?: boolean;
};

const DEFAULT_SOURCES: Source[] = [
  { key: "attach", name: "Add photos & files", desc: "Upload from your computer", glyph: "clip", attach: true },
  { key: "scoop", name: "Scoop Data", desc: "Sales & churn metrics", glyph: "chart" },
  { key: "flavors", name: "Flavor records", desc: "26 makers, tags, links", glyph: "layers" },
  { key: "web", name: "Web search", desc: "Real-time news and info", glyph: "globe" },
  { key: "figma", name: "Figma", desc: "Design-to-code workflows", brand: "figma" },
  { key: "slack", name: "Slack", desc: "Read and manage Slack", brand: "slack" },
  { key: "gmail", name: "Gmail", desc: "Read and manage Gmail", brand: "gmail", connect: true },
];

const DEFAULT_COMMANDS = [
  { key: "compare", name: "/compare", desc: "Flavor vs. last summer" },
  { key: "churn-plan", name: "/churn-plan", desc: "Draft a churn schedule" },
  { key: "restock", name: "/restock", desc: "Build a reorder list" },
  { key: "draft-email", name: "/draft-email", desc: "Write a supplier email" },
  { key: "summarize", name: "/summarize", desc: "Digest the thread so far" },
];

export type PromptModel = {
  key: string;
  name: string;
  tag: string;
  subtitle?: string;
  brand?: string;
  disabled?: boolean;
};

export type SourceActionResult = {
  handled: boolean;
  attachments?: string[];
  insert?: string;
};

const DEFAULT_MODELS: PromptModel[] = [
  { key: "sprinkles-5", name: "Sprinkles 5", tag: "Flagship" },
  { key: "vanilla-1", name: "Vanilla 1", tag: "Basic" },
  { key: "freezer-burn", name: "Freezer Burn 0.4", tag: "Stale" },
];

const DEFAULT_FILES = ["flavor-chart.png", "summer-menu.pdf", "pos-export.csv"];
const DICTATION = "Compare pistachio weekends to last summer";

/* self-running demo: walk the @ menu, then the / menu, and repeat.
 * Any pointer or key interaction hands control to the user. */
const AUTO_STEPS: {
  draft: string;
  active?: number;
  connect?: boolean;
  modelOpen?: boolean;
  model?: string;
  hold: number;
}[] = [
  { draft: "", connect: false, model: "vanilla-1", hold: 1100 },
  { draft: "@", active: 0, hold: 900 },
  { draft: "@", active: 1, hold: 620 },
  { draft: "@", active: 4, hold: 620 },
  { draft: "@", active: 6, hold: 700 },
  { draft: "@", active: 6, connect: true, hold: 1000 },
  { draft: "", hold: 700 },
  { draft: "/", active: 0, hold: 900 },
  { draft: "/", active: 1, hold: 620 },
  { draft: "/", active: 3, hold: 1000 },
  { draft: "", hold: 800 },
  // open the model picker and upgrade to the flagship → rainbow sweep
  { draft: "", modelOpen: true, hold: 1200 },
  { draft: "", model: "sprinkles-5", hold: 2400 },
  { draft: "", hold: 900 },
];

/* content adaptation only — same UI, swap data when embedding */

/* the last @word or /word being typed, if any */
function parseToken(draft: string): { kind: "at" | "slash"; query: string; start: number } | null {
  const match = /(^|\s)([@/])([\w-]*)$/.exec(draft);
  if (!match) return null;
  return {
    kind: match[2] === "@" ? "at" : "slash",
    query: match[3].toLowerCase(),
    start: match.index + match[1].length,
  };
}

export default function PromptBar({
  variant = "Rounded",
  demo = true,
  tall = false,
  placeholder,
  onSend,
  models = DEFAULT_MODELS,
  modelSource,
  modelListHint,
  sources = DEFAULT_SOURCES,
  commands = DEFAULT_COMMANDS,
  files = DEFAULT_FILES,
  initialModelKey,
  onModelChange,
  onSourceAction,
  dictationEnabled = true,
  busy = false,
  onStop,
  permissionMode = "default",
  onPermissionModeChange,
  seedDraft = null,
  seedNonce = 0,
}: {
  variant?: string;
  /** the self-running walkthrough; turn off when embedding in a real surface */
  demo?: boolean;
  /** hero sizing: a multi-line input with controls on their own row */
  tall?: boolean;
  placeholder?: string;
  onSend?: (text: string, attachments?: string[]) => void;
  models?: PromptModel[];
  /** Current API profile label; this is context, not a channel switcher. */
  modelSource?: string;
  /** Clarifies what the API model-list verification does and does not prove. */
  modelListHint?: string;
  sources?: Source[];
  commands?: { key: string; name: string; desc: string }[];
  files?: string[];
  initialModelKey?: string;
  onModelChange?: (model: PromptModel) => void;
  /** return handled:true to skip built-in @-insert / fake attach */
  onSourceAction?: (key: string) => void | SourceActionResult | Promise<void | SourceActionResult>;
  /** when false, keep mic visible but slash / disabled */
  dictationEnabled?: boolean;
  /** Agent is running — allow typing; block send; show Stop */
  busy?: boolean;
  onStop?: () => void;
  permissionMode?: PermissionModeId;
  onPermissionModeChange?: (mode: PermissionModeId) => void;
  /** Inject text (e.g. edit & resend after Stop) */
  seedDraft?: string | null;
  seedNonce?: number;
}) {
  const MODELS = models;
  const SOURCES = sources;
  const COMMANDS = commands;
  const FILES = files;
  const pill = variant === "Pill";
  const [draft, setDraft] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [plusQuery, setPlusQuery] = useState("");
  const [modelOpen, setModelOpen] = useState(false);
  const [modelQuery, setModelQuery] = useState("");
  const [permOpen, setPermOpen] = useState(false);
  const [model, setModel] = useState(() => MODELS.find((m) => m.key === initialModelKey) ?? MODELS[0] ?? DEFAULT_MODELS[1]);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [active, setActive] = useState(0);
  const [listening, setListening] = useState(false);
  const [auto, setAuto] = useState(demo);
  const [autoStep, setAutoStep] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [layoutTick, setLayoutTick] = useState(0);
  const wide = expanded || tall;
  const [rowBox, setRowBox] = useState<{ top: number; height: number } | null>(null);
  const [engaged, setEngaged] = useState(false);
  const [modelBox, setModelBox] = useState<{ top: number; height: number } | null>(null);
  const [modelHovered, setModelHovered] = useState<number | null>(null);
  const [modelMenuLeft, setModelMenuLeft] = useState(0);
  const [modelMenuBottom, setModelMenuBottom] = useState(0);
  const [permMenuLeft, setPermMenuLeft] = useState(0);
  const [permMenuBottom, setPermMenuBottom] = useState(0);
  const visibleModels = useMemo(
    () => MODELS.filter((item) => modelMatchesQuery(item, modelQuery)),
    [MODELS, modelQuery],
  );
  const composerAnchorRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const modelRef = useRef<HTMLButtonElement>(null);
  const permRef = useRef<HTMLButtonElement>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const modelRowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const permMeta = permissionModeMeta(permissionMode);

  useEffect(() => {
    const next = MODELS.find((m) => m.key === initialModelKey);
    if (next && next.key !== model.key) setModel(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialModelKey, MODELS]);

  /* hand control to the user: stop the demo loop, and when they aim at
   * the input itself, clear the demo's leftover draft for a clean start */
  const takeOver = (event: { target: EventTarget | null }) => {
    setAuto(false);
    if (auto && event.target === inputRef.current) setDraft("");
  };

  const token = dismissed ? null : parseToken(draft);
  const menu: "at" | "slash" | null = plusOpen ? "at" : token?.kind ?? null;
  const query = plusOpen ? plusQuery.trim().toLowerCase() : token?.query ?? "";

  const sourceRows = SOURCES.filter(
    (s) => !query || s.name.toLowerCase().includes(query) || s.desc.toLowerCase().includes(query),
  );
  const fileRows =
    menu === "at"
      ? FILES.filter((f) => !query || f.toLowerCase().includes(query)).slice(0, 8).map((f) => ({
          key: `file:${f}`,
          name: f,
          desc: "引用工作区文件",
          file: true as const,
        }))
      : [];

  const rows: { key: string; name: string; desc: string; file?: boolean }[] =
    menu === "at"
      ? [...sourceRows, ...fileRows]
      : menu === "slash"
        ? COMMANDS.filter((c) => c.name.slice(1).startsWith(query))
        : [];

  useEffect(() => {
    setActive(0);
    setEngaged(false);
  }, [menu, query]);

  /* a single highlight glides to the active row instead of each row
   * toggling its own background — matches the gliding pill in the nav */
  useLayoutEffect(() => {
    const target = rowRefs.current[active];
    if (target) setRowBox({ top: target.offsetTop, height: target.offsetHeight });
  }, [menu, query, active, connected, rows.length]);

  /* same gliding highlight in the model menu — floats to the hovered
   * row, falling back to the currently-selected model */
  const modelIndex = visibleModels.findIndex((m) => m.key === model.key);
  useLayoutEffect(() => {
    if (!modelOpen) return;
    const target = modelRowRefs.current[modelHovered ?? modelIndex];
    if (target) setModelBox({ top: target.offsetTop, height: target.offsetHeight });
  }, [modelOpen, modelHovered, modelIndex, visibleModels.length]);

  /* The menu is outside the clipped composer, so align it to the model
   * trigger by measurement instead of pinning it to the far-right edge. */
  useLayoutEffect(() => {
    if (!modelOpen || !composerAnchorRef.current || !modelRef.current) return;
    const anchorRect = composerAnchorRef.current.getBoundingClientRect();
    const triggerRect = modelRef.current.getBoundingClientRect();
    setModelMenuLeft(
      Math.max(0, Math.min(triggerRect.left - anchorRect.left, anchorRect.width - Math.min(448, anchorRect.width))),
    );
    setModelMenuBottom(anchorRect.bottom - triggerRect.top + 8);
  }, [modelOpen, wide, model.name]);

  useLayoutEffect(() => {
    if (!permOpen || !composerAnchorRef.current || !permRef.current) return;
    const anchorRect = composerAnchorRef.current.getBoundingClientRect();
    const triggerRect = permRef.current.getBoundingClientRect();
    setPermMenuLeft(Math.max(0, Math.min(triggerRect.left - anchorRect.left, anchorRect.width - 200)));
    setPermMenuBottom(anchorRect.bottom - triggerRect.top + 8);
  }, [permOpen, wide, permissionMode]);

  useEffect(() => {
    if (!modelOpen) {
      setModelHovered(null);
      setModelQuery("");
    }
  }, [modelOpen]);

  useEffect(() => {
    setModelHovered(null);
  }, [modelQuery]);

  /* model change triggers a simple CSS rainbow flash instead of WebGL */
  const celebrate = () => {
    const el = composerAnchorRef.current;
    if (!el) return;
    el.style.setProperty("--rainbow-flash", "1");
    setTimeout(() => el.style.removeProperty("--rainbow-flash"), 600);
  };

  const selectModel = (next: PromptModel) => {
    if (next.disabled) return;
    setModel(next);
    setModelOpen(false);
    if (next.key === "sprinkles-5" || next.key === "lab-deepseek") celebrate();
    onModelChange?.(next);
  };

  /* autoplay: apply the current step, then advance after its hold */
  useEffect(() => {
    if (!auto) return;
    const step = AUTO_STEPS[autoStep % AUTO_STEPS.length];
    setDraft(step.draft);
    if (step.active !== undefined) setActive(step.active);
    if (step.connect !== undefined) setConnected(step.connect);
    if (step.modelOpen !== undefined) setModelOpen(step.modelOpen);
    if (step.model) {
      const next = MODELS.find((m) => m.key === step.model);
      if (next) selectModel(next);
    }
    const t = setTimeout(() => setAutoStep((s) => s + 1), step.hold);
    return () => clearTimeout(t);
  }, [auto, autoStep]);

  /* dictation resolves after a beat, like a real transcript landing */
  useEffect(() => {
    if (!listening) return;
    const t = setTimeout(() => {
      setDraft((current) => (current ? `${current.trimEnd()} ${DICTATION}` : DICTATION));
      setListening(false);
      inputRef.current?.focus();
    }, 2200);
    return () => clearTimeout(t);
  }, [listening]);

  useEffect(() => {
    if (!seedNonce || seedDraft == null) return;
    setDraft(seedDraft);
    setExpanded(false);
    setDismissed(false);
    const t = window.setTimeout(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const len = seedDraft.length;
      el.setSelectionRange(len, len);
    }, 30);
    return () => window.clearTimeout(t);
  }, [seedNonce, seedDraft]);

  /* Grow textarea; only leave single-row when content needs wrap / newlines.
   * Empty draft always collapses — avoids “mysterious” double-row height. */
  useLayoutEffect(() => {
    const input = inputRef.current;
    const controls = controlsRef.current;
    const measure = measureRef.current;
    const modelButton = modelRef.current;
    if (!input || !controls || !measure || !modelButton) return;

    const minHeight = 28;
    const maxHeight = 100;
    const empty = !draft.trim() && !draft.includes("\n");

    if (empty) {
      if (expanded) setExpanded(false);
      input.style.height = `${minHeight}px`;
      input.style.overflowY = "hidden";
      return;
    }

    const width = controls.clientWidth;
    // Layout not ready — skip; ResizeObserver / next draft tick will re-run
    if (width < 160) return;

    const fixedControlsWidth = 28 * 3 + modelButton.offsetWidth;
    const inlineGaps = 4 * 4;
    const inlineInputWidth = width - fixedControlsWidth - inlineGaps;
    const needsFullWidth =
      draft.includes("\n") || (inlineInputWidth > 48 && measure.offsetWidth + 8 > inlineInputWidth);
    if (needsFullWidth !== expanded) {
      setExpanded(needsFullWidth);
    }

    input.style.height = "0px";
    const contentHeight = input.scrollHeight;
    input.style.height = `${Math.min(Math.max(contentHeight, minHeight), maxHeight)}px`;
    input.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
  }, [draft, expanded, layoutTick]);

  useEffect(() => {
    const el = controlsRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setLayoutTick((n) => n + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* clicking anywhere outside the composer closes the open menus */
  useEffect(() => {
    if (!modelOpen && !plusOpen && !permOpen) return;
    const close = (event: PointerEvent) => {
      if (!(event.target as Element).closest("[data-promptbar]")) {
        setModelOpen(false);
        setPlusOpen(false);
        setPermOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [modelOpen, plusOpen, permOpen]);

  const closeMenus = () => {
    setPlusOpen(false);
    setPlusQuery("");
    setModelOpen(false);
    setPermOpen(false);
  };

  const pick = async (row: { key: string; name: string; file?: boolean }) => {
    if (onSourceAction && (row.file || SOURCES.some((s) => s.key === row.key))) {
      const result = await onSourceAction(row.key);
      if (result && result.handled) {
        if (result.attachments?.length) {
          setAttachments((current) => [...current, ...result.attachments!]);
        }
        if (result.insert) {
          setDraft(`${token ? draft.slice(0, token.start) : draft}${result.insert}`);
        }
        setPlusOpen(false);
        setPlusQuery("");
        setDismissed(false);
        inputRef.current?.focus();
        return;
      }
    }

    if (row.file) {
      setAttachments((current) => [...current, row.name]);
      setDraft(`${token ? draft.slice(0, token.start) : draft}@${row.name} `);
      setPlusOpen(false);
      setPlusQuery("");
      setDismissed(false);
      inputRef.current?.focus();
      return;
    }

    const source = SOURCES.find((s) => s.key === row.key);
    if (source?.attach) {
      setAttachments((current) => [...current, FILES[current.length % FILES.length]]);
      if (token) setDraft(draft.slice(0, token.start));
    } else if (menu === "at") {
      setDraft(`${token ? draft.slice(0, token.start) : draft}@${row.name} `);
    } else {
      setDraft(`${token ? draft.slice(0, token.start) : draft}${row.name} `);
    }
    setPlusOpen(false);
    setPlusQuery("");
    setDismissed(false);
    inputRef.current?.focus();
  };

  const canSend = !busy && (draft.trim().length > 0 || attachments.length > 0);
  const canAct = busy ? Boolean(onStop) : canSend;
  const send = () => {
    if (busy) {
      onStop?.();
      return;
    }
    if (!canSend) return;
    onSend?.(draft.trim(), attachments);
    setDraft("");
    setAttachments([]);
    closeMenus();
  };

  return (
    <div
      data-promptbar
      className={demo ? "flex min-h-[384px] w-full max-w-105 flex-col justify-end pb-8" : "w-full"}
      onPointerDownCapture={takeOver}
      onKeyDownCapture={takeOver}
    >
      {/* composer is the anchor — menus grow up from its top edge */}
      <div ref={composerAnchorRef} className="relative">
      {/* ── @ / slash menu ─────────────────────────────── */}
      {menu && (
        <div
          onMouseLeave={() => setEngaged(false)}
          className="absolute inset-x-0 bottom-full z-10 mb-2 rounded-[10px] bg-surface p-1 shadow-raised"
          style={{ animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both", transformOrigin: "bottom center" }}
        >
          {/* single gliding highlight — appears once a row is hovered */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-1 rounded-[6px] bg-hover"
            style={{
              top: rowBox?.top ?? 0,
              height: rowBox?.height ?? 0,
              opacity: rowBox && engaged && rows.length > 0 ? 1 : 0,
              transition:
                "top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease",
            }}
          />
          {rows.map((row, i) => {
            const source = menu === "at" && !row.file ? SOURCES.find((s) => s.key === row.key) : undefined;
            return (
              <button
                key={row.key}
                type="button"
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => {
                  setActive(i);
                  setEngaged(true);
                }}
                onClick={() => void pick(row)}
                className="relative z-10 flex h-9 w-full items-center gap-2.5 rounded-[6px] px-2 text-left"
              >
                {(source || row.file) && (
                  <span className="flex size-5.5 shrink-0 items-center justify-center text-ink-2">
                    {source?.brand ? BRANDS[source.brand] : <Icon size={15}>{GLYPHS[source?.glyph ?? "clip"]}</Icon>}
                  </span>
                )}
                <span className="shrink-0 text-[12.5px] font-medium text-ink">
                  {row.name}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3">{row.desc}</span>
                {source?.connect && (
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(event) => {
                      event.stopPropagation();
                      setConnected((current) => !current);
                    }}
                    className={`shrink-0 text-[12px] font-medium transition-colors duration-100 ${
                      connected ? "text-green" : "text-accent-ink hover:underline"
                    }`}
                  >
                    {connected ? "Connected" : "Connect"}
                  </span>
                )}
              </button>
            );
          })}
          {rows.length === 0 && (
            <div className="flex h-9 items-center px-2 text-[12px] text-ink-3">
              No matches for “{query}”
            </div>
          )}
          <div className="mt-1 border-t border-line px-2 pt-1.5 pb-1">
            {plusOpen ? (
              <input
                value={plusQuery}
                onChange={(e) => setPlusQuery(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                placeholder="Type to search sources & files"
                className="w-full bg-transparent text-[11px] text-ink outline-none placeholder:text-ink-3"
              />
            ) : (
              <div className="text-[11px] text-ink-3">
                {menu === "at" ? "Type to search sources & files" : "Type to search commands"}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── model menu ─────────────────────────────────── */}
      {modelOpen && (
        <div
          onMouseLeave={() => setModelHovered(null)}
          className="absolute z-10 flex min-w-[18rem] max-w-[min(28rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[10px] bg-surface shadow-raised"
          style={{ left: modelMenuLeft, bottom: modelMenuBottom, maxHeight: "min(72vh, 34rem)", animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both", transformOrigin: "bottom left" }}
        >
          <div className="shrink-0 border-b border-line p-2">
            <div className="truncate text-[10.5px] font-medium text-ink-2" title={modelSource}>
              {modelSource || "选择当前对话使用的模型"}
            </div>
            <input
              value={modelQuery}
              onChange={(event) => setModelQuery(event.target.value)}
              onMouseDown={(event) => event.stopPropagation()}
              placeholder="搜索模型名称或 ID"
              aria-label="搜索模型名称或 ID"
              className="mt-1.5 w-full rounded-[6px] border border-line bg-transparent px-2 py-1.5 text-[11.5px] text-ink outline-none placeholder:text-ink-3 focus:border-accent-ink/50"
            />
            {modelListHint ? (
              <div className="mt-1.5 text-[10px] leading-relaxed text-ink-3">{modelListHint}</div>
            ) : null}
          </div>
          <div className="relative min-h-0 overflow-y-auto p-1">
            {/* single gliding highlight — floats to the hovered / selected row */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-1 rounded-[6px] bg-hover"
              style={{
                top: modelBox?.top ?? 0,
                height: modelBox?.height ?? 0,
                opacity: modelBox && modelHovered !== null ? 1 : 0,
                transition:
                  "top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease",
              }}
            />
            {visibleModels.map((m, i) => (
              <button
                key={m.key}
                type="button"
                ref={(el) => {
                  modelRowRefs.current[i] = el;
                }}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setModelHovered(i)}
                onClick={() => {
                  selectModel(m);
                  inputRef.current?.focus();
                }}
                disabled={m.disabled}
                title={m.subtitle ? `${m.name}\n${m.subtitle}` : m.name}
                className="relative z-10 flex min-h-10 w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left disabled:pointer-events-none disabled:opacity-45"
              >
                {m.brand && BRANDS[m.brand] ? (
                  <span className="flex size-3.5 shrink-0 items-center justify-center overflow-hidden">{BRANDS[m.brand]}</span>
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-ink">{m.name}</span>
                  {m.subtitle ? (
                    <span className="block truncate font-mono text-[9px] text-ink-3">{m.subtitle}</span>
                  ) : null}
                </span>
                <span className="max-w-28 shrink-0 truncate text-[10px] text-ink-3">{m.tag}</span>
                <span className={`shrink-0 text-ink ${m.key === model.key ? "" : "invisible"}`}>
                  <Icon size={13} strokeWidth={2.5}><path d="M20 6L9 17l-5-5" /></Icon>
                </span>
              </button>
            ))}
            {visibleModels.length === 0 ? (
              <div className="px-2 py-3 text-[11px] text-ink-3">没有匹配的模型或 ID</div>
            ) : null}
          </div>
        </div>
      )}

      {/* ── permission mode menu ───────────────────────── */}
      {permOpen && (
        <div
          className="absolute z-10 min-w-[14rem] max-w-[min(22rem,calc(100vw-2rem))] rounded-[10px] bg-surface p-1 shadow-raised"
          style={{ left: permMenuLeft, bottom: permMenuBottom, animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both", transformOrigin: "bottom left" }}
        >
          <div className="px-2 py-1.5 text-[10px] font-semibold tracking-[0.08em] text-ink-3">权限</div>
          {PERMISSION_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onPermissionModeChange?.(m.id);
                setPermOpen(false);
                inputRef.current?.focus();
              }}
              className="relative z-10 flex w-full flex-col gap-0.5 rounded-[6px] px-2 py-1.5 text-left hover:bg-hover"
            >
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 text-[12.5px] font-medium text-ink">{m.name}</span>
                <span className={`shrink-0 text-ink ${m.id === permissionMode ? "" : "invisible"}`}>
                  <Icon size={13} strokeWidth={2.5}><path d="M20 6L9 17l-5-5" /></Icon>
                </span>
              </span>
              <span className="text-[11px] leading-snug text-ink-3">{m.desc}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── composer ───────────────────────────────────── */}
      <div
        data-lab-glass
        className={`relative isolate flex flex-col overflow-hidden border border-line bg-surface shadow-card transition-[border-color,border-radius] duration-150 focus-within:border-line-strong ${
          tall ? "gap-2.5 p-3.5" : "gap-1.5 p-1.5"
        } ${
          pill ? (attachments.length > 0 || wide ? "rounded-[24px]" : "rounded-full") : tall ? "rounded-[22px]" : "rounded-[14px]"
        }`}
      >
        {/* CSS rainbow flash — plays across the interior on model change */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-0 transition-opacity duration-300"
          style={{
            borderRadius: "inherit",
            background: "linear-gradient(90deg, #ef4444, #f97316, #eab308, #22c55e, #06b6d4, #3b82f6, #a855f7)",
            opacity: "var(--rainbow-flash, 0)",
          }}
        />
        <span
          ref={measureRef}
          aria-hidden="true"
          className="pointer-events-none absolute invisible whitespace-pre text-[13px] leading-[18px]"
        >
          {draft}
        </span>

        {attachments.length > 0 && (
          <div className={`flex flex-wrap gap-1.5 pt-0.5 ${pill ? "px-1" : "px-0.5"}`}>
            {attachments.map((file, i) => (
              <span
                key={`${file}-${i}`}
                className={`flex h-6.5 items-center gap-1.5 bg-field py-1 pr-1 pl-1.5 text-[11.5px] text-ink-2 shadow-hairline ${
                  pill ? "rounded-full" : "rounded-chip"
                }`}
                style={{ animation: "pop-in 200ms cubic-bezier(0.23,1,0.32,1) both" }}
              >
                <Icon size={12}><g><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></g></Icon>
                <span className="max-w-36 truncate" title={file}>{file.split(/[/\\]/).pop() || file}</span>
                <button
                  type="button"
                  aria-label={`Remove ${file}`}
                  onClick={() => setAttachments((current) => current.filter((_, j) => j !== i))}
                  className={`-my-1 flex size-6 items-center justify-center text-ink-3 transition-colors duration-100 hover:bg-line/70 hover:text-ink ${
                    pill ? "rounded-full" : "rounded-[5px]"
                  }`}
                >
                  <Icon size={10} strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12" /></Icon>
                </button>
              </span>
            ))}
          </div>
        )}

        <div
          ref={controlsRef}
          className={`grid items-end gap-x-1 gap-y-1.5 ${
            wide
              ? "grid-cols-[28px_auto_auto_minmax(0,1fr)_28px_28px]"
              : "grid-cols-[28px_minmax(0,1fr)_auto_auto_28px_28px]"
          }`}
        >
          <button
            type="button"
            aria-label="Add attachments and sources"
            aria-expanded={plusOpen}
            disabled={busy}
            onClick={() => {
              if (busy) return;
              setModelOpen(false);
              setPlusOpen((current) => {
                const next = !current;
                if (next) setPlusQuery("");
                return next;
              });
              inputRef.current?.focus();
            }}
            className={`flex size-7 shrink-0 items-center justify-center justify-self-start text-ink-3 transition-[background-color,color,transform] duration-150 hover:bg-hover hover:text-ink active:scale-[0.94] disabled:pointer-events-none disabled:opacity-40 ${
              pill ? "rounded-full" : "rounded-[8px]"
            } ${plusOpen ? "bg-hover text-ink" : ""} ${wide ? "col-start-1 row-start-2" : "col-start-1 row-start-1"}`}
          >
            <Icon size={16} strokeWidth={2}><path d="M12 5v14M5 12h14" /></Icon>
          </button>

          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setDismissed(false);
              setPlusOpen(false);
            }}
            onKeyDown={(event) => {
              if (busy) {
                if (event.key === "Escape" && onStop) {
                  event.preventDefault();
                  onStop();
                }
                // Allow typing while agent runs; block send (Enter)
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                }
                return;
              }
              if (menu && rows.length > 0) {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  setEngaged(true);
                  setActive((current) => (current + (event.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length);
                  return;
                }
                if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
                  event.preventDefault();
                  void pick(rows[active]);
                  return;
                }
              }
              if (event.key === "Escape") {
                setDismissed(true);
                closeMenus();
                return;
              }
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send();
              }
            }}
            placeholder={
              busy
                ? "可先打字，Agent 结束后再发送 · Esc / Stop 停止"
                : listening
                  ? "Listening…"
                  : placeholder ?? "Write a message…"
            }
            aria-label="Prompt"
            className={`${tall ? "min-h-[68px] px-2 py-2 text-[14px] leading-5" : "min-h-7 px-1 py-[5px] text-[13px] leading-[18px]"} min-w-0 w-full resize-none bg-transparent text-ink outline-none [overflow-wrap:anywhere] placeholder:text-ink-3 ${
              wide ? "col-span-full col-start-1 row-start-1" : "col-start-2 row-start-1"
            }`}
          />

          {/* model picker */}
          <button
            ref={modelRef}
            type="button"
            aria-expanded={modelOpen}
            aria-label="Choose model"
            title={model.name}
            disabled={busy}
            onClick={() => {
              if (busy) return;
              setPlusOpen(false);
              setPermOpen(false);
              setModelOpen((current) => !current);
            }}
            className={`flex h-7 max-w-[min(100%,20rem)] shrink-0 items-center gap-1 px-1.5 text-[12px] font-medium text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-50 ${
              pill ? "rounded-full" : "rounded-[8px]"
            } ${wide ? "col-start-2 row-start-2 justify-self-start" : "col-start-3 row-start-1"}`}
          >
            {model.brand && BRANDS[model.brand] ? (
              <span className="flex size-3.5 shrink-0 items-center justify-center overflow-hidden">{BRANDS[model.brand]}</span>
            ) : null}
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{model.name}</span>
            <span className="shrink-0 text-ink-3">
              <Icon size={11} strokeWidth={2.4}><path d="M6 9l6 6 6-6" /></Icon>
            </span>
          </button>

          {/* permission mode */}
          <button
            ref={permRef}
            type="button"
            aria-expanded={permOpen}
            aria-label="Permission mode"
            title={permMeta.desc}
            disabled={busy}
            onClick={() => {
              if (busy) return;
              setPlusOpen(false);
              setModelOpen(false);
              setPermOpen((current) => !current);
            }}
            className={`flex h-7 shrink-0 items-center gap-1 px-1.5 text-[12px] font-medium text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-50 ${
              pill ? "rounded-full" : "rounded-[8px]"
            } ${wide ? "col-start-3 row-start-2 justify-self-start" : "col-start-4 row-start-1"}`}
          >
            <Icon size={13} strokeWidth={2}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </Icon>
            <span className="whitespace-nowrap">{permMeta.short}</span>
          </button>

          {/* dictation — kept visible; slash when temporarily unavailable */}
          <button
            type="button"
            aria-label={dictationEnabled ? (listening ? "Stop dictation" : "Start dictation") : "语音输入暂不可用"}
            aria-pressed={dictationEnabled ? listening : undefined}
            aria-disabled={!dictationEnabled}
            title={dictationEnabled ? undefined : "语音输入暂不可用"}
            onClick={() => {
              if (!dictationEnabled) return;
              setListening((current) => !current);
            }}
            className={`relative flex size-7 shrink-0 items-center justify-center transition-[background-color,color,transform] duration-150 ${
              pill ? "rounded-full" : "rounded-[8px]"
            } ${
              !dictationEnabled
                ? "cursor-not-allowed text-ink-3 opacity-55"
                : listening
                  ? "bg-accent-tint text-accent-ink active:scale-[0.94]"
                  : "text-ink-3 hover:bg-hover hover:text-ink active:scale-[0.94]"
            } ${wide ? "col-start-5 row-start-2" : "col-start-5 row-start-1"}`}
          >
            {dictationEnabled && listening ? (
              <span className="flex h-3.5 items-center gap-[2.5px]">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-[2.5px] rounded-full bg-current"
                    style={{ height: "100%", animation: `eq-bounce 900ms ease-in-out ${i * 150}ms infinite` }}
                  />
                ))}
              </span>
            ) : (
              <Icon size={15} strokeWidth={2}><g><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" /></g></Icon>
            )}
            {!dictationEnabled ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
              >
                <span className="block h-[1.5px] w-4 rotate-[-35deg] rounded-full bg-current" />
              </span>
            ) : null}
          </button>

          {/* send / stop */}
          <button
            type="button"
            aria-label={busy ? "Stop" : "Send"}
            disabled={!canAct}
            onClick={send}
            className={`flex size-7 shrink-0 items-center justify-center transition-[background-color,color,transform] duration-200 enabled:active:scale-[0.94] ${
              pill ? "rounded-full" : "rounded-[8px]"
            } ${wide ? "col-start-6 row-start-2" : "col-start-6 row-start-1"}`}
            style={{
              background: canAct ? "var(--ink)" : "var(--line-strong)",
              color: canAct ? "var(--surface)" : "var(--ink-2)",
            }}
          >
            {busy ? (
              <Icon size={14} strokeWidth={0}>
                <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />
              </Icon>
            ) : (
              <Icon size={16} strokeWidth={2.4}>
                <path d="M12 19V5M5 12l7-7 7 7" />
              </Icon>
            )}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
