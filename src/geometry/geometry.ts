/**
 * Pure geometry for furniture and openings. All units are centimeters; the room's bounding box
 * starts at (0, 0), x grows to the right and y grows downward (SVG convention).
 */
import type { DoorOpening, Item, Opening, Point, Rect, Room } from '../types';
import {
  add,
  boundingBox,
  clipPolygonToRect,
  clipSegmentToConvex,
  convexOverlap,
  distanceToPolygon,
  dot,
  EPS,
  length,
  pointInPolygon,
  pointOnBoundary,
  rectPolygon,
  scale,
  signedArea,
  strictlyInsideConvex,
  sub,
} from './polygon';
import { roomArea, roomBounds, wallFrame, wallLength } from './room';

export { EPS };
export const MIN_ITEM_SIZE = 5;
export const ROTATION_STEP = 45;

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function clamp(v: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, v));
}

export function snap(v: number, grid: number): number {
  if (!(grid > 0)) return v;
  return round2(Math.round(v / grid) * grid);
}

/** Snap to the grid when snapping is on, otherwise round to whole centimeters. */
export function quantize(v: number, grid: number | null): number {
  return grid ? snap(v, grid) : Math.round(v);
}

// ---------------------------------------------------------------------------
// Item shape: an oriented rectangle. x, y is the top-left of its bounding box.
// ---------------------------------------------------------------------------

/** Round to a multiple of 45° in [0, 360). */
export function normalizeRotation(deg: number): number {
  const s = Math.round(deg / ROTATION_STEP) * ROTATION_STEP;
  return ((s % 360) + 360) % 360;
}

const cleanTrig = (v: number) => (Math.abs(v) < 1e-12 ? 0 : Math.round(v * 1e12) / 1e12);

/** Unit vectors of the item's local axes: u along its width, v along its depth (toward the front). */
export function itemAxes(rotation: number): { u: Point; v: Point } {
  const a = (rotation * Math.PI) / 180;
  const c = cleanTrig(Math.cos(a));
  const s = cleanTrig(Math.sin(a));
  return { u: { x: c, y: s }, v: { x: -s, y: c } };
}

/** Size of the bounding box of a width × depth rectangle rotated by `rotation`. */
export function boundingSize(width: number, depth: number, rotation: number): { w: number; h: number } {
  const { u } = itemAxes(rotation);
  const c = Math.abs(u.x);
  const s = Math.abs(u.y);
  return { w: width * c + depth * s, h: width * s + depth * c };
}

/** Axis-aligned bounding box of the rotated item. */
export function footprint(item: Pick<Item, 'x' | 'y' | 'width' | 'depth' | 'rotation'>): Rect {
  const { w, h } = boundingSize(item.width, item.depth, item.rotation);
  return { x: item.x, y: item.y, w, h };
}

