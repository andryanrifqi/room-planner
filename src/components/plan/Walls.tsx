import type { PointerEvent } from 'react';
import type { Point, Room } from '../../types';
import { walls } from '../../geometry/room';
import { add, boundingBox, EPS, scale } from '../../geometry/polygon';

export const WALL_THICKNESS = 10;
export const FLOOR_COLOR = '#ffffff';
const FONT = 'system-ui, sans-serif';

export function outlinePath(points: Point[]): string {
  return points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ') + ' Z';
}

export function Walls({ room }: { room: Room }) {
  const d = outlinePath(room.points);
  return (
    <g>
      {/* A double-width stroke centered on the outline; the floor then covers its inner half. */}
      <path d={d} fill="none" stroke="#4b5563" strokeWidth={WALL_THICKNESS * 2} strokeLinejoin="miter" strokeMiterlimit={4} />
      <path d={d} fill={FLOOR_COLOR} data-role="floor" />
    </g>
  );
}

/** Length of every wall, drawn just outside it. */
export function Dimensions({ room }: { room: Room }) {
  const off = WALL_THICKNESS + 14;
  const tick = 5;
  return (
    <g fill="#374151" stroke="#374151" fontFamily={FONT} fontSize={11}>
      {walls(room).map((f, i) => {
        if (f.length < EPS) return null;
        const out = scale(f.inward, -1);
        const a = add(f.start, scale(out, off));
        const b = add(f.end, scale(out, off));
        const mid = add(scale(add(a, b), 0.5), scale(out, 5));
        const vertical = Math.abs(f.dir.x) < 0.5;
        const t = vertical ? { x: tick, y: 0 } : { x: 0, y: tick };
        return (
          <g key={i}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={0.75} />
            <line x1={a.x - t.x} y1={a.y - t.y} x2={a.x + t.x} y2={a.y + t.y} strokeWidth={0.75} />
            <line x1={b.x - t.x} y1={b.y - t.y} x2={b.x + t.x} y2={b.y + t.y} strokeWidth={0.75} />
            <text
              x={mid.x}
              y={mid.y}
              textAnchor="middle"
              dominantBaseline="middle"
              stroke="none"
              transform={vertical ? `rotate(-90 ${mid.x} ${mid.y})` : undefined}
              data-testid={`dim-wall-${i}`}
            >
              {Math.round(f.length * 10) / 10} cm
            </text>
          </g>
        );
      })}
    </g>
  );
}

interface WallHandlesProps {
  room: Room;
  selectedWall: number | null;
  showCorners: boolean;
  cmPerPx: number;
  onWallPointerDown: (e: PointerEvent, index: number) => void;
  onCornerPointerDown: (e: PointerEvent, index: number) => void;
}

/** Invisible grab areas over each wall, plus corner handles while editing the room. */
export function WallHandles({ room, selectedWall, showCorners, cmPerPx, onWallPointerDown, onCornerPointerDown }: WallHandlesProps) {
  const size = 9 * cmPerPx;
  return (
    <g data-export="skip">
      {walls(room).map((f, i) => {
        if (f.length < EPS) return null;
        const out = scale(f.inward, -1);
        const box = boundingBox([
          add(f.start, scale(out, WALL_THICKNESS)),
          add(f.end, scale(out, WALL_THICKNESS)),
          add(f.start, scale(f.inward, 3)),
          add(f.end, scale(f.inward, 3)),
        ]);
        const vertical = Math.abs(f.dir.x) < 0.5;
        const selected = selectedWall === i;
        return (
          <rect
            key={i}
            x={box.x}
            y={box.y}
            width={box.w}
            height={box.h}
            fill={selected ? '#2563eb' : 'transparent'}
            fillOpacity={selected ? 0.35 : 0}
            style={{ cursor: vertical ? 'ew-resize' : 'ns-resize' }}
            onPointerDown={(e) => onWallPointerDown(e, i)}
            data-testid={`wall-${i}`}
          />
        );
      })}
      {showCorners &&
        room.points.map((p, i) => (
          <rect
            key={i}
            x={p.x - size / 2}
            y={p.y - size / 2}
            width={size}
            height={size}
            fill="#ffffff"
            stroke="#6b7280"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            style={{ cursor: 'move' }}
            onPointerDown={(e) => onCornerPointerDown(e, i)}
            data-testid={`corner-${i}`}
          />
        ))}
    </g>
  );
}
