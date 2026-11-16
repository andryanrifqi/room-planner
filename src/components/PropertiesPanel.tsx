import type { DoorOpening, Item, Layout, Opening, Room, Selection } from '../types';
import type { LayoutAction } from '../state/reducer';
import { footprint, round2 } from '../geometry/geometry';
import { roomBounds, walls, wallSide, type RoomShape, type WallFrame } from '../geometry/room';
import { NumberField, TextField } from './fields';
import { uid } from '../state/uid';

interface Props {
  layout: Layout;
  selection: Selection;
  dispatch: (a: LayoutAction) => void;
  onSelect: (s: Selection) => void;
  onDuplicate: (id: string) => void;
  onDelete: () => void;
  /** Re-fit the view after the room's overall size or shape changes. */
  onRoomReshaped: () => void;
}

export function PropertiesPanel({ layout, selection, dispatch, onSelect, onDuplicate, onDelete, onRoomReshaped }: Props) {
  const item = selection?.kind === 'item' ? layout.items.find((i) => i.id === selection.id) : undefined;
  const opening = selection?.kind === 'opening' ? layout.openings.find((o) => o.id === selection.id) : undefined;
  const wall = selection?.kind === 'wall' && selection.index < layout.room.points.length ? selection.index : null;

  return (
    <section className="properties" data-testid="properties">
      {item ? (
        // Keyed by id so switching selection gives fresh fields that can't carry text over.
        <ItemProperties key={item.id} item={item} dispatch={dispatch} onDuplicate={onDuplicate} onDelete={onDelete} />
      ) : opening ? (
        <OpeningProperties key={opening.id} opening={opening} room={layout.room} dispatch={dispatch} onDelete={onDelete} />
      ) : wall !== null ? (
        <WallProperties key={wall} index={wall} layout={layout} dispatch={dispatch} onSelect={onSelect} />
      ) : (
        <RoomProperties layout={layout} dispatch={dispatch} onSelect={onSelect} onRoomReshaped={onRoomReshaped} />
      )}
    </section>
  );
}