export function rectCenter(r: Rect): Point {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export function itemCenter(item: Item): Point {
  return rectCenter(footprint(item));
}

/** Place the item so its center is at `c`. */
export function withCenter<T extends Item>(item: T, c: Point): T {
  const { w, h } = boundingSize(item.width, item.depth, item.rotation);
  return { ...item, x: round2(c.x - w / 2), y: round2(c.y - h / 2) };
}

/** Corners of the rotated item: back-left, back-right, front-right, front-left. */
export function itemCorners(item: Item): Point[] {
  const c = itemCenter(item);
  const { u, v } = itemAxes(item.rotation);
  const hw = item.width / 2;
  const hd = item.depth / 2;
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(([a, b]) => add(c, add(scale(u, a), scale(v, b))));
}

// ---------------------------------------------------------------------------
// Staying inside the room
// ---------------------------------------------------------------------------

const BOUNDARY_TOLERANCE = 1e-3;

/** True when a convex polygon lies entirely inside the room (touching walls is fine). */
export function polygonInsideRoom(poly: Point[], room: Room): boolean {
  const outline = room.points;
  const inside = (p: Point) => pointOnBoundary(p, outline, BOUNDARY_TOLERANCE) || pointInPolygon(p, outline);
  if (!poly.every(inside)) return false;
  // A wall may still cut through the item (e.g. the inner corner of an L-shaped room).
  for (let i = 0; i < outline.length; i++) {
    const seg = clipSegmentToConvex(outline[i], outline[(i + 1) % outline.length], poly);
    if (!seg || length(sub(seg[1], seg[0])) < BOUNDARY_TOLERANCE) continue;
    const mid = scale(add(seg[0], seg[1]), 0.5);
    if (strictlyInsideConvex(mid, poly, BOUNDARY_TOLERANCE)) return false;
  }
  return true;
}

export function itemInsideRoom(item: Item, room: Room): boolean {
  return polygonInsideRoom(itemCorners(item), room);
}

function clampToBounds(item: Item, room: Room): Point {
  const b = roomBounds(room);
  const f = footprint(item);
  return { x: round2(clamp(f.x, b.x, b.x + b.w - f.w)), y: round2(clamp(f.y, b.y, b.y + b.h - f.h)) };
}

/**
 * Return the item moved to the nearest position (searching outward in `step` cm rings) where
 * it fits inside the room. Items that fit nowhere stay clamped to the room's bounding box.
 */
export function fitInsideRoom<T extends Item>(item: T, room: Room, step = 5): T {
  if (itemInsideRoom(item, room)) return item;
  const base = clampToBounds(item, room);
  const at = (x: number, y: number): T => ({ ...item, x: round2(x), y: round2(y) });
  const start = at(base.x, base.y);
  if (itemInsideRoom(start, room)) return start;
  const b = roomBounds(room);
  const maxR = Math.max(b.w, b.h);
  for (let r = step; r <= maxR; r += step) {
    let best: T | null = null;
    let bestD = Infinity;
    const consider = (dx: number, dy: number) => {
      const d = Math.hypot(dx, dy);
      if (d >= bestD) return;
      const c = at(base.x + dx, base.y + dy);
      if (itemInsideRoom(c, room)) {
        best = c;
        bestD = d;
      }
    };
    for (let d = -r; d <= r; d += step) {
      consider(d, -r);
      consider(d, r);
      consider(-r, d);
      consider(r, d);
    }
    if (best) return best;
  }
  return start;
}

/** Limit an item's size to the room's bounding box, then move it inside the room. */
export function fitItemToRoom<T extends Item>(item: T, room: Room): T {
  const b = roomBounds(room);
  const max = Math.max(b.w, b.h);
  const sized = {
    ...item,
    rotation: normalizeRotation(item.rotation),
    width: clamp(item.width, MIN_ITEM_SIZE, max),
    depth: clamp(item.depth, MIN_ITEM_SIZE, max),
  };
  return fitInsideRoom(sized, room);
}

/** Rotate by 45° clockwise (dir = 1) or counter-clockwise (dir = -1) around the item's center. */
export function rotateItem<T extends Item>(item: T, room: Room, dir: 1 | -1 = 1): T {
  const rotated = withCenter({ ...item, rotation: normalizeRotation(item.rotation + dir * ROTATION_STEP) }, itemCenter(item));
  return fitInsideRoom(rotated, room);
}

/** Largest t in [0, 1] for which ok(t) holds, assuming ok(0) does (binary search). */
function furthestValid(ok: (t: number) => boolean): number {
  if (ok(1)) return 1;
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 20; k++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Where a dragged item ends up: `desired` (top-left) snapped, kept inside the room. When the
 * target is blocked by a wall the item slides along it, or stops as close as it can get.
 * `last` is the item's previous valid position.
 */
export function constrainDrag(item: Item, desired: Point, last: Point, room: Room, grid: number | null): Point {
  const at = (p: Point) => ({ ...item, x: p.x, y: p.y });
  const bound = (p: Point) => clampToBounds(at(p), room);
  const target = bound({ x: quantize(desired.x, grid), y: quantize(desired.y, grid) });
  const ok = (p: Point) => itemInsideRoom(at(p), room);
  if (!ok(last) || ok(target)) return target; // (an item already out of bounds isn't trapped)

  /** Furthest valid point on the straight line from `from` (valid) toward `to`. */
  const toward = (from: Point, to: Point): Point => {
    const lerp = (t: number) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
    const p = lerp(furthestValid((t) => ok(lerp(t))));
    const rounded = { x: roundToward(p.x, from.x), y: roundToward(p.y, from.y) };
    return ok(rounded) ? rounded : from;
  };
  // Move up to the wall along one axis, then slide along it on the other; try both orders.
  const xFirst = toward(toward(last, { x: target.x, y: last.y }), target);
  const yFirst = toward(toward(last, { x: last.x, y: target.y }), target);
  const dist = (p: Point) => Math.hypot(p.x - target.x, p.y - target.y);
  return dist(xFirst) <= dist(yFirst) ? xFirst : yFirst;
}

/** Round to 0.01 in the direction of `from`, so a just-valid position stays valid. */
function roundToward(v: number, from: number): number {
  return v > from ? Math.floor(v * 100) / 100 : Math.ceil(v * 100) / 100;
}

// ---------------------------------------------------------------------------
// Resizing with handles in the item's own (rotated) frame
// ---------------------------------------------------------------------------

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** [x, y] sign of each handle in the item's local frame; n is the item's back edge. */
const HANDLE_SIGNS: Record<Handle, [number, number]> = {
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
};

export function handlePosition(item: Item, h: Handle): Point {
  const [sx, sy] = HANDLE_SIGNS[h];
  const { u, v } = itemAxes(item.rotation);
  return add(itemCenter(item), add(scale(u, (sx * item.width) / 2), scale(v, (sy * item.depth) / 2)));
}

/** Screen direction (degrees, 0 = right, 90 = down) a handle points away from the item. */
export function handleAngle(item: Item, h: Handle): number {
  const [sx, sy] = HANDLE_SIGNS[h];
  const { u, v } = itemAxes(item.rotation);
  const d = add(scale(u, sx), scale(v, sy));
  return (Math.atan2(d.y, d.x) * 180) / Math.PI;
}

/**
 * Resize by dragging a handle to `point`. The edges the handle controls follow the pointer
 * (snapped); the opposite edges stay fixed. If the new size would poke through a wall, the
 * item grows only as far as it fits.
 */
export function resizeFromHandle<T extends Item>(item: T, handle: Handle, point: Point, room: Room, grid: number | null): T {
  const [sx, sy] = HANDLE_SIGNS[handle];
  const { u, v } = itemAxes(item.rotation);
  const anchor = add(itemCenter(item), add(scale(u, (-sx * item.width) / 2), scale(v, (-sy * item.depth) / 2)));
  const rel = sub(point, anchor);
  const targetW = sx ? Math.max(MIN_ITEM_SIZE, quantize(sx * dot(rel, u), grid)) : item.width;
  const targetD = sy ? Math.max(MIN_ITEM_SIZE, quantize(sy * dot(rel, v), grid)) : item.depth;
  const make = (w: number, d: number): T =>
    withCenter({ ...item, width: round2(w), depth: round2(d) }, add(anchor, add(scale(u, (sx * w) / 2), scale(v, (sy * d) / 2))));

  const full = make(targetW, targetD);
  const fits = (w: number, d: number) => itemInsideRoom(make(w, d), room);
  if (itemInsideRoom(full, room) || !itemInsideRoom(item, room)) return full;
  // Grow each dimension separately as far as it fits (shrinking always fits), whole cm only.
  const grow = (from: number, to: number, fitsAt: (v: number) => boolean) => {
    const v = from + (to - from) * furthestValid((t) => fitsAt(from + (to - from) * t));
    return to > from ? Math.floor(v) : Math.ceil(v);
  };
  const w = grow(item.width, targetW, (v) => fits(v, item.depth));
  const d = grow(item.depth, targetD, (v) => fits(w, v));
  return fits(w, d) ? make(w, d) : item;
}

// ---------------------------------------------------------------------------
// Openings
// ---------------------------------------------------------------------------

/** Keep an opening's wall index, width and offset valid for the room. */
export function clampOpening<T extends Opening>(o: T, room: Room): T {
  const n = room.points.length;
  const wall = clamp(Math.round(o.wall), 0, n - 1);
  const len = wallLength(wall, room);
  const width = clamp(o.width, Math.min(10, len), len);
  return { ...o, wall, width, offset: clamp(o.offset, 0, len - width) };
}

/** End points of an opening along its wall. */
export function openingEndpoints(o: Opening, room: Room): { a: Point; b: Point } {
  const f = wallFrame(o.wall, room);
  return { a: add(f.start, scale(f.dir, o.offset)), b: add(f.start, scale(f.dir, o.offset + o.width)) };
}

/** Offset along a wall for an opening dragged by `delta` from `startOffset`. */
export function dragOpeningOffset(o: Opening, startOffset: number, delta: Point, room: Room, grid: number | null): number {
  const f = wallFrame(o.wall, room);
  return clamp(quantize(startOffset + dot(delta, f.dir), grid), 0, f.length - o.width);
}

/**
 * A door's swing area: a quarter disc centered on the hinge, bounded by the closed-door
 * direction `u` (along the wall toward the latch side) and the open-door direction `v`.
 */
export interface Sector {
  center: Point;
  radius: number;
  u: Point;
  v: Point;
}

export interface DoorGeometry {
  hinge: Point;
  /** Latch-side end of the opening (closed leaf tip). */
  closedEnd: Point;
  /** Tip of the leaf when opened 90°. */
  openEnd: Point;
  sector: Sector;
}

export function doorGeometry(door: DoorOpening, room: Room): DoorGeometry {
  const f = wallFrame(door.wall, room);
  const { a, b } = openingEndpoints(door, room);
  const hinge = door.hinge === 'start' ? a : b;
  const closedEnd = door.hinge === 'start' ? b : a;
  const u = scale(sub(closedEnd, hinge), 1 / door.width);
  const v = door.swing === 'in' ? f.inward : scale(f.inward, -1);
  return {
    hinge,
    closedEnd,
    openEnd: add(hinge, scale(v, door.width)),
    sector: { center: hinge, radius: door.width, u, v },
  };
}

export function doorSwingSector(door: DoorOpening, room: Room): Sector {
  return doorGeometry(door, room).sector;
}

/** SVG path for the swing arc from the closed tip to the open tip. */
export function doorArcPath(g: DoorGeometry): string {
  const { u, v, radius } = g.sector;
  // In y-down coordinates a positive cross product is a clockwise turn, which is SVG sweep-flag 1.
  const sweep = u.x * v.y - u.y * v.x > 0 ? 1 : 0;
  return `M ${g.closedEnd.x} ${g.closedEnd.y} A ${radius} ${radius} 0 0 ${sweep} ${g.openEnd.x} ${g.openEnd.y}`;
}

/** True when a convex polygon shares interior area with a door's (axis-aligned) swing sector. */
export function polygonIntersectsSector(poly: Point[], s: Sector): boolean {
  // The sector lies inside the square spanned by center, center + u*r and center + v*r.
  const corner = add(add(s.center, scale(s.u, s.radius)), scale(s.v, s.radius));
  const box = boundingBox([s.center, corner]);
  const clipped = clipPolygonToRect(poly, box);
  if (clipped.length < 3 || Math.abs(signedArea(clipped)) <= EPS) return false;
  // Within the quadrant, the disc is hit iff the clipped part comes closer than the radius.
  return distanceToPolygon(s.center, clipped) < s.radius - EPS;
}

export function rectIntersectsSector(rect: Rect, s: Sector): boolean {
  return polygonIntersectsSector(rectPolygon(rect), s);
}

// ---------------------------------------------------------------------------
// Collisions, placement, stats
// ---------------------------------------------------------------------------

function doorSectors(openings: Opening[], room: Room): Sector[] {
  return openings.filter((o): o is DoorOpening => o.kind === 'door').map((d) => doorSwingSector(d, room));
}

/** Ids of items that overlap another (non floor-level) item or a door's swing area. */
export function findCollisions(items: Item[], openings: Opening[], room: Room): Set<string> {
  const hits = new Set<string>();
  const solid = items.filter((i) => !i.floorLevel);
  const polys = solid.map(itemCorners);
  const sectors = doorSectors(openings, room);
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      if (convexOverlap(polys[i], polys[j])) {
        hits.add(solid[i].id);
        hits.add(solid[j].id);
      }
    }
    if (sectors.some((s) => polygonIntersectsSector(polys[i], s))) hits.add(solid[i].id);
  }
  return hits;
}

