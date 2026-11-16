/**
 * Room outlines: polygons whose walls all meet at right angles, listed clockwise on screen.
 * Wall i runs from points[i] to points[i + 1]; openings are positioned by wall index and offset
 * from the wall's start, so every shape edit also returns a `remap` that keeps them in place.
 */
import type { Point, Rect, Room } from '../types';
import { add, boundingBox, cross, dot, EPS, length, scale, segmentsTouch, signedArea, sub } from './polygon';

export interface WallFrame {
  start: Point;
  end: Point;
  /** Unit vector along the wall (from start to end). */
  dir: Point;
  /** Unit vector pointing into the room. */
  inward: Point;
  length: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const roundPoint = (p: Point): Point => ({ x: r2(p.x), y: r2(p.y) });
const mod = (i: number, n: number) => ((i % n) + n) % n;

function frameOf(points: Point[], index: number): WallFrame {
  const n = points.length;
  const start = points[mod(index, n)];
  const end = points[mod(index + 1, n)];
  const len = length(sub(end, start));
  const dir = len > EPS ? scale(sub(end, start), 1 / len) : { x: 1, y: 0 };
  // Clockwise on screen (y down): the room is on the right-hand side of travel.
  return { start, end, dir, inward: { x: -dir.y, y: dir.x }, length: len };
}

export function wallFrame(index: number, room: Room): WallFrame {
  return frameOf(room.points, index);
}

export function walls(room: Room): WallFrame[] {
  return room.points.map((_, i) => frameOf(room.points, i));
}

export function wallLength(index: number, room: Room): number {
  return wallFrame(index, room).length;
}

export function roomBounds(room: Room): Rect {
  return boundingBox(room.points);
}

export function roomArea(room: Room): number {
  return Math.abs(signedArea(room.points));
}

export type WallSide = 'top' | 'right' | 'bottom' | 'left';

/** Which side of the room a wall bounds, e.g. a wall whose inside faces down is a "top" wall. */
export function wallSide(f: WallFrame): WallSide {
  if (f.inward.y > 0.5) return 'top';
  if (f.inward.y < -0.5) return 'bottom';
  return f.inward.x > 0 ? 'left' : 'right';
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export function rectRoom(width: number, depth: number): Room {
  return {
    points: [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: depth },
      { x: 0, y: depth },
    ],
  };
}

export type RoomShape = 'rectangle' | 'l' | 'u' | 't';

/** Preset outlines fitting a width × depth bounding box. */
export function presetRoom(shape: RoomShape, width: number, depth: number): Room {
  const w = Math.round(width);
  const d = Math.round(depth);
  const pts = (...xy: number[][]) => ({ points: xy.map(([x, y]) => ({ x, y })) });
  switch (shape) {
    case 'rectangle':
      return rectRoom(w, d);
    case 'l': {
      // Top-right corner cut away.
      const a = Math.round(w * 0.55);
      const b = Math.round(d * 0.45);
      return pts([0, 0], [a, 0], [a, b], [w, b], [w, d], [0, d]);
    }
    case 'u': {
      // Notch in the middle of the top wall.
      const a = Math.round(w / 3);
      const b = Math.round(d / 2);
      return pts([0, 0], [a, 0], [a, b], [w - a, b], [w - a, 0], [w, 0], [w, d], [0, d]);
    }
    case 't': {
      // Full-width top bar, narrower stem below.
      const a = Math.round(w / 4);
      const b = Math.round(d * 0.45);
      return pts([0, 0], [w, 0], [w, b], [w - a, b], [w - a, d], [a, d], [a, b], [0, b]);
    }
  }
}

/** True for a simple, clockwise polygon of at least 4 axis-aligned, non-zero, alternating walls. */
export function isValidRoom(points: Point[]): boolean {
  const n = points.length;
  if (n < 4 || signedArea(points) <= EPS) return false;
  for (let i = 0; i < n; i++) {
    const e = sub(points[(i + 1) % n], points[i]);
    if (length(e) < EPS) return false;
    if (Math.abs(e.x) > EPS && Math.abs(e.y) > EPS) return false;
    const next = sub(points[(i + 2) % n], points[(i + 1) % n]);
    if (Math.abs(cross(e, next)) < EPS) return false;
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent through the wrap-around
      if (segmentsTouch(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Edits. Each returns new points plus a remap for openings (wall index + offset).
// ---------------------------------------------------------------------------

export interface OpeningRef {
  wall: number;
  offset: number;
}

/** Maps an opening's position on the old outline to the new one; null when its wall is gone. */
export type Remap = (ref: OpeningRef) => OpeningRef | null;

export interface ShapeEdit {
  points: Point[];
  remap: Remap;
}

export const identityRemap: Remap = (r) => r;

export function composeRemap(first: Remap, second: Remap): Remap {
  return (r) => {
    const m = first(r);
    return m && second(m);
  };
}

/** Translate wall i by `vec` (perpendicular to it); its neighbours stretch or shrink. */
export function moveWallBy(points: Point[], index: number, vec: Point): ShapeEdit {
  const n = points.length;
  const i = mod(index, n);
  const j = mod(i + 1, n);
  const next = frameOf(points, j);
  const out = points.map((p, k) => (k === i || k === j ? roundPoint(add(p, vec)) : p));
  // The following wall now starts at a moved point; keep its openings where they were.
  const shift = dot(vec, next.dir);
  return { points: out, remap: (r) => (r.wall === j ? { wall: j, offset: r.offset - shift } : r) };
}

/** Move wall i by `delta` cm along its inward normal (positive = into the room). */
export function moveWall(points: Point[], index: number, delta: number): ShapeEdit {
  return moveWallBy(points, index, scale(frameOf(points, index).inward, delta));
}

/** Move corner i to `target`, sliding both walls that meet there. */
export function moveCorner(points: Point[], index: number, target: Point): ShapeEdit {
  const n = points.length;
  const i = mod(index, n);
  const prev = frameOf(points, i - 1);
  const cur = frameOf(points, i);
  let nPrev: Point | null = prev.length > EPS ? prev.inward : null;
  let nCur: Point | null = cur.length > EPS ? cur.inward : null;
  if (!nPrev && nCur) nPrev = cur.dir;
  if (!nCur && nPrev) nCur = prev.dir;
  if (!nPrev || !nCur) return { points, remap: identityRemap };
  const delta = sub(target, points[i]);
  const a = moveWallBy(points, i - 1, scale(nPrev, dot(delta, nPrev)));
  const b = moveWallBy(a.points, i, scale(nCur, dot(delta, nCur)));
  return { points: b.points, remap: composeRemap(a.remap, b.remap) };
}

/**
 * Split wall i at `at` cm from its start by inserting a zero-length jog. Dragging either half
 * afterwards creates a step (alcove or bump-out) in the wall.
 */
export function splitWall(points: Point[], index: number, at: number): ShapeEdit {
  const n = points.length;
  const i = mod(index, n);
  const f = frameOf(points, i);
  const m = roundPoint(add(f.start, scale(f.dir, at)));
  const out = [...points.slice(0, i + 1), m, { ...m }, ...points.slice(i + 1)];
  return {
    points: out,
    remap: (r) => {
      if (r.wall < i) return r;
      if (r.wall > i) return { wall: r.wall + 2, offset: r.offset };
      return r.offset >= at - EPS ? { wall: i + 2, offset: r.offset - at } : r;
    },
  };
}

/** Remove corner r, merging the walls on either side of it into one. */
function removeCorner(points: Point[], r: number): ShapeEdit {
  const n = points.length;
  const prevWall = mod(r - 1, n);
  const prevLen = frameOf(points, prevWall).length;
  const newIndex = (v: number) => (v < r ? v : v - 1);
  const merged = newIndex(prevWall);
  return {
    points: points.filter((_, k) => k !== r),
    remap: (ref) => {
      if (ref.wall === prevWall) return { wall: merged, offset: ref.offset };
      if (ref.wall === r) return { wall: merged, offset: ref.offset + prevLen };
      return { wall: newIndex(ref.wall), offset: ref.offset };
    },
  };
}

/** Drop zero-length walls and merge straight runs, so every corner is a real 90° turn. */
export function cleanupRoom(points: Point[]): ShapeEdit {
  let pts = points;
  let remap = identityRemap;
  for (;;) {
    const n = pts.length;
    if (n <= 3) break;
    let removed = false;
    for (let r = 0; r < n; r++) {
      const a = pts[mod(r - 1, n)];
      const b = pts[r];
      const c = pts[mod(r + 1, n)];
      if (Math.abs(cross(sub(b, a), sub(c, b))) < EPS) {
        const e = removeCorner(pts, r);
        pts = e.points;
        remap = composeRemap(remap, e.remap);
        removed = true;
        break;
      }
    }
    if (!removed) break;
  }
  return { points: pts, remap };
}

/** Change the bounding size by scaling x and y separately. Right angles are preserved. */
export function scaleRoom(points: Point[], width: number, depth: number): ShapeEdit {
  const b = boundingBox(points);
  const sx = width / b.w;
  const sy = depth / b.h;
  const out = points.map((p) => ({ x: Math.round((p.x - b.x) * sx), y: Math.round((p.y - b.y) * sy) }));
  return {
    points: out,
    remap: (r) => {
      const f = frameOf(points, r.wall);
      return { wall: r.wall, offset: r.offset * (Math.abs(f.dir.x) > 0.5 ? sx : sy) };
    },
  };
}

/** Shift the outline so its bounding box starts at (0, 0). */
export function normalizeOrigin(points: Point[]): { points: Point[]; shift: Point } {
  const b = boundingBox(points);
  return { points: points.map((p) => roundPoint({ x: p.x - b.x, y: p.y - b.y })), shift: { x: -b.x, y: -b.y } };
}

// ---------------------------------------------------------------------------
// Distances to walls
// ---------------------------------------------------------------------------

export interface WallGap {
  dist: number;
  /** Point on the wall. */
  from: Point;
  /** Matching point on the rect's side. */
  to: Point;
}

/**
 * For each side of `rect`, the nearest wall facing it: the closest wall in that direction
 * whose extent overlaps the rect's.
 */
export function wallDistances(rect: Rect, room: Room): Record<WallSide, WallGap | null> {
  const ws = walls(room).filter((f) => f.length > EPS);
  const vertical = ws.filter((f) => Math.abs(f.dir.x) < 0.5);
  const horizontal = ws.filter((f) => Math.abs(f.dir.y) < 0.5);
  const overlap = (a0: number, a1: number, b0: number, b1: number) => {
    const lo = Math.max(Math.min(a0, a1), b0);
    const hi = Math.min(Math.max(a0, a1), b1);
    return hi - lo > EPS ? (lo + hi) / 2 : null;
  };
  const r = (v: number) => Math.round(v * 100) / 100;

  function pick(cands: WallFrame[], axis: 'x' | 'y', edge: number, dirSign: 1 | -1): WallGap | null {
    let best: WallGap | null = null;
    for (const f of cands) {
      const pos = f.start[axis];
      if (dirSign < 0 ? pos > edge + EPS : pos < edge - EPS) continue;
      const mid =
        axis === 'x'
          ? overlap(f.start.y, f.end.y, rect.y, rect.y + rect.h)
          : overlap(f.start.x, f.end.x, rect.x, rect.x + rect.w);
      if (mid === null) continue;
      const dist = r(Math.abs(edge - pos));
      if (!best || dist < best.dist) {
        best =
          axis === 'x'
            ? { dist, from: { x: pos, y: mid }, to: { x: edge, y: mid } }
            : { dist, from: { x: mid, y: pos }, to: { x: mid, y: edge } };
      }
    }
    return best;
  }

  return {
    left: pick(vertical, 'x', rect.x, -1),
    right: pick(vertical, 'x', rect.x + rect.w, 1),
    top: pick(horizontal, 'y', rect.y, -1),
    bottom: pick(horizontal, 'y', rect.y + rect.h, 1),
  };
}
