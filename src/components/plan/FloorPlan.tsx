import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type RefObject } from 'react';
import type { Item, Layout, Opening, Point, Rect, Selection, Settings } from '../../types';
import {
  constrainDrag,
  dragOpeningOffset,
  findCollisions,
  footprint,
  quantize,
  resizeFromHandle,
  type Handle,
} from '../../geometry/geometry';
import { roomBounds, wallFrame } from '../../geometry/room';
import { dot, sub } from '../../geometry/polygon';
import type { LayoutAction } from '../../state/reducer';
import { editRoom, type RoomEdit } from '../../state/roomOps';
import type { PanZoom, ViewBox } from '../../hooks/usePanZoom';
import { Dimensions, outlinePath, WallHandles, Walls } from './Walls';
import { OpeningShape } from './OpeningShape';
import { FurnitureItem } from './FurnitureItem';
import { ResizeHandles } from './ResizeHandles';
import { DragGuides } from './DragGuides';

type Drag =
  | { kind: 'item'; id: string; start: Point; rect: Rect; last: Point }
  | { kind: 'resize'; id: string; handle: Handle }
  | { kind: 'opening'; id: string; start: Point; startOffset: number }
  | { kind: 'wall'; index: number; start: Point; layout: Layout; edit: RoomEdit | null }
  | { kind: 'corner'; index: number; layout: Layout; edit: RoomEdit | null }
  | { kind: 'pan'; startClient: Point; startVb: ViewBox; pxPerCm: number; moved: boolean };

interface Props {
  layout: Layout;
  settings: Settings;
  selection: Selection;
  onSelect: (s: Selection) => void;
  dispatch: (a: LayoutAction) => void;
  panZoom: PanZoom;
  svgRef: RefObject<SVGSVGElement>;
}

