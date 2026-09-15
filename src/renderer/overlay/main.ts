import type { LinkPorts, WindowBounds } from '../../shared/protocol';

const svg = document.getElementById('svg') as unknown as SVGSVGElement;
const link = document.getElementById('link') as unknown as SVGPathElement;
const aEl = document.getElementById('a') as unknown as SVGCircleElement;
const bEl = document.getElementById('b') as unknown as SVGCircleElement;
const midEl = document.getElementById('mid') as unknown as SVGCircleElement;

type Side = 'left' | 'right' | 'top' | 'bottom';

function facingSide(self: WindowBounds, other: WindowBounds): Side {
  const scx = self.x + self.width / 2;
  const scy = self.y + self.height / 2;
  const ocx = other.x + other.width / 2;
  const ocy = other.y + other.height / 2;
  const dx = ocx - scx;
  const dy = ocy - scy;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

function anchor(rect: WindowBounds, side: Side, originX: number, originY: number) {
  const local = {
    left: rect.x - originX,
    top: rect.y - originY,
    right: rect.x + rect.width - originX,
    bottom: rect.y + rect.height - originY,
    cx: rect.x + rect.width / 2 - originX,
    cy: rect.y + rect.height / 2 - originY,
  };
  switch (side) {
    case 'left':
      return { x: local.left, y: local.cy, nx: -1, ny: 0 };
    case 'right':
      return { x: local.right, y: local.cy, nx: 1, ny: 0 };
    case 'top':
      return { x: local.cx, y: local.top, nx: 0, ny: -1 };
    case 'bottom':
      return { x: local.cx, y: local.bottom, nx: 0, ny: 1 };
  }
}

function draw(ports: LinkPorts) {
  const { display, supervisor, coding } = ports;
  svg.setAttribute('width', String(display.width));
  svg.setAttribute('height', String(display.height));
  svg.setAttribute('viewBox', `0 0 ${display.width} ${display.height}`);

  const sideA = facingSide(supervisor, coding);
  const sideB = facingSide(coding, supervisor);
  const a = anchor(supervisor, sideA, display.x, display.y);
  const b = anchor(coding, sideB, display.x, display.y);

  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const k = Math.max(40, Math.min(120, dist * 0.35));
  const d = `M ${a.x} ${a.y} C ${a.x + a.nx * k} ${a.y + a.ny * k}, ${b.x + b.nx * k} ${b.y + b.ny * k}, ${b.x} ${b.y}`;
  link.setAttribute('d', d);
  aEl.setAttribute('cx', String(a.x));
  aEl.setAttribute('cy', String(a.y));
  bEl.setAttribute('cx', String(b.x));
  bEl.setAttribute('cy', String(b.y));
  midEl.setAttribute('cx', String((a.x + b.x) / 2));
  midEl.setAttribute('cy', String((a.y + b.y) / 2));
}

window.lab.onLinkUpdate(draw);
window.lab.requestLinkUpdate();
