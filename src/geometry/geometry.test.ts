import { describe, expect, it } from 'vitest';
import type { DoorOpening, Item, Room, WindowOpening } from '../types';
import {
  areaStats,
  boundingSize,
  clampOpening,
  constrainDrag,
  coveredArea,
  doorArcPath,
  doorGeometry,
  dragOpeningOffset,
  findCollisions,
  findFreeSpot,
  fitInsideRoom,
  fitItemToRoom,
  footprint,
  handlePosition,
  itemCorners,
  itemInsideRoom,
  normalizeRotation,
  rectIntersectsSector,
  resizeFromHandle,
  rotateItem,
  snap,
} from './geometry';
import { convexOverlap, rectPolygon } from './polygon';
import { presetRoom, rectRoom } from './room';

const room: Room = rectRoom(360, 330);
// L-shaped: 360 × 330 with the top-right 162 × 149 corner missing (inner corner at 198, 149).
const lRoom: Room = presetRoom('l', 360, 330);

function item(over: Partial<Item> = {}): Item {
  return {
    id: 'a',
    name: 'Thing',
    width: 100,
    depth: 50,
    color: '#ccc',
    x: 0,
    y: 0,
    rotation: 0,
    locked: false,
    ...over,
  };
}

// The seed layout's door: right wall (index 1), y 250..330, hinged bottom-right, swinging in.
const seedDoor: DoorOpening = { id: 'd', kind: 'door', wall: 1, offset: 250, width: 80, hinge: 'end', swing: 'in' };

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 2);

describe('snap', () => {
  it('rounds to the nearest grid step', () => {
    expect(snap(12, 5)).toBe(10);
    expect(snap(13, 5)).toBe(15);
    expect(snap(-3, 5)).toBe(-5);
    expect(snap(47, 25)).toBe(50);
  });
  it('returns the value unchanged for a non-positive grid', () => {
    expect(snap(12.3, 0)).toBe(12.3);
  });
});

describe('convexOverlap', () => {
  const a = rectPolygon({ x: 0, y: 0, w: 10, h: 10 });
  it('detects shared area', () => {
    expect(convexOverlap(a, rectPolygon({ x: 5, y: 5, w: 10, h: 10 }))).toBe(true);
    expect(convexOverlap(a, rectPolygon({ x: 2, y: 2, w: 2, h: 2 }))).toBe(true);
  });
  it('treats touching edges and corners as not overlapping', () => {
    expect(convexOverlap(a, rectPolygon({ x: 10, y: 0, w: 10, h: 10 }))).toBe(false);
    expect(convexOverlap(a, rectPolygon({ x: 10, y: 10, w: 5, h: 5 }))).toBe(false);
  });
});

describe('rotation and footprint', () => {
  it('normalizes rotations to 45° steps', () => {
    expect(normalizeRotation(44)).toBe(45);
    expect(normalizeRotation(-45)).toBe(315);
    expect(normalizeRotation(405)).toBe(45);
  });

  it('swaps width and depth at 90° and grows the bounding box at 45°', () => {
    expect(footprint(item({ rotation: 90 }))).toEqual({ x: 0, y: 0, w: 50, h: 100 });
    const s = boundingSize(100, 50, 45);
    close(s.w, 150 / Math.SQRT2);
    close(s.h, 150 / Math.SQRT2);
  });

  it('computes rotated corners', () => {
    const c = itemCorners(item({ width: 20, depth: 20, rotation: 45, x: 0, y: 0 }));
    // A 20 cm square at 45° is a diamond 28.28 cm across, centered at (14.14, 14.14).
    close(c[0].x, 14.14);
    close(c[0].y, 0);
    close(c[2].y, 28.28);
  });

  it('rotates 45° around the center', () => {
    const r = rotateItem(item({ x: 100, y: 100 }), room);
    expect(r.rotation).toBe(45);
    const f = footprint(r);
    close(f.x + f.w / 2, 150);
    close(f.y + f.h / 2, 125);
  });

  it('cycles through eight rotations and back', () => {
    let r = item({ x: 100, y: 100 });
    for (let i = 0; i < 8; i++) r = rotateItem(r, room);
    expect(r.rotation).toBe(0);
    close(r.x, 100);
    close(r.y, 100);
  });

  it('rotates counter-clockwise from 0 to 315', () => {
    expect(rotateItem(item({ x: 100, y: 100 }), room, -1).rotation).toBe(315);
  });

  it('keeps a rotated item inside the room', () => {
    const bed = item({ width: 90, depth: 200, x: 0, y: 0 });
    for (const dir of [1, -1] as const) {
      const r = rotateItem(bed, room, dir);
      expect(itemInsideRoom(r, room)).toBe(true);
    }
  });
});

