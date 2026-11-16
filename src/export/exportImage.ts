import type { Room } from '../types';
import { PLAN_MARGIN } from '../hooks/usePanZoom';
import { roomBounds } from '../geometry/room';

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(name: string): string {
  return name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'layout';
}

/**
 * Serialize the on-screen plan as a standalone SVG framed on the room, without the grid,
 * selection outline, handles or guides. 1 unit = 1 cm; the default output size is 2 px per cm.
 */
export function buildPlanSvg(svg: SVGSVGElement, room: Room, pxPerCm = 2): { text: string; width: number; height: number } {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('[data-export="skip"]').forEach((el) => el.remove());
  const b = roomBounds(room);
  const m = PLAN_MARGIN;
  const w = b.w + 2 * m;
  const h = b.h + 2 * m;
  clone.setAttribute('viewBox', `${b.x - m} ${b.y - m} ${w} ${h}`);
  clone.setAttribute('width', String(w * pxPerCm));
  clone.setAttribute('height', String(h * pxPerCm));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.removeAttribute('class');
  clone.removeAttribute('style');
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', String(b.x - m));
  bg.setAttribute('y', String(b.y - m));
  bg.setAttribute('width', String(w));
  bg.setAttribute('height', String(h));
  bg.setAttribute('fill', '#ffffff');
  clone.insertBefore(bg, clone.firstChild);
  return { text: new XMLSerializer().serializeToString(clone), width: w * pxPerCm, height: h * pxPerCm };
}

export function exportSvg(svg: SVGSVGElement, room: Room, name: string): void {
  const { text } = buildPlanSvg(svg, room);
  downloadBlob(new Blob([text], { type: 'image/svg+xml' }), `${safeFilename(name)}.svg`);
}

export async function exportPng(svg: SVGSVGElement, room: Room, name: string): Promise<void> {
  const { text, width, height } = buildPlanSvg(svg, room, 3);
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text);
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG encoding failed');
  downloadBlob(blob, `${safeFilename(name)}.png`);
}
