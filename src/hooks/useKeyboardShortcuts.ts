import { useEffect, useRef } from 'react';

export interface ShortcutHandlers {
  undo: () => void;
  redo: () => void;
  rotate: (dir: 1 | -1) => void;
  remove: () => void;
  duplicate: () => void;
  nudge: (dx: number, dy: number, useGrid: boolean) => void;
  deselect: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'color', 'file'].includes(target.type);
  }
  return false;
}

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isEditable(e.target)) return;
      const h = ref.current;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) h.redo();
        else h.undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        h.redo();
      } else if (mod && key === 'd') {
        e.preventDefault();
        h.duplicate();
      } else if (mod) {
        return;
      } else if (key === 'r' && !e.altKey) {
        e.preventDefault();
        h.rotate(e.shiftKey ? -1 : 1);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        h.remove();
      } else if (e.key in ARROWS) {
        e.preventDefault();
        const [dx, dy] = ARROWS[e.key];
        h.nudge(dx, dy, e.shiftKey);
      } else if (e.key === 'Escape') {
        h.deselect();
      } else if (e.key === '+' || e.key === '=') {
        h.zoomIn();
      } else if (e.key === '-') {
        h.zoomOut();
      } else if (e.key === '0') {
        h.fit();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
