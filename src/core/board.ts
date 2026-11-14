import { EMPTY, type ColorId, type OpenEdges, type Picture } from "./types";

/**
 * The picture being cleared. A cell is *reachable* when it touches an open board
 * edge or an empty (cleared / transparent) cell, so the picture is cleared from
 * the outside in.
 */
export class Board {
  readonly width: number;
  readonly height: number;
  readonly cells: Int16Array;
  /** Reachable cell indices, per color. */
  private readonly reachable: Set<number>[];
  private readonly remainingByColor: number[];
  remaining = 0;
  /** Point (in cell units) where the trucks' tunnel is; cubes nearest to it go first. */
  readonly tunnelX: number;
  readonly tunnelY: number;
  readonly edges: OpenEdges;

  constructor(picture: Picture, edges: OpenEdges = "all") {
    this.edges = edges;
    this.width = picture.width;
    this.height = picture.height;
    this.cells = Int16Array.from(picture.cells);
    this.tunnelX = this.width / 2;
    this.tunnelY = this.height + 2;
    this.reachable = picture.palette.map(() => new Set<number>());
    this.remainingByColor = picture.palette.map(() => 0);
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if (c === EMPTY) continue;
      this.remaining++;
      this.remainingByColor[c]++;
      if (this.isExposed(i)) this.reachable[c].add(i);
    }
  }

  private isExposed(i: number): boolean {
    const x = i % this.width;
    const y = (i - x) / this.width;
    if (y === this.height - 1) return true;
    if (this.edges !== "bottom" && (x === 0 || x === this.width - 1)) return true;
    if (this.edges === "all" && y === 0) return true;
    return (
      (x > 0 && this.cells[i - 1] === EMPTY) ||
      (x < this.width - 1 && this.cells[i + 1] === EMPTY) ||
      (y > 0 && this.cells[i - this.width] === EMPTY) ||
      (y < this.height - 1 && this.cells[i + this.width] === EMPTY)
    );
  }

  reachableCount(color: ColorId): number {
    return this.reachable[color]?.size ?? 0;
  }

  /** Snapshot of the reachable cells of one color. */
  reachableCells(color: ColorId): number[] {
    return [...(this.reachable[color] ?? [])];
  }

  remainingOf(color: ColorId): number {
    return this.remainingByColor[color] ?? 0;
  }

  /** The reachable cell of `color` nearest the tunnel, or -1 if none. Deterministic. */
  pickTarget(color: ColorId): number {
    let best = -1;
    let bestD = Infinity;
    for (const i of this.reachable[color]) {
      const x = (i % this.width) + 0.5 - this.tunnelX;
      const y = Math.floor(i / this.width) + 0.5 - this.tunnelY;
      const d = x * x + y * y;
      if (d < bestD || (d === bestD && i < best)) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  eat(i: number): void {
    const c = this.cells[i];
    if (c === EMPTY) throw new Error(`cell ${i} is already empty`);
    if (!this.reachable[c].has(i)) throw new Error(`cell ${i} is not reachable`);
    this.cells[i] = EMPTY;
    this.reachable[c].delete(i);
    this.remaining--;
    this.remainingByColor[c]--;
    const x = i % this.width;
    const y = (i - x) / this.width;
    if (x > 0) this.expose(i - 1);
    if (x < this.width - 1) this.expose(i + 1);
    if (y > 0) this.expose(i - this.width);
    if (y < this.height - 1) this.expose(i + this.width);
  }

  private expose(i: number): void {
    const c = this.cells[i];
    if (c !== EMPTY) this.reachable[c].add(i);
  }
}