/**
 * First position (scanning rows top to bottom, left to right) where an unrotated w×d item fits
 * inside the room without overlapping obstacles or door swings. Falls back to the room center.
 */
export function findFreeSpot(
  w: number,
  d: number,
  room: Room,
  obstacles: Point[][],
  sectors: Sector[],
  step = 5,
): Point {
  const b = roomBounds(room);
  for (let y = b.y; y <= b.y + b.h - d + EPS; y += step) {
    for (let x = b.x; x <= b.x + b.w - w + EPS; x += step) {
      const poly = rectPolygon({ x, y, w, h: d });
      if (
        polygonInsideRoom(poly, room) &&
        !obstacles.some((o) => convexOverlap(o, poly)) &&
        !sectors.some((s) => polygonIntersectsSector(poly, s))
      ) {
        return { x, y };
      }
    }
  }
  return { x: round2(b.x + Math.max(0, (b.w - w) / 2)), y: round2(b.y + Math.max(0, (b.h - d) / 2)) };
}

export function freeSpotFor(w: number, d: number, items: Item[], openings: Opening[], room: Room, step = 5): Point {
  const obstacles = items.filter((i) => !i.floorLevel).map(itemCorners);
  return findFreeSpot(w, d, room, obstacles, doorSectors(openings, room), step);
}

