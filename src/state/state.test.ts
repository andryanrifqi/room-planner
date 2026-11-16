import { describe, expect, it } from 'vitest';
import { historyReducer, initHistory } from './history';
import { copyName, uniqueName } from './reducer';
import { layoutFromJson, layoutToJson, normalizeLayout } from './storage';
import { seedLayout } from './seed';
import { editRoom } from './roomOps';
import { itemInsideRoom } from '../geometry/geometry';
import { roomBounds } from '../geometry/room';

describe('room edits on a layout', () => {
  it('keeps the door in place when the top wall moves', () => {
    const layout = seedLayout();
    const next = editRoom(layout, { type: 'moveWall', index: 0, delta: -30 })!; // 30 cm taller
    expect(roomBounds(next.room)).toEqual({ x: 0, y: 0, w: 360, h: 360 });
    const door = next.openings.find((o) => o.kind === 'door')!;
    // Same spot relative to the floor: it was 250 cm down wall 1, the wall now starts 30 cm higher.
    expect(door).toMatchObject({ wall: 1, offset: 280 });
    // Furniture shifts with the re-based origin, so it stays put relative to the other walls.
    expect(next.items[0].y).toBe(layout.items[0].y + 30);
  });

  it('moves furniture out of the cut-away corner when switching to an L-shape', () => {
    const next = editRoom(seedLayout(), { type: 'setRoomShape', shape: 'l' })!;
    expect(next.room.points).toHaveLength(6);
    for (const i of next.items) expect(itemInsideRoom(i, next.room)).toBe(true);
    expect(next.openings).toHaveLength(2);
  });

  it('rejects edits that would make the walls cross', () => {
    expect(editRoom(seedLayout(), { type: 'moveWall', index: 0, delta: 400 })).toBeNull();
  });

  it('changes a wall length by moving the next wall', () => {
    const next = editRoom(seedLayout(), { type: 'setWallLength', index: 0, length: 400 })!;
    expect(roomBounds(next.room).w).toBe(400);
  });
});

describe('loading older layouts', () => {
  it('converts width/depth rooms and named walls', () => {
    const l = normalizeLayout({
      name: 'Old',
      room: { width: 360, depth: 330 },
      items: [{ name: 'Desk', width: 100, depth: 50, x: 10, y: 10, rotation: 90, color: '#aaaaaa' }],
      openings: [
        { kind: 'door', wall: 'bottom', offset: 20, width: 80, hinge: 'start', swing: 'in' },
        { kind: 'window', wall: 'left', offset: 30, width: 100 },
      ],
    });
    expect(l.room.points).toEqual(seedLayout().room.points);
    // Bottom wall now runs right→left: offset 20 from the left becomes 360 - 20 - 80 from the right.
    expect(l.openings[0]).toMatchObject({ wall: 2, offset: 260, hinge: 'end' });
    expect(l.openings[1]).toMatchObject({ wall: 3, offset: 200 });
    expect(l.items[0].rotation).toBe(90);
  });
});

describe('history', () => {
  it('undoes and redoes a delete', () => {
    const layout = seedLayout();
    const id = layout.items[0].id;
    let h = initHistory(layout);
    h = historyReducer(h, { type: 'deleteItem', id });
    expect(h.present.items).toHaveLength(6);
    h = historyReducer(h, { type: 'undo' });
    expect(h.present.items).toHaveLength(7);
    h = historyReducer(h, { type: 'redo' });
    expect(h.present.items).toHaveLength(6);
  });

  it('skips no-op actions', () => {
    const h = initHistory(seedLayout());
    const id = h.present.items[0].id;
    const { x, y } = h.present.items[0];
    expect(historyReducer(h, { type: 'moveItem', id, x, y })).toBe(h);
  });

  it('coalesces repeated actions with the same key', () => {
    let h = initHistory(seedLayout());
    const id = h.present.items[0].id;
    for (const color of ['#111111', '#222222', '#333333']) {
      h = historyReducer(h, { type: 'updateItem', id, patch: { color }, coalesce: `color:${id}` });
    }
    expect(h.past).toHaveLength(1);
    h = historyReducer(h, { type: 'undo' });
    expect(h.present.items[0].color).toBe(seedLayout().items[0].color);
  });

  it('ignores moves on locked items', () => {
    let h = initHistory(seedLayout());
    const id = h.present.items[0].id;
    h = historyReducer(h, { type: 'updateItem', id, patch: { locked: true } });
    const locked = historyReducer(h, { type: 'nudgeItem', id, dx: 0, dy: 10 });
    expect(locked).toBe(h);
    expect(historyReducer(h, { type: 'updateItem', id, patch: { width: 50 } })).toBe(h);
  });
});

describe('duplicate naming', () => {
  it('numbers copies with the lowest free number', () => {
    expect(copyName('Desk', ['Desk'])).toBe('Desk 2');
    expect(copyName('Desk', ['Desk', 'Desk 2'])).toBe('Desk 3');
    expect(copyName('Desk 2', ['Desk', 'Desk 2', 'Desk 3'])).toBe('Desk 4');
    expect(copyName('Desk', ['Desk', 'Desk 3'])).toBe('Desk 2');
  });

  it('keeps a free name and numbers a taken one, ignoring case', () => {
    expect(uniqueName('Desk', ['Bed'])).toBe('Desk');
    expect(uniqueName('Desk', ['Desk', 'Desk 2'])).toBe('Desk 3');
    expect(uniqueName('desk', ['Desk'])).toBe('desk 2');
    expect(uniqueName('Shelf 2', ['Shelf 2'])).toBe('Shelf 3');
  });

  it('numbers newly added items whose name is taken', () => {
    let h = initHistory(seedLayout());
    const desk = h.present.items.find((i) => i.name === 'Desk')!;
    h = historyReducer(h, { type: 'addItem', item: { ...desk, id: 'new1' } });
    h = historyReducer(h, { type: 'addItem', item: { ...desk, id: 'new2', name: 'Armchair' } });
    expect(h.present.items.find((i) => i.id === 'new1')!.name).toBe('Desk 2');
    expect(h.present.items.find((i) => i.id === 'new2')!.name).toBe('Armchair');
  });

  it('renames the duplicate in the layout', () => {
    let h = initHistory(seedLayout());
    const desk = h.present.items.find((i) => i.name === 'Desk')!;
    h = historyReducer(h, { type: 'duplicateItem', id: desk.id, newId: 'copy1' });
    h = historyReducer(h, { type: 'duplicateItem', id: desk.id, newId: 'copy2' });
    expect(h.present.items.filter((i) => /^Desk( \d+)?$/.test(i.name)).map((i) => i.name)).toEqual([
      'Desk',
      'Desk 2',
      'Desk 3',
    ]);
  });
});

describe('JSON import/export', () => {
  it('round-trips a layout with a new id', () => {
    const layout = seedLayout();
    const back = layoutFromJson(layoutToJson(layout));
    expect(back.id).not.toBe(layout.id);
    expect(back.items).toEqual(layout.items);
    expect(back.openings).toEqual(layout.openings);
  });

  it('rejects invalid files', () => {
    expect(() => layoutFromJson('nope')).toThrow(/not valid JSON/);
    expect(() => layoutFromJson('{"room":{"width":-1,"depth":3},"items":[]}')).toThrow(/room.width/);
  });
});
