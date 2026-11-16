/** Room shape edits applied to a whole layout: openings follow their walls, furniture stays inside. */
import type { Layout, Opening, Point, Room } from '../types';
import {
  cleanupRoom,
  composeRemap,
  isValidRoom,
  moveCorner,
  moveWall,
  moveWallBy,
  normalizeOrigin,
  presetRoom,
  roomBounds,
  scaleRoom,
  splitWall,
  wallFrame,
  walls,
  type RoomShape,
  type ShapeEdit,
} from '../geometry/room';
import { clamp, clampOpening, fitItemToRoom, round2 } from '../geometry/geometry';
import { add, distanceToSegment, dot, EPS, scale, sub } from '../geometry/polygon';

export type RoomEdit =
  | { type: 'setRoomSize'; width: number; depth: number }
  | { type: 'setRoomShape'; shape: RoomShape }
  | { type: 'moveWall'; index: number; delta: number }
  | { type: 'moveCorner'; index: number; point: Point }
  | { type: 'setWallLength'; index: number; length: number }
  | { type: 'splitWall'; index: number };

/**
 * Apply a room edit. Returns null when the result isn't a valid room (e.g. walls crossing).
 * With `normalize`, the outline is shifted so its bounding box starts at (0, 0) and furniture
 * moves with it; previews skip that so the dragged wall stays under the pointer.
 */
export function editRoom(layout: Layout, edit: RoomEdit, normalize = true): Layout | null {
  const pts = layout.room.points;
  switch (edit.type) {
    case 'setRoomShape': {
      const b = roomBounds(layout.room);
      const next = presetRoom(edit.shape, b.w, b.h);
      return withRoom(layout, next, reanchorOpenings(layout.openings, layout.room, next), { x: 0, y: 0 });
    }
    case 'setRoomSize': {
      const w = Math.max(50, Math.round(edit.width));
      const d = Math.max(50, Math.round(edit.depth));
      return applyShape(layout, scaleRoom(pts, w, d), normalize);
    }
    case 'moveWall':
      return applyShape(layout, moveWall(pts, edit.index, edit.delta), normalize);
    case 'moveCorner':
      return applyShape(layout, moveCorner(pts, edit.index, edit.point), normalize);
    case 'setWallLength': {
      const f = wallFrame(edit.index, layout.room);
      const delta = Math.max(1, edit.length) - f.length;
      // Lengthening wall i means pushing the next wall (perpendicular to it) further along.
      return applyShape(layout, moveWallBy(pts, edit.index + 1, scale(f.dir, delta)), normalize);
    }
    case 'splitWall': {
      const f = wallFrame(edit.index, layout.room);
      if (f.length < 2) return null;
      const at = splitPoint(layout.openings, edit.index, f.length);
      const e = splitWall(pts, edit.index, at);
      // Keep the zero-length jog (no cleanup) so the user can drag one half out.
      return remapLayout(layout, e.points, e.remap, { x: 0, y: 0 });
    }
  }
}

function applyShape(layout: Layout, edit: ShapeEdit, normalize: boolean): Layout | null {
  const clean = cleanupRoom(edit.points);
  if (!isValidRoom(clean.points)) return null;
  const remap = composeRemap(edit.remap, clean.remap);
  if (!normalize) return remapLayout(layout, clean.points, remap, { x: 0, y: 0 });
  const { points, shift } = normalizeOrigin(clean.points);
  return remapLayout(layout, points, remap, shift);
}

function remapLayout(
  layout: Layout,
  points: Point[],
  remap: ShapeEdit['remap'],
  shift: Point,
): Layout {
  const room: Room = { points };
  const openings = layout.openings.flatMap((o) => {
    const m = remap({ wall: o.wall, offset: o.offset });
    return m ? [clampOpening({ ...o, ...m }, room)] : [];
  });
  return withRoom(layout, room, openings, shift);
}

function withRoom(layout: Layout, room: Room, openings: Opening[], shift: Point): Layout {
  const items = layout.items.map((i) =>
    fitItemToRoom({ ...i, x: round2(i.x + shift.x), y: round2(i.y + shift.y) }, room),
  );
  return { ...layout, room, openings, items };
}

/** Midpoint of the wall, nudged so it doesn't cut through a door or window. */
function splitPoint(openings: Opening[], wall: number, len: number): number {
  let at = Math.round(len / 2);
  for (const o of openings) {
    if (o.wall !== wall || at <= o.offset + EPS || at >= o.offset + o.width - EPS) continue;
    at = o.offset + o.width < len - 1 ? o.offset + o.width : o.offset;
  }
  return clamp(at, 1, len - 1);
}

/** Move each opening to the wall of `next` nearest to where it was in `prev`. */
export function reanchorOpenings(openings: Opening[], prev: Room, next: Room): Opening[] {
  const ws = walls(next);
  return openings.map((o) => {
    const f = wallFrame(o.wall, prev);
    const center = add(f.start, scale(f.dir, o.offset + o.width / 2));
    let best = 0;
    let bestD = Infinity;
    ws.forEach((w, i) => {
      if (w.length + EPS < Math.min(o.width, 10)) return;
      const d = distanceToSegment(center, w.start, w.end) + (w.length < o.width ? 1000 : 0);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    const w = ws[best];
    return clampOpening({ ...o, wall: best, offset: dot(sub(center, w.start), w.dir) - o.width / 2 }, next);
  });
}
