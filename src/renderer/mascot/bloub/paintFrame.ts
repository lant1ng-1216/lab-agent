import type { BotFrame } from "./bot/engine";
import { RAYON } from "./bot/repere";
import { NOTIF_BLUE } from "./bot/decor";
import { mixHex } from "./bot/skins";

const SVG_NS = "http://www.w3.org/2000/svg";

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number | undefined>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v !== undefined) node.setAttribute(k, String(v));
    }
  }
  return node;
}

function clear(node: Element) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function setAttrs(node: Element, attrs: Record<string, string | number | undefined>) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined) node.removeAttribute(k);
    else node.setAttribute(k, String(v));
  }
}

export type PaintHandles = {
  svg: SVGSVGElement;
  maskBody: SVGPathElement;
  maskEyes: SVGGElement;
  maskNotch: SVGCircleElement;
  grads: SVGGElement;
  arcsBack: SVGGElement;
  dotsBehind: SVGGElement;
  bodyGroup: SVGGElement;
  bodyFill: SVGPathElement;
  softRim: SVGPathElement;
  inkRect: SVGRectElement;
  dotsFront: SVGGElement;
  notif: SVGCircleElement;
  arcsFront: SVGGElement;
};

/** Build static SVG skeleton once; paintFrame mutates it each tick. */
export function mountBotSvg(
  svg: SVGSVGElement,
  opts: { maskId: string; uid: string; vb: number; ink: string; paper: string },
): PaintHandles {
  const { maskId, uid, vb, ink, paper } = opts;
  clear(svg);

  const defs = el("defs");
  const mask = el("mask", {
    id: maskId,
    maskUnits: "userSpaceOnUse",
    x: -vb,
    y: -vb,
    width: vb * 2,
    height: vb * 2,
  });
  const maskBody = el("path", { fill: "#fff" });
  const maskEyes = el("g");
  const maskNotch = el("circle", { fill: "#000", display: "none" });
  mask.append(maskBody, maskEyes, maskNotch);
  const grads = el("g");
  defs.append(mask, grads);

  const arcsBack = el("g", { fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" });
  const dotsBehind = el("g");
  const bodyGroup = el("g");
  const bodyFill = el("path", { fill: paper });
  // Hairline soft rim: reduces stair-stepping on the silhouette at small sizes
  const softRim = el("path", {
    fill: "none",
    stroke: paper,
    "stroke-width": 2.2,
    opacity: 0.55,
    "stroke-linejoin": "round",
  });
  const masked = el("g", { mask: `url(#${maskId})` });
  const inkRect = el("rect", {
    x: -vb,
    y: -vb,
    width: vb * 2,
    height: vb * 2,
    fill: ink,
  });
  masked.append(inkRect);
  bodyGroup.append(bodyFill, softRim, masked);
  const dotsFront = el("g");
  const notif = el("circle", { fill: NOTIF_BLUE, display: "none" });
  const arcsFront = el("g", { fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" });

  svg.setAttribute("shape-rendering", "geometricPrecision");
  svg.append(defs, arcsBack, dotsBehind, bodyGroup, dotsFront, notif, arcsFront);

  return {
    svg,
    maskBody,
    maskEyes,
    maskNotch,
    grads,
    arcsBack,
    dotsBehind,
    bodyGroup,
    bodyFill,
    softRim,
    inkRect,
    dotsFront,
    notif,
    arcsFront,
  };
}

function syncDots(
  group: SVGGElement,
  dots: BotFrame["dots"],
  ink: string,
  paper: string,
) {
  const R = RAYON;
  while (group.childNodes.length > dots.length) {
    group.removeChild(group.lastChild!);
  }
  for (let i = 0; i < dots.length; i++) {
    const dot = dots[i]!;
    const fill =
      dot.color ?? (dot.depth === undefined ? ink : mixHex(paper, ink, dot.depth));
    let node = group.childNodes[i] as SVGElement | undefined;
    if (dot.d) {
      if (!node || node.tagName !== "path") {
        if (node) group.replaceChild(el("path"), node);
        else group.appendChild(el("path"));
        node = group.childNodes[i] as SVGElement;
      }
      setAttrs(node, {
        d: dot.d,
        fill,
        opacity: dot.opacity,
        transform: `translate(${dot.x} ${dot.y}) rotate(${dot.rot ?? 0}) scale(${R})`,
      });
    } else {
      if (!node || node.tagName !== "circle") {
        if (node) group.replaceChild(el("circle"), node);
        else group.appendChild(el("circle"));
        node = group.childNodes[i] as SVGElement;
      }
      setAttrs(node, {
        cx: dot.x,
        cy: dot.y,
        r: dot.r,
        fill,
        opacity: dot.opacity,
        transform: undefined,
      });
    }
  }
}

export function paintFrame(
  h: PaintHandles,
  frame: BotFrame,
  opts: { uid: string; ink: string; paper: string },
) {
  const { uid, ink, paper } = opts;
  h.maskBody.setAttribute("d", frame.bodyPath);
  h.bodyFill.setAttribute("d", frame.bodyPath);
  h.bodyFill.setAttribute("fill", paper);
  h.softRim.setAttribute("d", frame.bodyPath);
  h.softRim.setAttribute("stroke", paper);
  h.inkRect.setAttribute("fill", ink);
  h.bodyGroup.setAttribute("opacity", String(frame.bodyAlpha));

  // Eyes in mask
  while (h.maskEyes.childNodes.length > frame.eyes.length) {
    h.maskEyes.removeChild(h.maskEyes.lastChild!);
  }
  for (let i = 0; i < frame.eyes.length; i++) {
    const eye = frame.eyes[i]!;
    let node = h.maskEyes.childNodes[i] as SVGPathElement | undefined;
    if (!node) {
      node = el("path", { fill: "#000" });
      h.maskEyes.appendChild(node);
    }
    setAttrs(node, {
      d: eye.d,
      transform: eye.matrix,
      opacity: eye.alpha,
    });
  }

  if (frame.notch) {
    setAttrs(h.maskNotch, {
      cx: frame.notch.x,
      cy: frame.notch.y,
      r: frame.notch.r,
      display: undefined,
    });
  } else {
    h.maskNotch.setAttribute("display", "none");
  }

  // Gradients + arcs
  const arcs = frame.arcs;
  while (h.grads.childNodes.length > arcs.length) {
    h.grads.removeChild(h.grads.lastChild!);
  }
  while (h.arcsBack.childNodes.length > arcs.length) {
    h.arcsBack.removeChild(h.arcsBack.lastChild!);
    h.arcsFront.removeChild(h.arcsFront.lastChild!);
  }
  for (let i = 0; i < arcs.length; i++) {
    const arc = arcs[i]!;
    let grad = h.grads.childNodes[i] as SVGLinearGradientElement | undefined;
    if (!grad) {
      grad = el("linearGradient", {
        id: `${uid}-${arc.id}`,
        gradientUnits: "userSpaceOnUse",
      }) as SVGLinearGradientElement;
      h.grads.appendChild(grad);
    } else {
      grad.setAttribute("id", `${uid}-${arc.id}`);
    }
    setAttrs(grad, {
      x1: arc.grad.x1,
      y1: arc.grad.y1,
      x2: arc.grad.x2,
      y2: arc.grad.y2,
    });
    while (grad.childNodes.length > arc.grad.stops.length) {
      grad.removeChild(grad.lastChild!);
    }
    for (let s = 0; s < arc.grad.stops.length; s++) {
      let stop = grad.childNodes[s] as SVGStopElement | undefined;
      if (!stop) {
        stop = el("stop");
        grad.appendChild(stop);
      }
      const off =
        arc.grad.stops.length <= 1 ? 0 : s / (arc.grad.stops.length - 1);
      setAttrs(stop, {
        offset: off,
        "stop-color": arc.grad.stops[s],
      });
    }

    let back = h.arcsBack.childNodes[i] as SVGPathElement | undefined;
    let front = h.arcsFront.childNodes[i] as SVGPathElement | undefined;
    if (!back) {
      back = el("path");
      h.arcsBack.appendChild(back);
    }
    if (!front) {
      front = el("path");
      h.arcsFront.appendChild(front);
    }
    const stroke = `url(#${uid}-${arc.id})`;
    setAttrs(back, {
      d: arc.back,
      stroke,
      "stroke-width": arc.width,
      opacity: arc.opacity,
    });
    setAttrs(front, {
      d: arc.front,
      stroke,
      "stroke-width": arc.width,
      opacity: arc.opacity,
    });
  }

  if (frame.dotsBehind) {
    clear(h.dotsFront);
    syncDots(h.dotsBehind, frame.dots, ink, paper);
  } else {
    clear(h.dotsBehind);
    syncDots(h.dotsFront, frame.dots, ink, paper);
  }

  if (frame.notif) {
    setAttrs(h.notif, {
      cx: frame.notif.x,
      cy: frame.notif.y,
      r: frame.notif.r,
      display: undefined,
    });
  } else {
    h.notif.setAttribute("display", "none");
  }
}
