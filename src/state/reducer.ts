import type { Item, Layout, Opening } from '../types';
import {
  clampOpening,
  fitInsideRoom,
  fitItemToRoom,
  itemInsideRoom,
  MIN_ITEM_SIZE,
  rotateItem,
  round2,
} from '../geometry/geometry';
import { editRoom, type RoomEdit } from './roomOps';

/**
 * Every change to a layout goes through this reducer. `coalesce` lets a burst of actions
 * (e.g. dragging a color picker) collapse into a single undo step; see history.ts.
 */
export type LayoutAction = (
  | RoomEdit
  | { type: 'renameLayout'; name: string }
  | { type: 'addItem'; item: Item }
  | { type: 'updateItem'; id: string; patch: Partial<Omit<Item, 'id'>> }
  | { type: 'moveItem'; id: string; x: number; y: number }
  | { type: 'rotateItem'; id: string; dir?: 1 | -1 }
  | { type: 'nudgeItem'; id: string; dx: number; dy: number }
  | { type: 'duplicateItem'; id: string; newId: string }
  | { type: 'deleteItem'; id: string }
  | { type: 'addOpening'; opening: Opening }
  | { type: 'updateOpening'; id: string; patch: Partial<Opening> }
  | { type: 'deleteOpening'; id: string }
) & { coalesce?: string };

const GEOMETRY_KEYS = ['x', 'y', 'width', 'depth', 'rotation'] as const;

/**
 * Name for a duplicate: the base name plus the lowest free number, e.g. "Desk" → "Desk 2",
 * and duplicating "Desk 2" when "Desk 3" exists → "Desk 4". Names compare case-insensitively.
 */
export function copyName(name: string, existing: string[]): string {
  const base = name.replace(/ \d+$/, '');
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  let n = 2;
  while (taken.has(`${base} ${n}`.toLowerCase())) n++;
  return `${base} ${n}`;
}

/** `name` if no item uses it yet (ignoring case), otherwise a numbered name as for a duplicate. */
export function uniqueName(name: string, existing: string[]): string {
  const lower = name.toLowerCase();
  return existing.some((n) => n.toLowerCase() === lower) ? copyName(name, existing) : name;
}

function mapItem(layout: Layout, id: string, fn: (item: Item) => Item): Layout {
  let changed = false;
  const items = layout.items.map((i) => {
    if (i.id !== id) return i;
    const next = fn(i);
    if (next !== i) changed = true;
    return next;
  });
  return changed ? { ...layout, items } : layout;
}

/** Applies fn only to unlocked items; locked items are returned unchanged. */
function mapMovable(layout: Layout, id: string, fn: (item: Item) => Item): Layout {
  return mapItem(layout, id, (i) => (i.locked ? i : fn(i)));
}

const sameItem = (a: Item, b: Item) =>
  (Object.keys({ ...a, ...b }) as (keyof Item)[]).every((k) => a[k] === b[k]);

/** Move to (x, y) if the item fits there; otherwise leave it where it is. */
function moveIfInside(item: Item, x: number, y: number, room: Layout['room']): Item {
  if (item.x === x && item.y === y) return item;
  const moved = { ...item, x: round2(x), y: round2(y) };
  return itemInsideRoom(moved, room) || !itemInsideRoom(item, room) ? moved : item;
}

export function layoutReducer(layout: Layout, action: LayoutAction): Layout {
  const room = layout.room;
  switch (action.type) {
    case 'setRoomSize':
    case 'setRoomShape':
    case 'moveWall':
    case 'moveCorner':
    case 'setWallLength':
    case 'splitWall':
      return editRoom(layout, action) ?? layout;
    case 'renameLayout': {
      const name = action.name.trim();
      return name && name !== layout.name ? { ...layout, name } : layout;
    }
    case 'addItem': {
      const name = uniqueName(action.item.name, layout.items.map((i) => i.name));
      return { ...layout, items: [...layout.items, fitItemToRoom({ ...action.item, name }, room)] };
    }
    case 'updateItem':
      return mapItem(layout, action.id, (i) => {
        const patch = { ...action.patch };
        if (i.locked && patch.locked !== false) GEOMETRY_KEYS.forEach((k) => delete patch[k]);
        if (patch.width !== undefined) patch.width = Math.max(MIN_ITEM_SIZE, patch.width);
        if (patch.depth !== undefined) patch.depth = Math.max(MIN_ITEM_SIZE, patch.depth);
        if (Object.keys(patch).every((k) => i[k as keyof Item] === patch[k as keyof typeof patch])) return i;
        const next = fitItemToRoom({ ...i, ...patch }, room);
        return sameItem(next, i) ? i : next;
      });
    case 'moveItem':
      // Positions come from a drag preview that already respected the walls.
      return mapMovable(layout, action.id, (i) => {
        if (i.x === action.x && i.y === action.y) return i;
        const moved = fitInsideRoom({ ...i, x: round2(action.x), y: round2(action.y) }, room);
        return sameItem(moved, i) ? i : moved;
      });
    case 'rotateItem':
      return mapMovable(layout, action.id, (i) => rotateItem(i, room, action.dir ?? 1));
    case 'nudgeItem':
      return mapMovable(layout, action.id, (i) => moveIfInside(i, i.x + action.dx, i.y + action.dy, room));
    case 'duplicateItem': {
      const src = layout.items.find((i) => i.id === action.id);
      if (!src) return layout;
      const name = copyName(src.name, layout.items.map((i) => i.name));
      const copy = fitItemToRoom({ ...src, id: action.newId, name, x: src.x + 20, y: src.y + 20, locked: false }, room);
      return { ...layout, items: [...layout.items, copy] };
    }
    case 'deleteItem':
      return layout.items.some((i) => i.id === action.id)
        ? { ...layout, items: layout.items.filter((i) => i.id !== action.id) }
        : layout;
    case 'addOpening':
      return { ...layout, openings: [...layout.openings, clampOpening(action.opening, room)] };
    case 'updateOpening': {
      let changed = false;
      const openings = layout.openings.map((o) => {
        if (o.id !== action.id) return o;
        const next = clampOpening({ ...o, ...action.patch } as Opening, room);
        if ((Object.keys(next) as (keyof Opening)[]).every((k) => next[k] === o[k])) return o;
        changed = true;
        return next;
      });
      return changed ? { ...layout, openings } : layout;
    }
    case 'deleteOpening':
      return { ...layout, openings: layout.openings.filter((o) => o.id !== action.id) };
  }
}