describe('staying inside the room', () => {
  it('accepts items touching the walls', () => {
    expect(itemInsideRoom(item({ x: 0, y: 0 }), room)).toBe(true);
    expect(itemInsideRoom(item({ x: 260, y: 280 }), room)).toBe(true);
    expect(itemInsideRoom(item({ x: 261, y: 0 }), room)).toBe(false);
  });

  it('rejects items in the missing corner of an L-shaped room', () => {
    expect(itemInsideRoom(item({ x: 250, y: 10 }), lRoom)).toBe(false);
    expect(itemInsideRoom(item({ x: 250, y: 160 }), lRoom)).toBe(true);
  });

  it('rejects items that the inner corner of an L pokes into', () => {
    // All four corners are inside the L, but the inner corner (198, 149) cuts into the item.
    expect(itemInsideRoom(item({ x: 150, y: 130, width: 100, depth: 30 }), lRoom)).toBe(false);
  });

  it('moves items to the nearest place that fits', () => {
    const moved = fitInsideRoom(item({ x: 250, y: 10 }), lRoom);
    expect(itemInsideRoom(moved, lRoom)).toBe(true);
    expect(Math.hypot(moved.x - 250, moved.y - 10)).toBeLessThan(150);
  });

  it('shrinks items larger than the room', () => {
    const r = fitItemToRoom(item({ width: 500, depth: 400 }), room);
    expect(r.width).toBe(360);
  });
});

describe('constrainDrag', () => {
  const it0 = item({ x: 50, y: 50 });
  const last = { x: 50, y: 50 };
  it('snaps to the grid', () => {
    expect(constrainDrag(it0, { x: 62, y: 57 }, last, room, 5)).toEqual({ x: 60, y: 55 });
  });
  it('rounds to whole cm without snapping', () => {
    expect(constrainDrag(it0, { x: 62.4, y: 57.6 }, last, room, null)).toEqual({ x: 62, y: 58 });
  });
  it('cannot leave the room', () => {
    expect(constrainDrag(it0, { x: -450, y: 1050 }, last, room, 5)).toEqual({ x: 0, y: 280 });
  });
  it('slides along a wall instead of entering the missing corner of an L', () => {
    const start = item({ x: 50, y: 20 });
    const p = constrainDrag(start, { x: 250, y: 20 }, { x: 50, y: 20 }, lRoom, 5);
    // Can't reach x = 250 at y = 20 (that's outside); it stops against the inner wall at x = 198.
    expect(p.y).toBe(20);
    close(p.x + 100, 198);
  });
});

describe('resizeFromHandle', () => {
  const base = item({ x: 100, y: 100 });

  it('moves the east edge only', () => {
    expect(resizeFromHandle(base, 'e', { x: 223, y: 0 }, room, 5)).toMatchObject({ x: 100, y: 100, width: 125, depth: 50 });
  });

  it('moves the north-west corner and keeps the opposite corner fixed', () => {
    expect(resizeFromHandle(base, 'nw', { x: 80, y: 90 }, room, 5)).toMatchObject({ x: 80, y: 90, width: 120, depth: 60 });
  });

  it('stops growing at the walls and keeps a minimum size', () => {
    expect(resizeFromHandle(base, 'se', { x: 999, y: 999 }, room, null)).toMatchObject({ width: 260, depth: 230 });
    expect(resizeFromHandle(base, 'w', { x: 500, y: 0 }, room, null)).toMatchObject({ x: 195, width: 5 });
  });

  it('resizes along the item’s own axes when rotated', () => {
    const rotated = item({ x: 100, y: 100, rotation: 90 }); // local width now runs down the screen
    const p = handlePosition(rotated, 'e');
    close(p.x, 125);
    close(p.y, 200);
    const r = resizeFromHandle(rotated, 'e', { x: 125, y: 220 }, room, 5);
    expect(r).toMatchObject({ width: 120, depth: 50, x: 100, y: 100 });
  });
});

describe('openings', () => {
  it('clamps openings to their wall', () => {
    const w: WindowOpening = { id: 'w', kind: 'window', wall: 0, offset: 320, width: 90 };
    expect(clampOpening(w, room).offset).toBe(270);
  });

  it('drags openings along their wall only', () => {
    const w: WindowOpening = { id: 'w', kind: 'window', wall: 3, offset: 100, width: 90 };
    // Wall 3 (left) runs bottom to top, so moving up increases the offset.
    expect(dragOpeningOffset(w, 100, { x: 50, y: -22 }, room, 5)).toBe(120);
    expect(dragOpeningOffset(w, 100, { x: 0, y: -500 }, room, 5)).toBe(240);
  });

  it('computes the seed door geometry', () => {
    const g = doorGeometry(seedDoor, room);
    expect(g.hinge).toEqual({ x: 360, y: 330 });
    expect(g.closedEnd).toEqual({ x: 360, y: 250 });
    expect(g.openEnd).toEqual({ x: 280, y: 330 });
    expect(doorArcPath(g)).toBe('M 360 250 A 80 80 0 0 0 280 330');
  });

  it('flips the swing area for outward doors', () => {
    expect(doorGeometry({ ...seedDoor, swing: 'out' }, room).openEnd).toEqual({ x: 440, y: 330 });
  });
});

