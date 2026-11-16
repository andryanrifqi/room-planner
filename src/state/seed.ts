import type { Item, Layout, Rotation } from '../types';
import { presetByKey } from './presets';
import { uid } from './uid';
import { rectRoom } from '../geometry/room';

function fromPreset(key: string, x: number, y: number, rotation: Rotation = 0, name?: string): Item {
  const p = presetByKey(key);
  return {
    id: uid(),
    name: name ?? p.name,
    width: p.width,
    depth: p.depth,
    height: p.height,
    color: p.color,
    floorLevel: p.floorLevel,
    x,
    y,
    rotation,
    locked: false,
  };
}

/** The layout loaded on first run. Rotations put each item's back against its wall. */
export function seedLayout(): Layout {
  return {
    id: uid(),
    name: 'My bedroom',
    room: rectRoom(360, 330),
    // Wall 0 is the top wall, wall 1 the right wall (running top to bottom).
    openings: [
      { id: uid(), kind: 'window', wall: 0, offset: 265, width: 90 },
      { id: uid(), kind: 'door', wall: 1, offset: 250, width: 80, hinge: 'end', swing: 'in' },
    ],
    items: [
      fromPreset('queen-bed', 45, 0),
      fromPreset('bedside', 0, 0),
      fromPreset('bedside', 215, 0, 0, 'Bedside table 2'),
      fromPreset('wardrobe-2', 300, 90, 90),
      fromPreset('desk', 140, 280, 180),
      fromPreset('desk-chair', 167, 228),
      fromPreset('dresser', 10, 290, 180),
    ],
  };
}

export function emptyLayout(name: string): Layout {
  return { id: uid(), name, room: rectRoom(360, 330), openings: [], items: [] };
}
