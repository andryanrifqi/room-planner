export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Room outline: a polygon whose walls all meet at right angles, listed clockwise on screen.
 * The bounding box's top-left corner is (0, 0). Wall i runs from points[i] to points[i + 1].
 */
export interface Room {
  points: Point[];
}

/** Degrees clockwise, a multiple of 45 in [0, 360). */
export type Rotation = number;

export interface DoorOpening {
  id: string;
  kind: 'door';
  /** Index of the wall (see Room). */
  wall: number;
  /** Distance from the wall's start point. */
  offset: number;
  width: number;
  /** Which end of the opening the hinge is on, along the wall's direction. */
  hinge: 'start' | 'end';
  swing: 'in' | 'out';
}

export interface WindowOpening {
  id: string;
  kind: 'window';
  wall: number;
  offset: number;
  width: number;
}

export type Opening = DoorOpening | WindowOpening;

export interface Item {
  id: string;
  name: string;
  /** Unrotated size. The "back" of the item is along its width edge. */
  width: number;
  depth: number;
  height?: number;
  color: string;
  /** Top-left corner of the rotated item's bounding box, relative to the room's top-left corner. */
  x: number;
  y: number;
  rotation: Rotation;
  locked: boolean;
  /** Floor-level items (rugs) are ignored by collision detection and covered-area stats. */
  floorLevel?: boolean;
}

export interface Layout {
  id: string;
  name: string;
  room: Room;
  openings: Opening[];
  items: Item[];
}

export interface Settings {
  snap: boolean;
  gridSize: number;
}

export type Selection =
  | { kind: 'item'; id: string }
  | { kind: 'opening'; id: string }
  | { kind: 'wall'; index: number }
  | null;
