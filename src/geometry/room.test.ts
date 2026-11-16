import { describe, expect, it } from 'vitest';
import type { Point } from '../types';
import {
  cleanupRoom,
  isValidRoom,
  moveCorner,
  moveWall,
  presetRoom,
  rectRoom,
  scaleRoom,
  splitWall,
  wallDistances,
  wallFrame,
  walls,
  wallSide,
} from './room';
import { signedArea } from './polygon';

const rect = rectRoom(360, 330);
const pts = (...xy: number[][]): Point[] => xy.map(([x, y]) => ({ x, y }));

describe('walls', () => {
  it('describes each wall of a rectangle, clockwise from the top', () => {
    expect(wallFrame(1, rect)).toMatchObject({ start: { x: 360, y: 0 }, dir: { x: 0, y: 1 }, inward: { x: -1, y: 0 }, length: 330 });
    expect(walls(rect).map(wallSide)).toEqual(['top', 'right', 'bottom', 'left']);
  });

  it('builds valid clockwise presets', () => {
    for (const shape of ['rectangle', 'l', 'u', 't'] as const) {
      const r = presetRoom(shape, 400, 300);
      expect(isValidRoom(r.points)).toBe(true);
      expect(signedArea(r.points)).toBeGreaterThan(0);
    }
    expect(presetRoom('l', 400, 300).points).toHaveLength(6);
    expect(presetRoom('u', 400, 300).points).toHaveLength(8);
  });
});

describe('isValidRoom', () => {
  it('rejects diagonal walls, self-intersections and counter-clockwise outlines', () => {
    expect(isValidRoom(pts([0, 0], [100, 0], [50, 100]))).toBe(false);
    expect(isValidRoom([...rect.points].reverse())).toBe(false);
    // A "bow tie" of right angles whose walls cross.
    expect(isValidRoom(pts([0, 0], [100, 0], [100, 50], [-20, 50], [-20, 100], [50, 100], [50, -20], [0, -20]))).toBe(false);
  });
});

describe('editing the outline', () => {
  it('moves a wall and stretches its neighbours', () => {
    const e = moveWall(rect.points, 1, -40); // right wall 40 cm outward
    expect(e.points).toEqual(pts([0, 0], [400, 0], [400, 330], [0, 330]));
  });

  it('keeps openings on the following wall in place', () => {
    // Moving the top wall (0) up by 20 makes wall 1 start 20 cm higher.
    const e = moveWall(rect.points, 0, -20);
    expect(e.remap({ wall: 1, offset: 250 })).toEqual({ wall: 1, offset: 270 });
    expect(e.remap({ wall: 0, offset: 100 })).toEqual({ wall: 0, offset: 100 });
  });

  it('moves a corner by sliding both walls', () => {
    const e = moveCorner(rect.points, 2, { x: 300, y: 300 });
    expect(e.points).toEqual(pts([0, 0], [300, 0], [300, 300], [0, 300]));
  });

  it('splits a wall into an alcove that can be dragged out', () => {
    const s = splitWall(rect.points, 0, 200);
    expect(s.points).toHaveLength(6);
    expect(s.remap({ wall: 0, offset: 250 })).toEqual({ wall: 2, offset: 50 });
    expect(s.remap({ wall: 1, offset: 10 })).toEqual({ wall: 3, offset: 10 });
    // Push the right half of the top wall 60 cm down: an L-shaped room.
    const m = moveWall(s.points, 2, 60);
    const c = cleanupRoom(m.points);
    expect(isValidRoom(c.points)).toBe(true);
    expect(c.points).toEqual(pts([0, 0], [200, 0], [200, 60], [360, 60], [360, 330], [0, 330]));
  });

  it('merges straight runs and zero-length walls back together', () => {
    const s = splitWall(rect.points, 0, 200);
    const c = cleanupRoom(s.points);
    expect(c.points).toEqual(rect.points);
    expect(c.remap({ wall: 2, offset: 50 })).toEqual({ wall: 0, offset: 250 });
    expect(c.remap({ wall: 3, offset: 10 })).toEqual({ wall: 1, offset: 10 });
  });

  it('scales an L-shape to a new overall size', () => {
    const l = presetRoom('l', 400, 300);
    const e = scaleRoom(l.points, 200, 600);
    expect(Math.max(...e.points.map((p) => p.x))).toBe(200);
    expect(Math.max(...e.points.map((p) => p.y))).toBe(600);
    expect(isValidRoom(e.points)).toBe(true);
  });
});

describe('wallDistances', () => {
  it('measures to each wall of a rectangle', () => {
    const d = wallDistances({ x: 10, y: 20, w: 100, h: 50 }, rect);
    expect([d.left?.dist, d.top?.dist, d.right?.dist, d.bottom?.dist]).toEqual([10, 20, 250, 260]);
  });

  it('finds the nearer inner wall of an L-shaped room', () => {
    const l = presetRoom('l', 360, 330); // inner corner at (198, 149)
    const d = wallDistances({ x: 100, y: 20, w: 50, h: 50 }, l);
    expect(d.right?.dist).toBe(48); // the inner vertical wall at x = 198
    const below = wallDistances({ x: 250, y: 200, w: 50, h: 50 }, l);
    expect(below.top?.dist).toBe(51); // the inner horizontal wall at y = 149
  });
});
