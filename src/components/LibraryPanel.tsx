import { useState, type FormEvent } from 'react';
import { PRESETS, type Preset } from '../state/presets';

export interface NewItemSpec {
  name: string;
  width: number;
  depth: number;
  height?: number;
  color: string;
  floorLevel?: boolean;
}

export function LibraryPanel({ onAdd }: { onAdd: (spec: NewItemSpec) => void }) {
  return (
    <aside className="sidebar left">
      <section>
        <h2>Furniture</h2>
        <ul className="preset-list">
          {PRESETS.map((p: Preset) => (
            <li key={p.key}>
              <button className="preset" onClick={() => onAdd(p)} data-testid={`preset-${p.key}`}>
                <span className="swatch" style={{ background: p.color }} />
                <span className="preset-name">{p.name}</span>
                <span className="preset-size">
                  {p.width}×{p.depth}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <CustomItemForm onAdd={onAdd} />
    </aside>
  );
}

function CustomItemForm({ onAdd }: { onAdd: (spec: NewItemSpec) => void }) {
  const [name, setName] = useState('');
  const [width, setWidth] = useState('60');
  const [depth, setDepth] = useState('60');
  const [height, setHeight] = useState('');
  const [color, setColor] = useState('#a3b8cc');
  const [error, setError] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    const w = Number(width);
    const d = Number(depth);
    const h = height.trim() ? Number(height) : undefined;
    if (!name.trim()) return setError('Enter a name.');
    if (!(w >= 5) || !(d >= 5)) return setError('Width and depth must be at least 5 cm.');
    if (h !== undefined && !(h > 0)) return setError('Height must be a positive number.');
    setError('');
    onAdd({ name: name.trim(), width: w, depth: d, height: h, color });
    setName('');
  }

  return (
    <section>
      <h2>Add custom item</h2>
      <form className="custom-form" onSubmit={submit}>
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} data-testid="custom-name" />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Width</span>
            <input type="number" value={width} onChange={(e) => setWidth(e.target.value)} data-testid="custom-width" />
          </label>
          <label className="field">
            <span>Depth</span>
            <input type="number" value={depth} onChange={(e) => setDepth(e.target.value)} data-testid="custom-depth" />
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            <span>Height (opt.)</span>
            <input type="number" value={height} onChange={(e) => setHeight(e.target.value)} />
          </label>
          <label className="field">
            <span>Color</span>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary" data-testid="custom-add">
          Add item
        </button>
      </form>
    </section>
  );
}
