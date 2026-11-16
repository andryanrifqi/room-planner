import type { PointerEvent } from 'react';
import type { Opening, Rect, Room } from '../../types';
import { doorArcPath, doorGeometry, openingEndpoints } from '../../geometry/geometry';
import { wallFrame } from '../../geometry/room';
import { FLOOR_COLOR, WALL_THICKNESS } from './Walls';

/** Rectangle covering the opening within the wall thickness. */
function wallSlot(o: Opening, room: Room, extra = 0): Rect {
  const f = wallFrame(o.wall, room);
  const { a, b } = openingEndpoints(o, room);
  const t = WALL_THICKNESS + extra;
  const ox = -f.inward.x * t;
  const oy = -f.inward.y * t;
  const xs = [a.x, b.x, a.x + ox, b.x + ox];
  const ys = [a.y, b.y, a.y + oy, b.y + oy];
  // Grow slightly into the room for an easier grab target.
  const ix = f.inward.x * extra;
  const iy = f.inward.y * extra;
  xs.push(a.x + ix, b.x + ix);
  ys.push(a.y + iy, b.y + iy);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

interface Props {
  opening: Opening;
  room: Room;
  selected: boolean;
  onPointerDown: (e: PointerEvent, opening: Opening) => void;
}

export function OpeningShape({ opening, room, selected, onPointerDown }: Props) {
  const slot = wallSlot(opening, room);
  const hit = wallSlot(opening, room, 8);
  const highlight = selected ? '#2563eb' : undefined;

  let body;
  if (opening.kind === 'window') {
    const f = wallFrame(opening.wall, room);
    const { a, b } = openingEndpoints(opening, room);
    const mid = { x: -f.inward.x * (WALL_THICKNESS / 2), y: -f.inward.y * (WALL_THICKNESS / 2) };
    body = (
      <g>
        <rect x={slot.x} y={slot.y} width={slot.w} height={slot.h} fill="#dbeafe" stroke="#3b82f6" strokeWidth={1} />
        <line x1={a.x + mid.x} y1={a.y + mid.y} x2={b.x + mid.x} y2={b.y + mid.y} stroke="#3b82f6" strokeWidth={1} />
      </g>
    );
  } else {
    const g = doorGeometry(opening, room);
    const arc = doorArcPath(g);
    body = (
      <g>
        <rect x={slot.x} y={slot.y} width={slot.w} height={slot.h} fill={FLOOR_COLOR} />
        <path d={`${arc} L ${g.hinge.x} ${g.hinge.y} Z`} fill="#fde68a" fillOpacity={0.35} />
        <path d={arc} fill="none" stroke="#6b7280" strokeWidth={1} strokeDasharray="4 3" />
        <line x1={g.hinge.x} y1={g.hinge.y} x2={g.openEnd.x} y2={g.openEnd.y} stroke="#1f2937" strokeWidth={3} />
      </g>
    );
  }

  return (
    <g data-testid={`opening-${opening.kind}`} data-id={opening.id}>
      {body}
      <rect
        x={hit.x}
        y={hit.y}
        width={hit.w}
        height={hit.h}
        fill="transparent"
        stroke={highlight}
        strokeWidth={highlight ? 2 : 0}
        vectorEffect="non-scaling-stroke"
        style={{ cursor: Math.abs(wallFrame(opening.wall, room).dir.x) > 0.5 ? 'ew-resize' : 'ns-resize' }}
        onPointerDown={(e) => onPointerDown(e, opening)}
        data-export="skip"
      />
    </g>
  );
}
