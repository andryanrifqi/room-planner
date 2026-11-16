import type { Item, Room } from '../types';
import { areaStats } from '../geometry/geometry';

const m2 = (cm2: number) => (cm2 / 10000).toFixed(2);

export function Summary({ room, items, collisionCount }: { room: Room; items: Item[]; collisionCount: number }) {
  const s = areaStats(room, items);
  const pct = s.total ? Math.round((s.covered / s.total) * 100) : 0;
  return (
    <section>
      <h2>Summary</h2>
      <dl className="summary" data-testid="summary">
        <dt>Floor area</dt>
        <dd>{m2(s.total)} m²</dd>
        <dt>Furniture</dt>
        <dd>
          {m2(s.covered)} m² ({pct}%)
        </dd>
        <dt>Free</dt>
        <dd>{m2(s.free)} m²</dd>
        <dt>Conflicts</dt>
        <dd className={collisionCount ? 'bad' : undefined}>{collisionCount ? `${collisionCount} items` : 'None'}</dd>
      </dl>
      <div className="bar" aria-hidden>
        <div style={{ width: `${pct}%` }} />
      </div>
    </section>
  );
}
