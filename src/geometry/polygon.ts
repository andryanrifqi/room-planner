/** Low-level 2D vector and polygon helpers. y grows downward (SVG convention). */
import type { Point, Rect } from '../types';

export const EPS = 1e-6;

export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Point, s: number): Point => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;
export const cross = (a: Point, b: Point): number => a.x * b.y - a.y * b.x;
export const length = (a: Point): number => Math.hypot(a.x, a.y);
export const samePoint = (a: Point, b: Point): boolean => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;

/** Signed area. Positive means clockwise on screen (y down). */
export function signedArea(poly: Point[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function boundingBox(poly: Point[]): Rect {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function rectPolygon(r: Rect): Point[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return length(sub(p, add(a, scale(ab, t))));
}

export function pointOnBoundary(p: Point, poly: Point[], eps = EPS): boolean {
  return poly.some((a, i) => distanceToSegment(p, a, poly[(i + 1) % poly.length]) <= eps);
}

/** Even-odd point-in-polygon test; points on the boundary count as inside. */
export function pointInPolygon(p: Point, poly: Point[]): boolean {
  if (pointOnBoundary(p, poly)) return true;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** For a convex polygon (any winding): true when p is inside and more than eps from every edge. */
export function strictlyInsideConvex(p: Point, poly: Point[], eps = EPS): boolean {
  const sign = Math.sign(signedArea(poly)) || 1;
  return poly.every((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const e = sub(b, a);
    return (sign * cross(e, sub(p, a))) / (length(e) || 1) > eps;
  });
}

/** Clip segment ab to a convex polygon (Cyrus–Beck). Returns the inside part, or null. */
export function clipSegmentToConvex(a: Point, b: Point, poly: Point[]): [Point, Point] | null {
  const sign = Math.sign(signedArea(poly)) || 1;
  const d = sub(b, a);
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const e = sub(poly[(i + 1) % poly.length], p);
    // Inside means sign * cross(e, x - p) >= 0.
    const num = sign * cross(e, sub(a, p));
    const den = sign * cross(e, d);
    if (Math.abs(den) < EPS) {
      if (num < -EPS) return null;
      continue;
    }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1 + EPS) return null;
  }
  return [add(a, scale(d, t0)), add(a, scale(d, t1))];
}

/** Sutherland–Hodgman clip of a polygon to an axis-aligned rectangle. */
export function clipPolygonToRect(poly: Point[], r: Rect): Point[] {
  const planes: [(p: Point) => number, (a: Point, b: Point) => Point][] = [
    [(p) => p.x - r.x, (a, b) => lerpAt(a, b, (r.x - a.x) / (b.x - a.x))],
    [(p) => r.x + r.w - p.x, (a, b) => lerpAt(a, b, (r.x + r.w - a.x) / (b.x - a.x))],
    [(p) => p.y - r.y, (a, b) => lerpAt(a, b, (r.y - a.y) / (b.y - a.y))],
    [(p) => r.y + r.h - p.y, (a, b) => lerpAt(a, b, (r.y + r.h - a.y) / (b.y - a.y))],
  ];
  let out = poly;
  for (const [inside, cut] of planes) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      const curIn = inside(cur) >= 0;
      const prevIn = inside(prev) >= 0;
      if (curIn) {
        if (!prevIn) out.push(cut(prev, cur));
        out.push(cur);
      } else if (prevIn) {
        out.push(cut(prev, cur));
      }
    }
    if (out.length === 0) return out;
  }
  return out;
}

function lerpAt(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Distance from p to a polygon: 0 when p is inside or on it. */
export function distanceToPolygon(p: Point, poly: Point[]): number {
  if (pointInPolygon(p, poly)) return 0;
  return Math.min(...poly.map((a, i) => distanceToSegment(p, a, poly[(i + 1) % poly.length])));
}

/** Separating-axis test for two convex polygons. Touching edges do not count as overlapping. */
export function convexOverlap(a: Point[], b: Point[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const e = sub(poly[(i + 1) % poly.length], poly[i]);
      const len = length(e);
      if (len < EPS) continue;
      const axis = { x: -e.y / len, y: e.x / len };
      const pa = a.map((p) => dot(p, axis));
      const pb = b.map((p) => dot(p, axis));
      if (Math.max(...pa) <= Math.min(...pb) + EPS || Math.max(...pb) <= Math.min(...pa) + EPS) return false;
    }
  }
  return true;
}

/** True when segments ab and cd share any point (including endpoints and collinear overlap). */
export function segmentsTouch(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = cross(sub(b, a), sub(c, a));
  const d2 = cross(sub(b, a), sub(d, a));
  const d3 = cross(sub(d, c), sub(a, c));
  const d4 = cross(sub(d, c), sub(b, c));
  if (((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))) {
    return true;
  }
  return (
    distanceToSegment(c, a, b) <= EPS ||
    distanceToSegment(d, a, b) <= EPS ||
    distanceToSegment(a, c, d) <= EPS ||
    distanceToSegment(b, c, d) <= EPS
  );
}
