import { useRef } from 'react';
import type { Layout, Settings } from '../types';

const GRID_SIZES = [1, 2, 5, 10, 25, 50];

interface Props {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  settings: Settings;
  onSettings: (s: Settings) => void;
  zoomPercent: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  layouts: Layout[];
  activeId: string;
  onSwitch: (id: string) => void;
  onNewLayout: () => void;
  onRenameLayout: () => void;
  onDuplicateLayout: () => void;
  onDeleteLayout: () => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onExportPng: () => void;
  onExportSvg: () => void;
}

export function Toolbar(p: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <header className="toolbar">
      <div className="group">
        <strong className="brand">Room Planner</strong>
      </div>
      <div className="group">
        <button onClick={p.onUndo} disabled={!p.canUndo} title="Undo (Ctrl/Cmd+Z)" data-testid="undo">
          ↶ Undo
        </button>
        <button onClick={p.onRedo} disabled={!p.canRedo} title="Redo (Ctrl/Cmd+Shift+Z)" data-testid="redo">
          ↷ Redo
        </button>
      </div>
      <div className="group">
        <label className="checkbox inline">
          <input
            type="checkbox"
            checked={p.settings.snap}
            onChange={(e) => p.onSettings({ ...p.settings, snap: e.target.checked })}
            data-testid="snap"
          />
          Snap
        </label>
        <label className="inline">
          Grid
          <select
            value={p.settings.gridSize}
            onChange={(e) => p.onSettings({ ...p.settings, gridSize: Number(e.target.value) })}
            data-testid="grid-size"
          >
            {GRID_SIZES.map((g) => (
              <option key={g} value={g}>
                {g} cm
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="group">
        <button onClick={p.onZoomOut} title="Zoom out (-)">
          −
        </button>
        <span className="zoom" data-testid="zoom">
          {p.zoomPercent}%
        </span>
        <button onClick={p.onZoomIn} title="Zoom in (+)">
          +
        </button>
        <button onClick={p.onFit} title="Fit room (0)">
          Fit
        </button>
      </div>
      <div className="group">
        <select value={p.activeId} onChange={(e) => p.onSwitch(e.target.value)} title="Switch layout" data-testid="layout-select">
          {p.layouts.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <button onClick={p.onNewLayout} title="New empty layout">
          New
        </button>
        <button onClick={p.onRenameLayout}>Rename</button>
        <button onClick={p.onDuplicateLayout}>Duplicate</button>
        <button onClick={p.onDeleteLayout} disabled={p.layouts.length < 2}>
          Delete
        </button>
      </div>
      <div className="group">
        <button onClick={() => fileRef.current?.click()} title="Import a layout from JSON">
          Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) p.onImportJson(f);
            e.target.value = '';
          }}
        />
        <button onClick={p.onExportJson}>JSON</button>
        <button onClick={p.onExportPng}>PNG</button>
        <button onClick={p.onExportSvg}>SVG</button>
      </div>
    </header>
  );
}
