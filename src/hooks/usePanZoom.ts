import { useCallback, useEffect, useRef, useState } from 'react';
import type { Point, Room } from '../types';
import { clamp } from '../geometry/geometry';
import { roomBounds } from '../geometry/room';

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Space around the room for walls and dimension labels, in cm. */
export const PLAN_MARGIN = 70;

export function fitViewBox(room: Room): ViewBox {
  const b = roomBounds(room);
  return { x: b.x - PLAN_MARGIN, y: b.y - PLAN_MARGIN, w: b.w + 2 * PLAN_MARGIN, h: b.h + 2 * PLAN_MARGIN };
}

export interface PanZoom {
  viewBox: ViewBox;
  setViewBox: (vb: ViewBox) => void;
  /** Zoom by `factor` (<1 zooms in) keeping point `at` (world coords) fixed on screen. */
  zoomAt: (factor: number, at?: Point) => void;
  fit: () => void;
  zoomPercent: number;
}

/** `fitKey`: the view re-fits the room whenever this changes (e.g. switching layouts). */
export function usePanZoom(room: Room, fitKey: string): PanZoom {
  const [viewBox, setViewBox] = useState<ViewBox>(() => fitViewBox(room));
  const roomRef = useRef(room);
  roomRef.current = room;
  const fit = useCallback(() => setViewBox(fitViewBox(roomRef.current)), []);

  useEffect(fit, [fit, fitKey]);

  const zoomAt = useCallback((factor: number, at?: Point) => {
    setViewBox((v) => {
      const c = at ?? { x: v.x + v.w / 2, y: v.y + v.h / 2 };
      const w = clamp(v.w * factor, 40, 20000);
      const f = w / v.w;
      return { x: c.x - (c.x - v.x) * f, y: c.y - (c.y - v.y) * f, w, h: v.h * f };
    });
  }, []);

  const zoomPercent = Math.round((fitViewBox(room).w / viewBox.w) * 100);
  return { viewBox, setViewBox, zoomAt, fit, zoomPercent };
}
