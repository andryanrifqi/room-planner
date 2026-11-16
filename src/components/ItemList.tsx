import type { Item, Selection } from '../types';

interface Props {
  items: Item[];
  collisions: Set<string>;
  selection: Selection;
  onSelect: (s: Selection) => void;
}

export function ItemList({ items, collisions, selection, onSelect }: Props) {
  return (
    <section>
      <h2>Items ({items.length})</h2>
      {items.length === 0 ? (
        <p className="muted">No furniture yet. Click an item in the library to add it.</p>
      ) : (
        <table className="item-list" data-testid="item-list">
          <thead>
            <tr>
              <th>Name</th>
              <th>Size</th>
              <th>Pos</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const selected = selection?.kind === 'item' && selection.id === i.id;
              return (
                <tr
                  key={i.id}
                  className={selected ? 'selected' : undefined}
                  onClick={() => onSelect({ kind: 'item', id: i.id })}
                  data-testid="item-row"
                >
                  <td>
                    <span className={collisions.has(i.id) ? 'dot bad' : 'dot'} style={{ background: i.color }} />
                    {i.name}
                    {i.locked && ' 🔒'}
                  </td>
                  <td>
                    {i.width}×{i.depth}
                    {i.rotation ? ` · ${i.rotation}°` : ''}
                  </td>
                  <td>
                    {i.x}, {i.y}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