/**
 * Floor area covered by the union of convex polygons, clipped to the room. Sampled on a grid
 * (1 cm for normal rooms), which is exact for items on whole-centimeter positions.
 */
export function coveredArea(room: Room, polys: Point[][]): number {
  if (polys.length === 0) return 0;
  const b = roomBounds(room);
  const step = Math.max(1, Math.ceil(Math.sqrt((b.w * b.h) / 250_000)));
  const boxes = polys.map(boundingBox);
  let count = 0;
  for (let y = b.y + step / 2; y < b.y + b.h; y += step) {
    for (let x = b.x + step / 2; x < b.x + b.w; x += step) {
      const p = { x, y };
      let hit = false;
      for (let k = 0; k < polys.length && !hit; k++) {
        const bb = boxes[k];
        if (x < bb.x || x > bb.x + bb.w || y < bb.y || y > bb.y + bb.h) continue;
        hit = pointInPolygon(p, polys[k]);
      }
      if (hit && pointInPolygon(p, room.points)) count++;
    }
  }
  return count * step * step;
}

export interface AreaStats {
  /** All values in cm². */
  total: number;
  covered: number;
  free: number;
}

export function areaStats(room: Room, items: Item[]): AreaStats {
  const total = round2(roomArea(room));
  const covered = coveredArea(
    room,
    items.filter((i) => !i.floorLevel).map(itemCorners),
  );
  return { total, covered, free: round2(total - covered) };
}
