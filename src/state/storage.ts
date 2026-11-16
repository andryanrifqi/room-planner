import type { Item, Layout, Opening, Point, Room, Settings } from '../types';
import { clampOpening, fitItemToRoom, normalizeRotation, round2 } from '../geometry/geometry';
import { signedArea } from '../geometry/polygon';
import { cleanupRoom, identityRemap, isValidRoom, normalizeOrigin, rectRoom, type Remap } from '../geometry/room';
import { seedLayout } from './seed';
import { uid } from './uid';

export const STORAGE_KEY = 'room-planner:v1';

export interface PersistedState {
  version: 1;
  activeId: string;
  layouts: Layout[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = { snap: true, gridSize: 5 };

export function defaultState(): PersistedState {
  const layout = seedLayout();
  return { version: 1, activeId: layout.id, layouts: [layout], settings: { ...DEFAULT_SETTINGS } };
}

export function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const data = JSON.parse(raw);
    const layouts: Layout[] = (Array.isArray(data.layouts) ? data.layouts : []).flatMap((l: unknown) => {
      try {
        return [normalizeLayout(l)];
      } catch {
        return [];
      }
    });
    if (layouts.length === 0) return defaultState();
    const activeId = layouts.some((l) => l.id === data.activeId) ? data.activeId : layouts[0].id;
    const s = data.settings ?? {};
    const settings: Settings = {
      snap: typeof s.snap === 'boolean' ? s.snap : DEFAULT_SETTINGS.snap,
      gridSize: isPositive(s.gridSize) ? s.gridSize : DEFAULT_SETTINGS.gridSize,
    };
    return { version: 1, activeId, layouts, settings };
  } catch {
    return defaultState();
  }
}

export function saveState(state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable: keep working in memory.
  }
}

// ---------------------------------------------------------------------------
// Validation for stored and imported layouts
// ---------------------------------------------------------------------------

/** Older layouts stored a rectangle's walls by name; they map to wall indexes 0–3. */
const LEGACY_WALLS = ['top', 'right', 'bottom', 'left'];

function isPositive(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

function num(v: unknown, field: string, positive = false): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || (positive && v <= 0)) {
    throw new Error(`Invalid layout: "${field}" must be a ${positive ? 'positive ' : ''}number`);
  }
  return v;
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v : fallback;
}

function obj(v: unknown, field: string): Record<string, unknown> {
  if (!v || typeof v !== 'object') throw new Error(`Invalid layout: "${field}" must be an object`);
  return v as Record<string, unknown>;
}

/** Validate untrusted data and return a well-formed Layout. Throws with a readable message. */
export function normalizeLayout(raw: unknown): Layout {
  const l = obj(raw, 'layout');
  const { room, shift, remap } = parseRoom(obj(l.room, 'room'));
  const legacyRect = !Array.isArray((l.room as Record<string, unknown>).points);
  const b = { w: Math.max(...room.points.map((p) => p.x)), h: Math.max(...room.points.map((p) => p.y)) };
  if (!Array.isArray(l.items)) throw new Error('Invalid layout: "items" must be an array');
  const openingsRaw = Array.isArray(l.openings) ? l.openings : [];

  const items: Item[] = l.items.map((rawItem: unknown, n: number) => {
    const i = obj(rawItem, `items[${n}]`);
    const rotation = normalizeRotation(typeof i.rotation === 'number' && Number.isFinite(i.rotation) ? i.rotation : 0);
    const item: Item = {
      id: str(i.id, uid()),
      name: str(i.name, 'Item'),
      width: num(i.width, `items[${n}].width`, true),
      depth: num(i.depth, `items[${n}].depth`, true),
      color: typeof i.color === 'string' && /^#[0-9a-f]{6}$/i.test(i.color) ? i.color : '#cccccc',
      x: round2(num(i.x, `items[${n}].x`) + shift.x),
      y: round2(num(i.y, `items[${n}].y`) + shift.y),
      rotation,
      locked: i.locked === true,
    };
    if (isPositive(i.height)) item.height = i.height;
    if (i.floorLevel === true) item.floorLevel = true;
    return fitItemToRoom(item, room);
  });

  const openings: Opening[] = openingsRaw.flatMap((rawO: unknown, n: number) => {
    const o = obj(rawO, `openings[${n}]`);
    const width = num(o.width, `openings[${n}].width`, true);
    let offset = num(o.offset, `openings[${n}].offset`);
    let hinge: 'start' | 'end' = o.hinge === 'end' ? 'end' : 'start';
    let wall = typeof o.wall === 'number' && Number.isInteger(o.wall) ? o.wall : 0;
    const legacy = LEGACY_WALLS.indexOf(o.wall as string);
    if (legacy >= 0 && legacyRect) {
      // Old bottom/left walls were measured left→right / top→bottom; the outline now runs
      // clockwise, so those two walls are traversed the other way.
      wall = legacy;
      if (legacy >= 2) {
        offset = (legacy === 2 ? b.w : b.h) - offset - width;
        hinge = hinge === 'start' ? 'end' : 'start';
      }
    }
    const placed = remap({ wall, offset });
    if (!placed) return [];
    const base = { id: str(o.id, uid()), ...placed, width };
    const opening: Opening =
      o.kind === 'door'
        ? { ...base, kind: 'door', hinge, swing: o.swing === 'out' ? 'out' : 'in' }
        : { ...base, kind: 'window' };
    return [clampOpening(opening, room)];
  });

  return { id: str(l.id, uid()), name: str(l.name, 'Imported layout'), room, items, openings };
}

/** Read a room outline, or a width × depth rectangle from older layouts. */
function parseRoom(r: Record<string, unknown>): { room: Room; shift: Point; remap: Remap } {
  if (!Array.isArray(r.points)) {
    const room = rectRoom(num(r.width, 'room.width', true), num(r.depth, 'room.depth', true));
    return { room, shift: { x: 0, y: 0 }, remap: identityRemap };
  }
  let points: Point[] = r.points.map((p: unknown, n: number) => {
    const q = obj(p, `room.points[${n}]`);
    return { x: num(q.x, `room.points[${n}].x`), y: num(q.y, `room.points[${n}].y`) };
  });
  if (signedArea(points) < 0) points = [...points].reverse();
  const clean = cleanupRoom(points);
  if (!isValidRoom(clean.points)) {
    throw new Error('Invalid layout: the room outline must have walls meeting at right angles and must not cross itself');
  }
  const normalized = normalizeOrigin(clean.points);
  return { room: { points: normalized.points }, shift: normalized.shift, remap: clean.remap };
}

export function layoutToJson(layout: Layout): string {
  return JSON.stringify({ app: 'room-planner', version: 1, layout }, null, 2);
}

/** Parse an exported file (or a bare layout object). The result gets a fresh id. */
export function layoutFromJson(text: string): Layout {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('The file is not valid JSON.');
  }
  const wrapped = data && typeof data === 'object' && 'layout' in data ? (data as { layout: unknown }).layout : data;
  return { ...normalizeLayout(wrapped), id: uid() };
}