function ItemProperties({
  item,
  dispatch,
  onDuplicate,
  onDelete,
}: {
  item: Item;
  dispatch: (a: LayoutAction) => void;
  onDuplicate: (id: string) => void;
  onDelete: () => void;
}) {
  // Fields apply as you type; each field's keystrokes collapse into one undo step.
  const update = (patch: Partial<Item>, field?: string) =>
    dispatch({ type: 'updateItem', id: item.id, patch, coalesce: field && `${item.id}:${field}` });
  const f = footprint(item);
  const locked = item.locked;
  return (
    <>
      <h2>Item</h2>
      <TextField label="Name" value={item.name} live onCommit={(name) => update({ name }, 'name')} testId="prop-name" />
      <label className="field">
        <span>Color</span>
        <input
          type="color"
          value={item.color}
          onChange={(e) => update({ color: e.target.value }, 'color')}
          data-testid="prop-color"
        />
      </label>
      <div className="field-row">
        <NumberField label="Width (cm)" value={item.width} min={5} live disabled={locked} onCommit={(v) => v && update({ width: v }, 'width')} testId="prop-width" />
        <NumberField label="Depth (cm)" value={item.depth} min={5} live disabled={locked} onCommit={(v) => v && update({ depth: v }, 'depth')} testId="prop-depth" />
      </div>
      <NumberField label="Height (cm)" value={item.height} min={1} optional live onCommit={(height) => update({ height }, 'height')} />
      <div className="field-row">
        <NumberField label="X (cm)" value={item.x} live disabled={locked} onCommit={(x) => x !== undefined && update({ x }, 'x')} testId="prop-x" />
        <NumberField label="Y (cm)" value={item.y} live disabled={locked} onCommit={(y) => y !== undefined && update({ y }, 'y')} testId="prop-y" />
      </div>
      <p className="muted">
        Rotation {item.rotation}° · takes up {round2(f.w)}×{round2(f.h)} cm
      </p>
      <div className="button-row">
        <button onClick={() => dispatch({ type: 'rotateItem', id: item.id, dir: -1 })} disabled={locked} title="Rotate 45° counter-clockwise (Shift+R)" data-testid="rotate-ccw">
          ⟲ 45°
        </button>
        <button onClick={() => dispatch({ type: 'rotateItem', id: item.id })} disabled={locked} title="Rotate 45° clockwise (R)" data-testid="rotate">
          ⟳ 45°
        </button>
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={locked} onChange={(e) => update({ locked: e.target.checked })} data-testid="prop-locked" />
        Locked (can't be moved, rotated or resized)
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={!!item.floorLevel} onChange={(e) => update({ floorLevel: e.target.checked || undefined })} />
        Floor-level (rug: ignored by collisions)
      </label>
      <div className="button-row">
        <button onClick={() => onDuplicate(item.id)} title="Duplicate (Ctrl/Cmd+D)">
          Duplicate
        </button>
        <button className="danger" onClick={onDelete} title="Delete (Del)" data-testid="delete">
          Delete
        </button>
      </div>
    </>
  );
}

function wallLabel(f: WallFrame, i: number): string {
  return `Wall ${i + 1} · ${wallSide(f)} · ${round2(f.length)} cm`;
}

/** Names for a wall's two ends, as [start, end]. */
function endNames(f: WallFrame): [string, string] {
  if (Math.abs(f.dir.x) > 0.5) return f.dir.x > 0 ? ['left', 'right'] : ['right', 'left'];
  return f.dir.y > 0 ? ['top', 'bottom'] : ['bottom', 'top'];
}

function OpeningProperties({
  opening,
  room,
  dispatch,
  onDelete,
}: {
  opening: Opening;
  room: Room;
  dispatch: (a: LayoutAction) => void;
  onDelete: () => void;
}) {
  const update = (patch: Partial<DoorOpening>, field?: string) =>
    dispatch({ type: 'updateOpening', id: opening.id, patch, coalesce: field && `${opening.id}:${field}` });
  const ws = walls(room);
  const [startEnd, endEnd] = endNames(ws[opening.wall]);
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  return (
    <>
      <h2>{opening.kind === 'door' ? 'Door' : 'Window'}</h2>
      <label className="field">
        <span>Wall</span>
        <select value={opening.wall} onChange={(e) => update({ wall: Number(e.target.value) })} data-testid="opening-wall">
          {ws.map((f, i) =>
            f.length > 0 ? (
              <option key={i} value={i}>
                {wallLabel(f, i)}
              </option>
            ) : null,
          )}
        </select>
      </label>
      <div className="field-row">
        <NumberField label="Width (cm)" value={opening.width} min={10} live onCommit={(v) => v && update({ width: v }, 'width')} />
        <NumberField label="Offset (cm)" value={opening.offset} min={0} live onCommit={(v) => v !== undefined && update({ offset: v }, 'offset')} />
      </div>
      <p className="muted">Offset is measured from the {startEnd} end of the wall.</p>
      {opening.kind === 'door' && (
        <div className="field-row">
          <label className="field">
            <span>Hinge side</span>
            <select value={opening.hinge} onChange={(e) => update({ hinge: e.target.value as DoorOpening['hinge'] })}>
              <option value="start">{cap(startEnd)} end</option>
              <option value="end">{cap(endEnd)} end</option>
            </select>
          </label>
          <label className="field">
            <span>Swing</span>
            <select value={opening.swing} onChange={(e) => update({ swing: e.target.value as DoorOpening['swing'] })}>
              <option value="in">Into room</option>
              <option value="out">Out of room</option>
            </select>
          </label>
        </div>
      )}
      <p className="muted">Drag the opening on the plan to slide it along its wall.</p>
      <button className="danger" onClick={onDelete}>
        Delete {opening.kind}
      </button>
    </>
  );
}

function newOpening(kind: 'door' | 'window', wall: number): Opening {
  const id = uid();
  return kind === 'door'
    ? { id, kind, wall, offset: 10, width: 80, hinge: 'start', swing: 'in' }
    : { id, kind, wall, offset: 10, width: 100 };
}

function WallProperties({
  index,
  layout,
  dispatch,
  onSelect,
}: {
  index: number;
  layout: Layout;
  dispatch: (a: LayoutAction) => void;
  onSelect: (s: Selection) => void;
}) {
  const f = walls(layout.room)[index];
  const onWall = layout.openings.filter((o) => o.wall === index);
  function add(kind: 'door' | 'window') {
    const o = newOpening(kind, index);
    dispatch({ type: 'addOpening', opening: o });
    onSelect({ kind: 'opening', id: o.id });
  }
  return (
    <>
      <h2>Wall {index + 1}</h2>
      <p className="muted">
        {wallSide(f)[0].toUpperCase() + wallSide(f).slice(1)} side of the room. Drag the wall on the plan to move it, or
        drag a corner.
      </p>
      <NumberField
        label="Length (cm)"
        value={round2(f.length)}
        min={1}
        onCommit={(v) => v && dispatch({ type: 'setWallLength', index, length: v })}
        testId="wall-length"
      />
      <p className="muted">Changing the length moves the wall at its {endNames(f)[1]} end.</p>
      <button
        onClick={() => dispatch({ type: 'splitWall', index })}
        title="Add two corners in the middle of this wall, then drag one half to make an alcove or bump-out"
        data-testid="split-wall"
      >
        Split wall (add corners)
      </button>
      <div className="button-row">
        <button onClick={() => add('door')}>+ Door here</button>
        <button onClick={() => add('window')}>+ Window here</button>
      </div>
      {onWall.length > 0 && (
        <ul className="opening-list">
          {onWall.map((o) => (
            <li key={o.id}>
              <button className="link" onClick={() => onSelect({ kind: 'opening', id: o.id })}>
                {o.kind === 'door' ? 'Door' : 'Window'} · {o.width} cm @ {o.offset}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button className="link" onClick={() => onSelect(null)}>
        ← Room settings
      </button>
    </>
  );
}

const SHAPES: { shape: RoomShape; label: string; icon: string }[] = [
  { shape: 'rectangle', label: 'Rectangle', icon: 'M2 2h20v16H2z' },
  { shape: 'l', label: 'L-shape', icon: 'M2 2h11v7h9v9H2z' },
  { shape: 'u', label: 'U-shape', icon: 'M2 2h6v8h8V2h6v16H2z' },
  { shape: 't', label: 'T-shape', icon: 'M2 2h20v7h-5v9H7V9H2z' },
];

function RoomProperties({
  layout,
  dispatch,
  onSelect,
  onRoomReshaped,
}: {
  layout: Layout;
  dispatch: (a: LayoutAction) => void;
  onSelect: (s: Selection) => void;
  onRoomReshaped: () => void;
}) {
  const b = roomBounds(layout.room);
  const ws = walls(layout.room);
  /** The longest wall on the given side, for placing a new door or window. */
  const longest = (side: string) => {
    let best = -1;
    ws.forEach((f, i) => {
      if (wallSide(f) === side && (best < 0 || f.length > ws[best].length)) best = i;
    });
    return Math.max(best, 0);
  };
  function addOpening(kind: 'door' | 'window') {
    const o = newOpening(kind, longest(kind === 'door' ? 'bottom' : 'top'));
    dispatch({ type: 'addOpening', opening: o });
    onSelect({ kind: 'opening', id: o.id });
  }
  return (
    <>
      <h2>Room</h2>
      <div className="shape-row">
        {SHAPES.map((s) => (
          <button
            key={s.shape}
            className="shape"
            title={`${s.label} (keeps the overall size)`}
            onClick={() => {
              dispatch({ type: 'setRoomShape', shape: s.shape });
              onRoomReshaped();
            }}
            data-testid={`shape-${s.shape}`}
          >
            <svg viewBox="0 0 24 20" width="24" height="20" aria-hidden>
              <path d={s.icon} fill="#e5e7eb" stroke="#4b5563" strokeWidth="1.5" />
            </svg>
            <span>{s.label}</span>
          </button>
        ))}
      </div>
      <div className="field-row">
        <NumberField
          label="Overall width (cm)"
          value={round2(b.w)}
          min={50}
          onCommit={(v) => {
            if (!v) return;
            dispatch({ type: 'setRoomSize', width: v, depth: b.h });
            onRoomReshaped();
          }}
          testId="room-width"
        />
        <NumberField
          label="Overall depth (cm)"
          value={round2(b.h)}
          min={50}
          onCommit={(v) => {
            if (!v) return;
            dispatch({ type: 'setRoomSize', width: b.w, depth: v });
            onRoomReshaped();
          }}
          testId="room-depth"
        />
      </div>
      <h2>Walls</h2>
      <ul className="opening-list" data-testid="wall-list">
        {ws.map((f, i) =>
          f.length > 0 ? (
            <li key={i}>
              <button className="link" onClick={() => onSelect({ kind: 'wall', index: i })}>
                {wallLabel(f, i)}
              </button>
            </li>
          ) : null,
        )}
      </ul>
      <p className="muted">Drag walls and corners on the plan to reshape the room, or select a wall to type its length.</p>
      <div className="button-row">
        <button onClick={() => addOpening('door')}>+ Door</button>
        <button onClick={() => addOpening('window')}>+ Window</button>
      </div>
      {layout.openings.length > 0 && (
        <ul className="opening-list">
          {layout.openings.map((o) => (
            <li key={o.id}>
              <button className="link" onClick={() => onSelect({ kind: 'opening', id: o.id })}>
                {o.kind === 'door' ? 'Door' : 'Window'} · wall {o.wall + 1} · {o.width} cm @ {o.offset}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
