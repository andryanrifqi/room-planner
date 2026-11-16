import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Item, Layout, Selection, Settings } from './types';
import { historyReducer, initHistory } from './state/history';
import type { LayoutAction } from './state/reducer';
import { layoutFromJson, layoutToJson, loadState, saveState } from './state/storage';
import { emptyLayout } from './state/seed';
import { uid } from './state/uid';
import { findCollisions, freeSpotFor } from './geometry/geometry';
import { roomBounds, wallFrame } from './geometry/room';
import { usePanZoom } from './hooks/usePanZoom';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { Toolbar } from './components/Toolbar';
import { LibraryPanel, type NewItemSpec } from './components/LibraryPanel';
import { PropertiesPanel } from './components/PropertiesPanel';
import { ItemList } from './components/ItemList';
import { Summary } from './components/Summary';
import { FloorPlan } from './components/plan/FloorPlan';
import { downloadBlob, exportPng, exportSvg, safeFilename } from './export/exportImage';

export default function App() {
  const [initial] = useState(loadState);
  const [layouts, setLayouts] = useState<Layout[]>(initial.layouts);
  const [settings, setSettings] = useState<Settings>(initial.settings);
  const [history, dispatchHistory] = useReducer(historyReducer, initial, (s) =>
    initHistory(s.layouts.find((l) => l.id === s.activeId) ?? s.layouts[0]),
  );
  const [selection, setSelection] = useState<Selection>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const layout = history.present;
  const dispatch = (a: LayoutAction) => dispatchHistory(a);
  // Bumped to re-fit the view after the room's overall shape or size changes.
  const [fitTick, setFitTick] = useState(0);
  const panZoom = usePanZoom(layout.room, `${layout.id}:${fitTick}`);

  /** All layouts, with the active one replaced by its live (possibly edited) version. */
  const allLayouts = useMemo(() => layouts.map((l) => (l.id === layout.id ? layout : l)), [layouts, layout]);

  // Autosave on every change.
  useEffect(() => {
    saveState({ version: 1, activeId: layout.id, layouts: allLayouts, settings });
  }, [allLayouts, layout.id, settings]);

  // Drop selections that no longer exist (e.g. after undoing an add).
  const validSelection: Selection =
    selection?.kind === 'item' && !layout.items.some((i) => i.id === selection.id)
      ? null
      : selection?.kind === 'opening' && !layout.openings.some((o) => o.id === selection.id)
        ? null
        : selection?.kind === 'wall' && selection.index >= layout.room.points.length
          ? null
          : selection;

  const collisions = useMemo(() => findCollisions(layout.items, layout.openings, layout.room), [layout]);
  const grid = settings.snap ? settings.gridSize : 1;

  // --- item operations ------------------------------------------------------

  function addItem(spec: NewItemSpec) {
    const b = roomBounds(layout.room);
    const w = Math.min(spec.width, b.w);
    const d = Math.min(spec.depth, b.h);
    // Rugs go in the middle (the reducer moves them inside if the middle is outside the room).
    const pos = spec.floorLevel
      ? { x: Math.round(b.x + (b.w - w) / 2), y: Math.round(b.y + (b.h - d) / 2) }
      : freeSpotFor(w, d, layout.items, layout.openings, layout.room, Math.max(grid, 5));
    const item: Item = {
      id: uid(),
      name: spec.name,
      width: spec.width,
      depth: spec.depth,
      color: spec.color,
      x: pos.x,
      y: pos.y,
      rotation: 0,
      locked: false,
    };
    if (spec.height) item.height = spec.height;
    if (spec.floorLevel) item.floorLevel = true;
    dispatch({ type: 'addItem', item });
    setSelection({ kind: 'item', id: item.id });
  }

  function duplicateItem(id: string) {
    const newId = uid();
    dispatch({ type: 'duplicateItem', id, newId });
    setSelection({ kind: 'item', id: newId });
  }

  function deleteSelection() {
    if (!validSelection) return;
    if (validSelection.kind === 'item') dispatch({ type: 'deleteItem', id: validSelection.id });
    else if (validSelection.kind === 'opening') dispatch({ type: 'deleteOpening', id: validSelection.id });
    else return; // walls can't be deleted, only reshaped
    setSelection(null);
  }

  useKeyboardShortcuts({
    undo: () => dispatchHistory({ type: 'undo' }),
    redo: () => dispatchHistory({ type: 'redo' }),
    rotate: (dir) => validSelection?.kind === 'item' && dispatch({ type: 'rotateItem', id: validSelection.id, dir }),
    remove: deleteSelection,
    duplicate: () => validSelection?.kind === 'item' && duplicateItem(validSelection.id),
    nudge: (dx, dy, useGrid) => {
      if (!validSelection) return;
      const step = useGrid ? settings.gridSize : 1;
      if (validSelection.kind === 'item') {
        dispatch({ type: 'nudgeItem', id: validSelection.id, dx: dx * step, dy: dy * step, coalesce: `nudge:${validSelection.id}` });
      } else if (validSelection.kind === 'opening') {
        const o = layout.openings.find((o) => o.id === validSelection.id);
        if (!o) return;
        const { dir } = wallFrame(o.wall, layout.room);
        const along = Math.round(dx * dir.x + dy * dir.y);
        if (along) {
          dispatch({ type: 'updateOpening', id: o.id, patch: { offset: o.offset + along * step }, coalesce: `nudge:${o.id}` });
        }
      }
    },
    deselect: () => setSelection(null),
    zoomIn: () => panZoom.zoomAt(1 / 1.2),
    zoomOut: () => panZoom.zoomAt(1.2),
    fit: panZoom.fit,
  });

  // --- layout management ----------------------------------------------------

  function switchTo(next: Layout, list: Layout[]) {
    setLayouts(list);
    dispatchHistory({ type: 'reset', layout: next });
    setSelection(null);
  }

  function uniqueName(base: string) {
    const names = new Set(allLayouts.map((l) => l.name));
    if (!names.has(base)) return base;
    let n = 2;
    while (names.has(`${base} ${n}`)) n++;
    return `${base} ${n}`;
  }

  function onSwitch(id: string) {
    const next = allLayouts.find((l) => l.id === id);
    if (next && id !== layout.id) switchTo(next, allLayouts);
  }

  function onNewLayout() {
    const name = window.prompt('Name for the new layout:', uniqueName('New layout'));
    if (!name?.trim()) return;
    const next = emptyLayout(name.trim());
    switchTo(next, [...allLayouts, next]);
  }

  function onRenameLayout() {
    const name = window.prompt('Rename layout:', layout.name);
    if (name?.trim()) dispatch({ type: 'renameLayout', name });
  }

  function onDuplicateLayout() {
    const copy: Layout = { ...structuredClone(layout), id: uid(), name: uniqueName(`${layout.name} copy`) };
    switchTo(copy, [...allLayouts, copy]);
  }

  function onDeleteLayout() {
    if (allLayouts.length < 2) return;
    if (!window.confirm(`Delete layout "${layout.name}"? This cannot be undone.`)) return;
    const rest = allLayouts.filter((l) => l.id !== layout.id);
    switchTo(rest[0], rest);
  }

  function onExportJson() {
    downloadBlob(new Blob([layoutToJson(layout)], { type: 'application/json' }), `${safeFilename(layout.name)}.json`);
  }

  async function onImportJson(file: File) {
    try {
      const imported = layoutFromJson(await file.text());
      imported.name = uniqueName(imported.name);
      switchTo(imported, [...allLayouts, imported]);
    } catch (err) {
      window.alert(`Could not import layout: ${(err as Error).message}`);
    }
  }

  function withSvg(fn: (svg: SVGSVGElement) => unknown) {
    if (!svgRef.current) return;
    // Clear the selection first so the export doesn't show it, then export after re-render.
    setSelection(null);
    requestAnimationFrame(() => {
      Promise.resolve(fn(svgRef.current!)).catch((err) => window.alert(`Export failed: ${(err as Error).message}`));
    });
  }

  return (
    <div className="app">
      <Toolbar
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onUndo={() => dispatchHistory({ type: 'undo' })}
        onRedo={() => dispatchHistory({ type: 'redo' })}
        settings={settings}
        onSettings={setSettings}
        zoomPercent={panZoom.zoomPercent}
        onZoomIn={() => panZoom.zoomAt(1 / 1.2)}
        onZoomOut={() => panZoom.zoomAt(1.2)}
        onFit={panZoom.fit}
        layouts={allLayouts}
        activeId={layout.id}
        onSwitch={onSwitch}
        onNewLayout={onNewLayout}
        onRenameLayout={onRenameLayout}
        onDuplicateLayout={onDuplicateLayout}
        onDeleteLayout={onDeleteLayout}
        onExportJson={onExportJson}
        onImportJson={onImportJson}
        onExportPng={() => withSvg((svg) => exportPng(svg, layout.room, layout.name))}
        onExportSvg={() => withSvg((svg) => exportSvg(svg, layout.room, layout.name))}
      />
      <LibraryPanel onAdd={addItem} />
      <main className="canvas">
        <FloorPlan
          layout={layout}
          settings={settings}
          selection={validSelection}
          onSelect={setSelection}
          dispatch={dispatch}
          panZoom={panZoom}
          svgRef={svgRef}
        />
        <div className="hint">Drag to move · drag empty space to pan · scroll to zoom · R rotate · Del delete</div>
      </main>
      <aside className="sidebar right">
        <PropertiesPanel
          layout={layout}
          selection={validSelection}
          dispatch={dispatch}
          onSelect={setSelection}
          onDuplicate={duplicateItem}
          onDelete={deleteSelection}
          onRoomReshaped={() => setFitTick((t) => t + 1)}
        />
        <Summary room={layout.room} items={layout.items} collisionCount={collisions.size} />
        <ItemList items={layout.items} collisions={collisions} selection={validSelection} onSelect={setSelection} />
      </aside>
    </div>
  );
}
