/** Index into a level's palette. */
export type ColorId = number;

/** Board edges ants can enter from; see Board. */
export type OpenEdges = "all" | "sides" | "bottom";

/** Marker for a cell that is empty (never part of the picture, or already eaten). */
export const EMPTY = -1;

/** A pixel picture: the raw input for a level. */
export interface Picture {
  name: string;
  width: number;
  height: number;
  /** Row-major color ids, EMPTY for transparent cells. Length = width * height. */
  cells: Int16Array;
  /** CSS colors, indexed by ColorId. */
  palette: string[];
}

/** A tray block: `count` ants of one color. */
export interface Block {
  id: number;
  color: ColorId;
  count: number;
}

/** A playable level: a picture plus the tray of blocks that will eat it. */
export interface Level {
  picture: Picture;
  /** Tray columns; index 0 of each column is the front (tappable) block. */
  columns: Block[][];
  slotCount: number;
  edges: OpenEdges;
}

export function cloneLevel(level: Level): Level {
  return {
    picture: level.picture,
    slotCount: level.slotCount,
    edges: level.edges,
    columns: level.columns.map((col) => col.map((b) => ({ ...b }))),
  };
}
