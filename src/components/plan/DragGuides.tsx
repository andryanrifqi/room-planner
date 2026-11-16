import type { Rect, Room } from '../../types';
import { wallDistances } from '../../geometry/room';

interface Props {
  rect: Rect;
  room: Room;
  cmPerPx: number;
}

/** Dimension lines from each side of the dragged item to the nearest wall on that side. */
export function DragGuides({ rect, room, cmPerPx }: Props) {
  const gaps = wallDistances(rect, room);
  const fs = 12 * cmPerPx;
  return (
    <g data-export="skip" pointerEvents="none" data-testid="drag-guides">
      {(Object.keys(gaps) as (keyof typeof gaps)[]).map((side) => {
        const g = gaps[side];
        if (!g) return null;
        return (
          <g key={side}>
            {g.dist > 0 && (
              <line
                x1={g.from.x}
                y1={g.from.y}
                x2={g.to.x}
                y2={g.to.y}
                stroke="#2563eb"
                strokeWidth={1}
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <text
              x={(g.from.x + g.to.x) / 2}
              y={(g.from.y + g.to.y) / 2 + fs * 0.35}
              textAnchor="middle"
              fontFamily="system-ui, sans-serif"
              fontSize={fs}
              fontWeight={600}
              fill="#1d4ed8"
              stroke="#ffffff"
              strokeWidth={3 * cmPerPx}
              paintOrder="stroke"
              data-testid={`guide-${side}`}
            >
              {Math.round(g.dist)} cm
            </text>
          </g>
        );
      })}
    </g>
  );
}