describe('door swing intersection', () => {
  const s = doorGeometry(seedDoor, room).sector;

  it('detects a rect inside the swing', () => {
    expect(rectIntersectsSector({ x: 320, y: 300, w: 20, h: 20 }, s)).toBe(true);
  });
  it('ignores a rect in the square corner outside the arc', () => {
    expect(rectIntersectsSector({ x: 280, y: 250, w: 10, h: 10 }, s)).toBe(false);
  });
  it('ignores rects touching the sector edge only', () => {
    expect(rectIntersectsSector({ x: 200, y: 250, w: 80, h: 80 }, s)).toBe(false);
  });
  it('ignores rects outside the swing quadrant', () => {
    expect(rectIntersectsSector({ x: 300, y: 100, w: 60, h: 120 }, s)).toBe(false);
  });
  it('detects a big rect covering the hinge', () => {
    expect(rectIntersectsSector({ x: 250, y: 200, w: 110, h: 130 }, s)).toBe(true);
  });
});

describe('findCollisions', () => {
  it('flags overlapping items but not touching ones', () => {
    const a = item({ id: 'a', x: 0, y: 0 });
    const b = item({ id: 'b', x: 100, y: 0 });
    const c = item({ id: 'c', x: 150, y: 20 });
    expect([...findCollisions([a, b, c], [], room)].sort()).toEqual(['b', 'c']);
  });

  it('uses the real outline of 45° items, not their bounding box', () => {
    // A 40 cm square at 45° spans 56.6 cm; its bounding-box corner is empty.
    const diamond = item({ id: 'd', width: 40, depth: 40, rotation: 45, x: 100, y: 100 });
    const corner = item({ id: 'c', width: 10, depth: 10, x: 100, y: 100 });
    expect(findCollisions([diamond, corner], [], room).size).toBe(0);
    const center = item({ id: 'm', width: 10, depth: 10, x: 123, y: 123 });
    expect(findCollisions([diamond, center], [], room).size).toBe(2);
  });

  it('flags items in a door swing', () => {
    const a = item({ id: 'a', x: 260, y: 280, width: 50, depth: 50 });
    expect(findCollisions([a], [seedDoor], room).has('a')).toBe(true);
  });

  it('ignores floor-level items', () => {
    const rug = item({ id: 'rug', width: 160, depth: 230, floorLevel: true });
    const bed = item({ id: 'bed', x: 10, y: 10 });
    expect(findCollisions([rug, bed], [seedDoor], room).size).toBe(0);
  });
});

describe('findFreeSpot', () => {
  it('returns the first free position', () => {
    expect(findFreeSpot(50, 50, room, [rectPolygon({ x: 0, y: 0, w: 100, h: 100 })], [])).toEqual({ x: 100, y: 0 });
  });

  it('only uses space inside the room', () => {
    // In the L, the top row is only 198 wide; a 150-wide item still fits there at x = 0.
    expect(findFreeSpot(150, 50, lRoom, [rectPolygon({ x: 0, y: 0, w: 60, h: 60 })], [])).toEqual({ x: 0, y: 60 });
  });

  it('avoids door swings', () => {
    const s = doorGeometry(seedDoor, room).sector;
    const p = findFreeSpot(60, 60, room, [rectPolygon({ x: 0, y: 0, w: 360, h: 250 })], [s]);
    expect(rectIntersectsSector({ ...p, w: 60, h: 60 }, s)).toBe(false);
  });
});

describe('area stats', () => {
  it('counts overlapping areas once', () => {
    expect(coveredArea(room, [rectPolygon({ x: 0, y: 0, w: 10, h: 10 }), rectPolygon({ x: 5, y: 5, w: 10, h: 10 })])).toBe(175);
  });

  it('computes total, covered and free floor area', () => {
    const stats = areaStats(room, [
      item({ id: 'a', width: 100, depth: 100 }),
      item({ id: 'rug', width: 100, depth: 100, floorLevel: true }),
    ]);
    expect(stats).toEqual({ total: 118800, covered: 10000, free: 108800 });
  });

  it('measures L-shaped rooms and 45° items', () => {
    expect(areaStats(lRoom, []).total).toBe(118800 - 162 * 149);
    const diamond = item({ width: 40, depth: 40, rotation: 45, x: 100, y: 100 });
    expect(Math.abs(areaStats(room, [diamond]).covered - 1600)).toBeLessThan(20);
  });
});
