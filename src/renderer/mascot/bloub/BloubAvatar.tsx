import { useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import { BotEngine } from "./bot/engine";
import { RAYON } from "./bot/repere";
import { COLOR_BY_ID, DEFAULT_COLOR } from "./bot/skins";
import { DEFAULT_EXPRESSION, EXPRESSION_BY_ID } from "./bot/expressions";
import { STATE_BY_ID, type StateId } from "./bot/states";
import { clamp } from "./bot/math";
import { CHAT_HOVER_GAIN, CHAT_LOOK_MORPH, lookTargetChat } from "./gaze";
import { mountBotSvg, paintFrame, type PaintHandles } from "./paintFrame";

/**
 * Bloub (https://github.com/jeremy-prt/bloub) — MIT engine, non-affiliated
 * recreation of xAI bot morphing. Chat avatar with gaze follow + mood choreography.
 */

export type BloubMood = "idle" | "thinking" | "tool" | "waiting" | "error";

/** full = live turn; breathe = past rows; off = static */
export type BloubMotion = "full" | "breathe" | "off";

const HOLD: Record<BloubMood, StateId> = {
  idle: "idle",
  thinking: "thinking",
  tool: "orbit",
  waiting: "notify",
  error: "alert",
};

const SWIRL_HOLD = 0.55;
const WINK_HOLD = 0.7;
const WIDE_HOLD = 0.55;
const CHAT_VB = 112;
const BREATHE_FPS = 15;
const PAPER_FALLBACK = "#ffffff";
/** Body fill on dark chat paper — high-contrast white blob */
const DARK_THEME_INK = "#f2f2f3";
/** Skip setLook when aim barely moved — cuts morph thrash / micro-stutter. */
const AIM_EPS = 0.012;

function isDarkTheme(): boolean {
  const root = document.documentElement;
  if (root.classList.contains("dark")) return true;
  const theme = root.dataset.theme || root.dataset.labTheme;
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
}

/** Bloub body = ink; eye holes = paper. Dark UI → white body. */
function resolveInk(colorId: string, dark: boolean): string {
  if (dark) return DARK_THEME_INK;
  return COLOR_BY_ID.get(colorId)?.hex ?? "#0a0a0c";
}

type Props = {
  size?: number;
  mood?: BloubMood;
  color?: string;
  className?: string;
  animate?: boolean;
  motion?: BloubMotion;
  /** Live: always follow. Breathe: follow only when pointer near the row. */
  follow?: boolean;
  /** Click wink + hover attention */
  interactive?: boolean;
  /**
   * Bumps when the user sends a message — short “I heard you” (wide → hold).
   * Only meaningful on the live avatar.
   */
  listenToken?: number;
};

/**
 * Eye-hole color must match the real chat surface.
 * Prefer computed `backgroundColor` (resolves oklch / color-mix) over raw CSS vars.
 */
function resolvePaper(host: Element | null): string {
  const candidates: Element[] = [];
  if (host) {
    const main = host.closest("main") ?? host.closest("[class*='lab-main']");
    if (main) candidates.push(main);
    candidates.push(host);
  }
  const root = host?.closest(".lab-root") ?? document.querySelector(".lab-root");
  if (root) candidates.push(root);
  candidates.push(document.documentElement);

  for (const el of candidates) {
    const bg = getComputedStyle(el).backgroundColor;
    if (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)") continue;
    return bg;
  }

  // Last resort: read resolved --page via a probe (handles oklch tokens)
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;left:-9999px;background:var(--page)";
  document.documentElement.appendChild(probe);
  const pageBg = getComputedStyle(probe).backgroundColor;
  probe.remove();
  if (pageBg && pageBg !== "transparent" && pageBg !== "rgba(0, 0, 0, 0)") return pageBg;

  return isDarkTheme() ? "#17181a" : PAPER_FALLBACK;
}

function useThemePaint(hostRef: RefObject<HTMLElement | null>): { paper: string; dark: boolean } {
  const [paint, setPaint] = useState(() => ({
    paper: PAPER_FALLBACK,
    dark: typeof document !== "undefined" ? isDarkTheme() : false,
  }));

  useEffect(() => {
    const read = () =>
      setPaint({
        paper: resolvePaper(hostRef.current),
        dark: isDarkTheme(),
      });
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "data-lab-theme", "style"],
    });
    const root = document.querySelector(".lab-root");
    if (root) obs.observe(root, { attributes: true, attributeFilter: ["class", "style"] });
    const t = window.setTimeout(read, 0);
    const t2 = window.setTimeout(read, 50);
    return () => {
      obs.disconnect();
      window.clearTimeout(t);
      window.clearTimeout(t2);
    };
  }, [hostRef]);

  return paint;
}

