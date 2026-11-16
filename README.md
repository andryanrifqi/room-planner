# Room Planner

A top-down 2D furniture layout planner. Everything is measured in centimeters and drawn as SVG
(1 SVG unit = 1 cm). No backend — layouts are saved in your browser's localStorage.

## Running it

Requires Node.js 18+.

```bash
npm install
npm run dev          # http://localhost:5173
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run build` | Type-check and build a static site into `dist/` |
| `npm run preview` | Serve the built site |
| `npm test` | Unit tests (Vitest) for geometry, history and import/export |
| `npm run e2e` | End-to-end tests (Playwright, Chromium). Run `npx playwright install chromium` once first. |

## Using it

- **Add furniture**: click a preset in the left sidebar, or fill in *Add custom item*. New items are
  placed in the first free spot that doesn't overlap furniture or a door swing.
- **Select**: click an item on the plan or in the item list.
- **Move**: drag an item (mouse, pen or touch). Items snap to the grid when *Snap* is on and can't
  leave the room. While dragging, dashed lines show the distance to each wall.
- **Rotate**: in 45° steps with `R` / `Shift+R` or the ⟳ / ⟲ buttons. Angled items collide and
  stay inside the walls by their real outline, not their bounding box.
- **Resize**: drag a corner handle (changes width and depth) or an edge handle (one dimension), or
  type the size in the properties panel. Handles follow the item's rotation.
- **Room shape**: rooms can be any shape whose walls meet at right angles (L, U, T, alcoves…).
  With nothing selected, the right panel offers *Rectangle / L / U / T* starting shapes (keeping the
  overall size), the overall width and depth, and a list of walls.
  - Drag a wall on the plan to move it; the walls joining it stretch or shrink.
  - Drag a corner handle (the small squares, shown when no item is selected) to move a corner.
  - Select a wall to type its length (this moves the wall at its far end) or to *Split wall*:
    that adds two corners in the middle, and dragging one half then makes an alcove or bump-out.
  - Edits that would make walls cross are refused. Furniture that ends up outside is moved to the
    nearest spot inside; doors and windows stay where they were on their wall.
- **Doors and windows**: add them from the room panel or a selected wall. Drag an opening along its
  wall, or select it to change the wall, width, offset, and for doors the hinge side and swing
  direction.
- **Collisions**: items that overlap another item or a door's swing area turn red. Items marked
  *floor-level* (rugs) are ignored.
- **Pan and zoom**: drag empty space to pan, scroll to zoom around the cursor, or use the toolbar.
- **Layouts**: the toolbar dropdown switches between named layouts; *New / Rename / Duplicate /
  Delete* manage them. Every change is autosaved.
- **Import / export**: *Import* and *JSON* load and save a single layout as JSON. *PNG* and *SVG*
  export the plan (without grid and selection).

The darker band along one edge of each item marks its back (headboard, wardrobe back, desk back).

## Keyboard shortcuts

Shortcuts are ignored while typing in a text field.

| Keys | Action |
| --- | --- |
| `R` / `Shift+R` | Rotate selected item 45° clockwise / counter-clockwise |
| `Delete` / `Backspace` | Delete selected item or opening |
| `Ctrl/Cmd+D` | Duplicate selected item |
| Arrow keys | Nudge selection 1 cm |
| `Shift` + arrow keys | Nudge selection by the grid size |
| `Ctrl/Cmd+Z` | Undo |
| `Ctrl/Cmd+Shift+Z` or `Ctrl+Y` | Redo |
| `Esc` | Deselect |
| `+` / `-` / `0` | Zoom in / out / fit room |

Locked items can't be moved, rotated, resized or nudged, but can still be renamed, recolored and
deleted. Fields in the properties panel apply to the selected item as you type. Typing in one
field, consecutive nudges of the same item, and dragging the color picker each make one undo step.
(Room sizes and wall lengths apply on Enter or when you leave the field, so a half-typed value
doesn't shrink the room and push furniture around.)

## Code layout

```
src/
  types.ts                  Room, Opening, Item, Layout types
  geometry/geometry.ts      Pure item geometry: rotated outlines, snapping, keeping items inside
                            the room, resizing, door swing sectors, collisions, free spots, areas
  geometry/room.ts          Room outlines: walls, presets, moving walls/corners, splitting,
                            cleanup, and remapping openings when the outline changes
  geometry/polygon.ts       Vector and polygon helpers (point-in-polygon, clipping, SAT overlap)
  state/reducer.ts          Layout reducer (every edit is an action)
  state/roomOps.ts          Room edits applied to a whole layout (openings and furniture follow)
  state/history.ts          Undo/redo wrapper: { past, present, future }
  state/storage.ts          localStorage persistence, JSON import/export validation
  state/presets.ts, seed.ts Furniture presets and the first-run layout
  hooks/                    Pan/zoom and keyboard shortcuts
  components/               Toolbar, sidebars, properties, item list, summary
  components/plan/          SVG floor plan: walls, openings, furniture, handles, drag guides
  export/exportImage.ts     SVG and PNG export
e2e/planner.spec.ts         Playwright tests
```

Coordinates: the room's bounding box starts at (0, 0), x grows right, y grows down. The room is a
list of corner points going clockwise; wall *i* runs from point *i* to point *i + 1*. Openings store
a wall index and an offset from that wall's start point. An item's `x, y` is the top-left of its
rotated bounding box; `width × depth` is its unrotated size and `rotation` is in degrees (multiples
of 45). Layouts saved by earlier versions (rectangular `width × depth` rooms, named walls) are
converted when loaded.