export function FloorPlan({ layout, settings, selection, onSelect, dispatch, panZoom, svgRef }: Props) {
  const { viewBox, setViewBox, zoomAt } = panZoom;
  const grid = settings.snap ? settings.gridSize : null;

  const dragRef = useRef<Drag | null>(null);
  const [previewItem, setPreviewItem] = useState<Item | null>(null);
  const [previewOpening, setPreviewOpening] = useState<Opening | null>(null);
  /** Whole-layout preview while reshaping the room (furniture and openings follow). */
  const [previewLayout, setPreviewLayout] = useState<Layout | null>(null);
  const [cmPerPx, setCmPerPx] = useState(1);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const shown = previewLayout ?? layout;
  const { room } = shown;

  // Track the on-screen scale so handles and labels keep a constant pixel size.
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const update = () => {
      const m = svg.getScreenCTM();
      if (m && m.a > 0) setCmPerPx(1 / m.a);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(svg);
    return () => ro.disconnect();
  }, [svgRef, viewBox]);

  // Wheel zoom needs a non-passive listener to prevent page scrolling.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(Math.exp(e.deltaY * 0.0015), toWorld(svg, e.clientX, e.clientY));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [svgRef, zoomAt]);

  const items = useMemo(
    () => shown.items.map((i) => (previewItem && i.id === previewItem.id ? previewItem : i)),
    [shown.items, previewItem],
  );
  const openings = useMemo(
    () => shown.openings.map((o) => (previewOpening && o.id === previewOpening.id ? previewOpening : o)),
    [shown.openings, previewOpening],
  );
  const collisions = useMemo(() => findCollisions(items, openings, room), [items, openings, room]);
  // Rugs render underneath everything else.
  const ordered = useMemo(() => [...items.filter((i) => i.floorLevel), ...items.filter((i) => !i.floorLevel)], [items]);

  const selectedItem = selection?.kind === 'item' ? items.find((i) => i.id === selection.id) : undefined;
  const selectedWall = selection?.kind === 'wall' ? selection.index : null;

  function begin(e: PointerEvent, drag: Drag) {
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = drag;
  }

  const pointer = (e: PointerEvent) => toWorld(svgRef.current!, e.clientX, e.clientY);

  function onItemPointerDown(e: PointerEvent, item: Item) {
    if (e.button !== 0) return;
    onSelect({ kind: 'item', id: item.id });
    e.stopPropagation();
    if (item.locked) return;
    begin(e, { kind: 'item', id: item.id, start: pointer(e), rect: footprint(item), last: { x: item.x, y: item.y } });
  }

  function onHandlePointerDown(e: PointerEvent, handle: Handle) {
    if (e.button !== 0 || !selectedItem) return;
    begin(e, { kind: 'resize', id: selectedItem.id, handle });
  }

  function onOpeningPointerDown(e: PointerEvent, opening: Opening) {
    if (e.button !== 0) return;
    onSelect({ kind: 'opening', id: opening.id });
    begin(e, { kind: 'opening', id: opening.id, start: pointer(e), startOffset: opening.offset });
  }

  function onWallPointerDown(e: PointerEvent, index: number) {
    if (e.button !== 0) return;
    onSelect({ kind: 'wall', index });
    begin(e, { kind: 'wall', index, start: pointer(e), layout, edit: null });
  }

  function onCornerPointerDown(e: PointerEvent, index: number) {
    if (e.button !== 0) return;
    begin(e, { kind: 'corner', index, layout, edit: null });
  }

  function onBackgroundPointerDown(e: PointerEvent) {
    const m = svgRef.current?.getScreenCTM();
    begin(e, {
      kind: 'pan',
      startClient: { x: e.clientX, y: e.clientY },
      startVb: viewBox,
      pxPerCm: m?.a || 1,
      moved: false,
    });
  }

  function onPointerMove(e: PointerEvent) {
    const drag = dragRef.current;
    if (!drag || !svgRef.current) return;
    const current = layoutRef.current;
    if (drag.kind === 'pan') {
      const dx = e.clientX - drag.startClient.x;
      const dy = e.clientY - drag.startClient.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (drag.moved) {
        setViewBox({ ...drag.startVb, x: drag.startVb.x - dx / drag.pxPerCm, y: drag.startVb.y - dy / drag.pxPerCm });
      }
      return;
    }
    const p = pointer(e);
    if (drag.kind === 'item') {
      const item = current.items.find((i) => i.id === drag.id);
      if (!item) return;
      const desired = { x: drag.rect.x + p.x - drag.start.x, y: drag.rect.y + p.y - drag.start.y };
      drag.last = constrainDrag(item, desired, drag.last, current.room, grid);
      setPreviewItem({ ...item, ...drag.last });
    } else if (drag.kind === 'resize') {
      const item = current.items.find((i) => i.id === drag.id);
      if (!item) return;
      setPreviewItem(resizeFromHandle(item, drag.handle, p, current.room, grid));
    } else if (drag.kind === 'opening') {
      const o = current.openings.find((o) => o.id === drag.id);
      if (!o) return;
      const delta = { x: p.x - drag.start.x, y: p.y - drag.start.y };
      setPreviewOpening({ ...o, offset: dragOpeningOffset(o, drag.startOffset, delta, current.room, grid) });
    } else if (drag.kind === 'wall' || drag.kind === 'corner') {
      const edit: RoomEdit =
        drag.kind === 'wall'
          ? {
              type: 'moveWall',
              index: drag.index,
              delta: quantize(dot(sub(p, drag.start), wallFrame(drag.index, drag.layout.room).inward), grid),
            }
          : { type: 'moveCorner', index: drag.index, point: { x: quantize(p.x, grid), y: quantize(p.y, grid) } };
      // Previews skip re-basing the origin so the wall stays under the pointer.
      const next = editRoom(drag.layout, edit, false);
      if (next) {
        drag.edit = edit;
        setPreviewLayout(next);
      }
    }
  }

  function onPointerUp(e: PointerEvent) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId);
    if (!drag) return;
    if (drag.kind === 'pan') {
      if (!drag.moved) onSelect(null);
    } else if (drag.kind === 'item' && previewItem) {
      dispatch({ type: 'moveItem', id: drag.id, x: previewItem.x, y: previewItem.y });
    } else if (drag.kind === 'resize' && previewItem) {
      const { x, y, width, depth } = previewItem;
      dispatch({ type: 'updateItem', id: drag.id, patch: { x, y, width, depth } });
    } else if (drag.kind === 'opening' && previewOpening) {
      dispatch({ type: 'updateOpening', id: drag.id, patch: { offset: previewOpening.offset } });
    } else if ((drag.kind === 'wall' || drag.kind === 'corner') && drag.edit && previewLayout) {
      dispatch(drag.edit);
      // The committed room is re-based to start at (0, 0); pan by the same amount so nothing jumps.
      const b = roomBounds(previewLayout.room);
      setViewBox({ ...viewBox, x: viewBox.x - b.x, y: viewBox.y - b.y });
      if (previewLayout.room.points.length !== drag.layout.room.points.length) onSelect(null);
    }
    setPreviewItem(null);
    setPreviewOpening(null);
    setPreviewLayout(null);
  }

  const dragging = dragRef.current;
  const showGuides = previewItem && dragging && (dragging.kind === 'item' || dragging.kind === 'resize');
  const gridMinorVisible = settings.gridSize / cmPerPx >= 6;
  const floor = outlinePath(room.points);

  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      className="floor-plan"
      data-testid="floor-plan"
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
      onPointerDown={onBackgroundPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <defs data-export="skip">
        <pattern id="grid-minor" width={settings.gridSize} height={settings.gridSize} patternUnits="userSpaceOnUse">
          <path
            d={`M ${settings.gridSize} 0 L 0 0 0 ${settings.gridSize}`}
            fill="none"
            stroke="#eef0f3"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        </pattern>
        <pattern id="grid-major" width={50} height={50} patternUnits="userSpaceOnUse">
          <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#d9dde3" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </pattern>
      </defs>

      <Walls room={room} />
      <g data-export="skip" pointerEvents="none">
        {gridMinorVisible && <path d={floor} fill="url(#grid-minor)" />}
        <path d={floor} fill="url(#grid-major)" />
      </g>
      <Dimensions room={room} />
      <WallHandles
        room={room}
        selectedWall={selectedWall}
        showCorners={!selectedItem}
        cmPerPx={cmPerPx}
        onWallPointerDown={onWallPointerDown}
        onCornerPointerDown={onCornerPointerDown}
      />

      {openings.map((o) => (
        <OpeningShape
          key={o.id}
          opening={o}
          room={room}
          selected={selection?.kind === 'opening' && selection.id === o.id}
          onPointerDown={onOpeningPointerDown}
        />
      ))}

      {ordered.map((item) => (
        <FurnitureItem
          key={item.id}
          item={item}
          selected={selectedItem?.id === item.id}
          colliding={collisions.has(item.id)}
          onPointerDown={onItemPointerDown}
        />
      ))}

      {showGuides && <DragGuides rect={footprint(previewItem)} room={room} cmPerPx={cmPerPx} />}
      {selectedItem && !selectedItem.locked && (
        <ResizeHandles item={selectedItem} cmPerPx={cmPerPx} onPointerDown={onHandlePointerDown} />
      )}
    </svg>
  );
}

function toWorld(svg: SVGSVGElement, clientX: number, clientY: number): Point {
  const m = svg.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}