function queueForMood(prev: StateId, mood: BloubMood): StateId[] {
  const hold = HOLD[mood];
  if (mood === "idle" && prev !== "idle" && prev !== "wink" && prev !== "wide") {
    return ["wink", "idle"];
  }
  if ((mood === "thinking" || mood === "tool") && (prev === "idle" || prev === "wink" || prev === "wide")) {
    return ["swirl", hold];
  }
  if (prev === hold) return [hold];
  return [hold];
}

function holdSeconds(id: StateId): number {
  if (id === "swirl") return SWIRL_HOLD;
  if (id === "wink") return WINK_HOLD;
  if (id === "wide") return WIDE_HOLD;
  return Infinity;
}

function resolveMotion(motion: BloubMotion | undefined, animate: boolean | undefined): BloubMotion {
  if (motion) return motion;
  if (animate === false) return "breathe";
  return "full";
}

export default function BloubAvatar({
  size = 28,
  mood = "idle",
  color = DEFAULT_COLOR,
  className,
  animate,
  motion: motionProp,
  follow = true,
  interactive = true,
  listenToken = 0,
}: Props) {
  const reactId = useId().replace(/:/g, "");
  const maskId = `bloub-mask-${reactId}`;
  const uid = `bloub-${reactId}`;
  const hostRef = useRef<HTMLElement | null>(null);
  const { paper, dark } = useThemePaint(hostRef);
  const ink = resolveInk(color, dark);
  const baseExpr = EXPRESSION_BY_ID.get(DEFAULT_EXPRESSION) ?? null;
  const hoverExpr = EXPRESSION_BY_ID.get("surpris") ?? baseExpr;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const handlesRef = useRef<PaintHandles | null>(null);
  const engineRef = useRef<BotEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new BotEngine(RAYON, HOLD[mood], null, baseExpr);
  }

  const clockRef = useRef(0);
  const lastMsRef = useRef(0);
  const breatheAccRef = useRef(0);
  const queueRef = useRef<StateId[]>([HOLD[mood]]);
  const blockStartRef = useRef(0);
  const moodRef = useRef(mood);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const hoveringRef = useRef(false);
  const lastAimRef = useRef<{ nx: number; ny: number } | null>(null);
  const inkRef = useRef(ink);
  const paperRef = useRef(paper);
  inkRef.current = ink;
  paperRef.current = paper;

  const reduceMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  }, []);

  const motion = reduceMotion ? "off" : resolveMotion(motionProp, animate);
  const canInteract = interactive && motion !== "off";

  const renderPx = size * 2;

  const paintNow = (t?: number) => {
    const h = handlesRef.current;
    if (!h) return;
    const sampleT = t ?? (motion === "off" ? 0.4 : clockRef.current);
    paintFrame(h, engineRef.current!.sample(sampleT), {
      uid,
      ink: inkRef.current,
      paper: paperRef.current,
    });
  };

  /**
   * Global pointer follow — never setLook(null)/REST reset.
   * No pointer or no face: hold last aim (engine keeps previous Look).
   */
  const applyGaze = (clock: number) => {
    if (!follow) return;
    const engine = engineRef.current!;
    const faceOk = STATE_BY_ID.get(engine.state)?.baseFace;
    if (!faceOk) return;

    const pointer = pointerRef.current;
    if (!pointer) return;

    const svg = svgRef.current;
    const box = svg?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return;

    const demiW = Math.max(1, window.innerWidth / 2);
    const demiH = Math.max(1, window.innerHeight / 2);
    const nx = clamp((pointer.x - (box.left + box.width / 2)) / demiW, -1, 1);
    const ny = clamp((pointer.y - (box.top + box.height / 2)) / demiH, -1, 1);
    const prev = lastAimRef.current;
    if (prev && Math.abs(prev.nx - nx) < AIM_EPS && Math.abs(prev.ny - ny) < AIM_EPS) {
      return;
    }
    lastAimRef.current = { nx, ny };

    const gain = hoveringRef.current ? CHAT_HOVER_GAIN : 1;
    engine.setLook(
      lookTargetChat({ nx, ny, pointer: true, gain }),
      clock,
      CHAT_LOOK_MORPH,
    );
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.setAttribute("shape-rendering", "geometricPrecision");
    handlesRef.current = mountBotSvg(svg, {
      maskId,
      uid,
      vb: CHAT_VB,
      ink: inkRef.current,
      paper: paperRef.current,
    });
    // Start centered (mix=1) — never begin on REST_GAZE “look up-right”
    engineRef.current!.setLook(
      lookTargetChat({ nx: 0, ny: 0, pointer: true }),
      0,
      CHAT_LOOK_MORPH,
    );
    lastAimRef.current = { nx: 0, ny: 0 };
    paintNow(0.4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maskId, uid]);

  useEffect(() => {
    paintNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper, ink, uid]);

  useEffect(() => {
    const engine = engineRef.current!;
    const prev = engine.state;
    const q = queueForMood(prev, mood);
    moodRef.current = mood;
    queueRef.current = q;
    const next = q[0]!;
    if (next !== engine.state) {
      engine.setState(next, clockRef.current);
      blockStartRef.current = clockRef.current;
    }
  }, [mood]);

  // User sent a message → short “listening” face
  useEffect(() => {
    if (!listenToken || motion === "off") return;
    const engine = engineRef.current!;
    const hold = HOLD[moodRef.current];
    queueRef.current = ["wide", hold];
    engine.setState("wide", clockRef.current);
    blockStartRef.current = clockRef.current;
  }, [listenToken, motion]);

  useEffect(() => {
    if (motion === "off") {
      paintNow(0.4);
      return;
    }

    let raf = 0;
    const tick = (ms: number) => {
      raf = requestAnimationFrame(tick);
      const dt = lastMsRef.current ? Math.min((ms - lastMsRef.current) / 1000, 0.064) : 0;
      lastMsRef.current = ms;
      clockRef.current += dt;
      const clock = clockRef.current;
      const engine = engineRef.current!;

      // Advance choreography blocks (mood / wink / listen)
      const q = queueRef.current;
      if (q.length > 1) {
        const cur = q[0]!;
        if (clock - blockStartRef.current >= holdSeconds(cur)) {
          q.shift();
          const next = q[0]!;
          engine.setState(next, clock);
          blockStartRef.current = clock;
        }
      } else if (motion === "breathe") {
        const busy = engine.state === "wink" || engine.state === "wide";
        if (!busy && engine.state !== "idle") engine.setState("idle", clock);
      }

      applyGaze(clock);

      if (motion === "breathe") {
        breatheAccRef.current += dt;
        if (breatheAccRef.current < 1 / BREATHE_FPS) return;
        breatheAccRef.current = 0;
      }

      paintNow(clock);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      lastMsRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motion, follow, uid]);

  // Pointer always tracked when alive
  useEffect(() => {
    if (motion === "off") return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      pointerRef.current = { x: e.clientX, y: e.clientY };
    };
    const onLeave = () => {
      // Hold last aim — never reset to REST when the cursor leaves.
      pointerRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [motion]);

  const setHover = (on: boolean) => {
    if (!canInteract) return;
    hoveringRef.current = on;
    const engine = engineRef.current!;
    const clock = clockRef.current;
    if (on) {
      engine.setExpression(hoverExpr, clock);
    } else {
      engine.setExpression(baseExpr, clock);
    }
  };

  const playWink = () => {
    if (!canInteract) return;
    const engine = engineRef.current!;
    const hold = HOLD[moodRef.current];
    queueRef.current = ["wink", hold === "idle" || motion === "breathe" ? "idle" : hold];
    engine.setState("wink", clockRef.current);
    blockStartRef.current = clockRef.current;
  };

  const shellClass = [
    className,
    canInteract
      ? "origin-center transition-transform duration-200 ease-out hover:scale-[1.14] active:scale-[1.06] cursor-pointer"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  const svg = (
    <svg
      ref={svgRef}
      width={renderPx}
      height={renderPx}
      viewBox={`${-CHAT_VB} ${-CHAT_VB} ${CHAT_VB * 2} ${CHAT_VB * 2}`}
      role="img"
      aria-label="Lab Agent"
      className="block overflow-visible"
      style={{ width: size, height: size }}
    />
  );

  const bindHost = (n: HTMLElement | null) => {
    hostRef.current = n;
  };

  if (canInteract) {
    return (
      <button
        ref={bindHost}
        type="button"
        title="点一点"
        onClick={playWink}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        className={shellClass}
        style={{ width: size, height: size, padding: 0, border: 0, background: "transparent" }}
      >
        {svg}
      </button>
    );
  }

  return (
    <div ref={bindHost} className={shellClass} style={{ width: size, height: size }}>
      {svg}
    </div>
  );
}
