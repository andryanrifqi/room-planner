export interface Preset {
  key: string;
  name: string;
  width: number;
  depth: number;
  height?: number;
  color: string;
  floorLevel?: boolean;
}

export const PRESETS: Preset[] = [
  { key: 'single-bed', name: 'Single bed', width: 90, depth: 200, color: '#9fb8d6' },
  { key: 'double-bed', name: 'Double bed', width: 140, depth: 200, color: '#9fb8d6' },
  { key: 'queen-bed', name: 'Queen bed frame', width: 170, depth: 210, color: '#9fb8d6' },
  { key: 'king-bed', name: 'King bed frame', width: 190, depth: 210, color: '#9fb8d6' },
  { key: 'bedside', name: 'Bedside table', width: 45, depth: 40, color: '#c9a77c' },
  { key: 'wardrobe-2', name: 'Wardrobe 2-door', width: 120, depth: 60, color: '#b08d6a' },
  { key: 'wardrobe-3', name: 'Wardrobe 3-door', width: 150, depth: 60, color: '#b08d6a' },
  { key: 'desk', name: 'Desk', width: 100, depth: 50, color: '#d4b48c' },
  { key: 'desk-chair', name: 'Desk chair', width: 45, depth: 45, color: '#7d8a99' },
  { key: 'dresser', name: 'Dresser', width: 90, depth: 40, color: '#c29b74' },
  { key: 'bookshelf', name: 'Bookshelf', width: 80, depth: 30, color: '#a7825e' },
  { key: 'armchair', name: 'Armchair', width: 75, depth: 75, color: '#8fb39a' },
  { key: 'rug', name: 'Rug', width: 160, depth: 230, color: '#e8d9c4', floorLevel: true },
];

export function presetByKey(key: string): Preset {
  const p = PRESETS.find((p) => p.key === key);
  if (!p) throw new Error(`Unknown preset ${key}`);
  return p;
}
