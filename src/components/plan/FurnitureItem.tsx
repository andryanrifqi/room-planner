import type { PointerEvent } from 'react';
import type { Item } from '../../types';
import { clamp, footprint, rectCenter } from '../../geometry/geometry';

interface Props {
  item: Item;
  selected: boolean;
  colliding: boolean;
  onPointerDown: (e: PointerEvent, item: Item) => void;
}

const FONT = 'system-ui, sans-serif';

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return maxChars <= 1 ? '' : text.slice(0, maxChars - 1) + '…';
}

export function FurnitureItem({ item, selected, colliding, onPointerDown }: Props) {
  const f = footprint(item);
  const c = rectCenter(f);
  // Labels stay horizontal; size them to fit the item's narrower side.
  const fs = clamp(Math.min(item.width, item.depth) / 4, 6, 13);
  const maxChars = Math.floor(Math.max(item.width, item.depth) / (fs * 0.58));
  const showSize = Math.min(item.width, item.depth) > fs * 3;
  const stroke = colliding ? '#dc2626' : '#374151';
  const local = { x: -item.width / 2, y: -item.depth / 2, width: item.width, height: item.depth };

  return (
    <g
      data-testid="furniture"
      data-id={item.id}
      data-name={item.name}
      data-x={item.x}
      data-y={item.y}
      data-width={item.width}
      data-depth={item.depth}
      data-rotation={item.rotation}
      data-collides={colliding ? 'true' : 'false'}
      data-selected={selected ? 'true' : 'false'}
      onPointerDown={(e) => onPointerDown(e, item)}
      style={{ cursor: item.locked ? 'default' : 'move' }}
    >
      <g transform={`translate(${c.x} ${c.y}) rotate(${item.rotation})`}>
        <rect
          {...local}
          fill={item.color}
          fillOpacity={item.floorLevel ? 0.6 : 1}
          stroke={stroke}
          strokeWidth={colliding ? 2 : 1}
          strokeDasharray={item.floorLevel ? '4 3' : undefined}
          vectorEffect="non-scaling-stroke"
        />
        {/* Darker band marks the back of the item (headboard, wardrobe back, desk back). */}
        {!item.floorLevel && (
          <rect x={local.x} y={local.y} width={item.width} height={Math.min(6, item.depth / 4)} fill="#000" fillOpacity={0.18} />
        )}
        {colliding && <rect {...local} fill="#ef4444" fillOpacity={0.35} />}
        {selected && (
          <rect
            {...local}
            fill="none"
            stroke="#2563eb"
            strokeWidth={2}
            strokeDasharray="6 3"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
            data-export="skip"
          />
        )}
      </g>
      <text
        x={c.x}
        y={showSize ? c.y - fs * 0.15 : c.y + fs * 0.35}
        textAnchor="middle"
        fontFamily={FONT}
        fontSize={fs}
        fill="#111827"
        pointerEvents="none"
      >
        {truncate(item.name, maxChars)}
      </text>
      {showSize && (
        <text x={c.x} y={c.y + fs * 1.05} textAnchor="middle" fontFamily={FONT} fontSize={fs * 0.8} fill="#374151" pointerEvents="none">
          {truncate(`${item.width}×${item.depth}`, maxChars)}
        </text>
      )}
      {item.locked && (
        <text x={f.x + f.w - 2} y={f.y + 11} textAnchor="end" fontSize={9} pointerEvents="none" data-export="skip">
          🔒
        </text>
      )}
    </g>
  );
}
