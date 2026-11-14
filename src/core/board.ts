import { EMPTY, type ColorId, type OpenEdges, type Picture } from "./types";

/** A side of the board, as seen from a cell on it. */
export type Side = "top" | "right" | "bottom" | "left";

/**
 * The picture being cleared. Trucks drive in from the open board edges and only
 * through cleared space, so a cell is *reachable* when it touches an open edge or
 * an *open* empty cell: one connected to an open edge through other empty cells.
 * Transparent cells sealed inside the picture don't count until a truck can get
 * to them, so the rules always match where a truck can actually drive.
 */
export class Board {
  readonly width: number;
  readonly height: number;
  readonly cells: Int16Array;
  /** 1 for empty cells connected to an open edge. */
  private readonly open: Uint8Array;
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
    this.open = new Uint8Array(this.cells.length);
    this.tunnelX = this.width / 2;
    this.tunnelY = this.height + 2;
    this.reachable = picture.palette.map(() => new Set<number>());
    this.remainingByColor = picture.palette.map(() => 0);
    for (let i = 0; i < this.cells.length; i++) {
      if (this.cells[i] === EMPTY && this.open[i] === 0 && this.openSides(i).length > 0) this.flood(i);
    }
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if (c === EMPTY) continue;
      this.remaining++;
      this.remainingByColor[c]++;
      if (this.isExposed(i)) this.reachable[c].add(i);
    }
  }

  /** The open board edges this cell lies on (empty for interior cells). */
  openSides(i: number): Side[] {
    const x = i % this.width;
    const y = (i - x) / this.width;
    const out: Side[] = [];
    if (y === this.height - 1) out.push("bottom");
    if (this.edges !== "bottom") {
      if (x === 0) out.push("left");
      if (x === this.width - 1) out.push("right");
    }
    if (this.edges === "all" && y === 0) out.push("top");
    return out;
  }

  /** Orthogonal neighbors inside the board. */
  neighbors(i: number): number[] {
    const x = i % this.width;
    const y = (i - x) / this.width;
    const out: number[] = [];
    if (x > 0) out.push(i - 1);
    if (x < this.width - 1) out.push(i + 1);
    if (y > 0) out.push(i - this.width);
    if (y < this.height - 1) out.push(i + this.width);
    return out;
  }

  /** Is this an empty cell that trucks can drive through? */
  isOpen(i: number): boolean {
    return this.open[i] === 1;
  }

  private isExposed(i: number): boolean {
    return this.openSides(i).length > 0 || this.neighbors(i).some((n) => this.open[n] === 1);
  }

  /** Marks empty cell `i` and every empty cell connected to it as open, exposing their neighbors. */
  private flood(i: number): void {
    const stack = [i];
    this.open[i] = 1;
    while (stack.length) {
      const j = stack.pop()!;
      for (const n of this.neighbors(j)) {
        const c = this.cells[n];
        if (c !== EMPTY) {
          this.reachable[c].add(n);
        } else if (this.open[n] === 0) {
          this.open[n] = 1;
          stack.push(n);
        }
      }
    }
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
    // It was reachable, so it connects to an open edge; so does any sealed gap it touches.
    this.flood(i);
  }
}
