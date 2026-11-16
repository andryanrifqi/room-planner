import type { PointerEvent } from 'react';
import type { Item } from '../../types';
import { HANDLES, handleAngle, handlePosition, type Handle } from '../../geometry/geometry';

/** Resize cursor for a handle pointing in screen direction `deg`. */
function cursorFor(deg: number): string {
  const a = ((Math.round(deg / 45) * 45) % 180 + 180) % 180;
  return a === 0 ? 'ew-resize' : a === 45 ? 'nwse-resize' : a === 90 ? 'ns-resize' : 'nesw-resize';
}

interface Props {
  item: Item;
  /** Size of one screen pixel in cm, so handles keep a constant on-screen size. */
  cmPerPx: number;
  onPointerDown: (e: PointerEvent, handle: Handle) => void;
}

export function ResizeHandles({ item, cmPerPx, onPointerDown }: Props) {
  const size = 10 * cmPerPx;
  return (
    <g data-export="skip">
      {HANDLES.map((h) => {
        const p = handlePosition(item, h);
        return (
          <rect
            key={h}
            data-testid={`handle-${h}`}
            x={p.x - size / 2}
            y={p.y - size / 2}
            width={size}
            height={size}
            fill="#ffffff"
            stroke="#2563eb"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            transform={`rotate(${item.rotation} ${p.x} ${p.y})`}
            style={{ cursor: cursorFor(handleAngle(item, h)), touchAction: 'none' }}
            onPointerDown={(e) => onPointerDown(e, h)}
          />
        );
      })}
    </g>
  );
}
