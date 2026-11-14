import { EMPTY, type ColorId, type OpenEdges, type Picture } from "./types";

/** A side of the board, as seen from a cell on it. */
export type Side = "top" | "right" | "bottom" | "left";

/**
 * The picture being cleared. Trucks drive in from the open board edges and only
 * through cleared space, so a cell is *reachable* when it touches an open edge or
 * an *open* empty cell: one connected to an open edge through other empty cells.
 * Transparent cells sealed inside the picture don't count until a truck can get
 * to them, so the rules always match where a truck can actually drive.
 *
 * Cubes touching the road go first, from the middle out: each truck takes the
 * reachable cube of its color that is fewest cells in from an open edge, then
 * the one with the shortest drive along the road from the ramp (which sits below
 * the middle of the bottom edge).
 */
export class Board {
  readonly width: number;
  readonly height: number;
  readonly cells: Int16Array;
  /** 1 for empty cells connected to an open edge. */
  private readonly open: Uint8Array;
  /** 1 for cubes a truck has been sent for but hasn't picked up yet. */
  private readonly claimed: Uint8Array;
  /** How many cubes are claimed but not yet picked up. */
  pending = 0;
  /** Reachable cell indices, per color. */
  private readonly reachable: Set<number>[];
  private readonly remainingByColor: number[];
  /** Cubes still on the board, including claimed ones not yet picked up. */
  remaining = 0;
  readonly edges: OpenEdges;
  /** For open cells, along their shortest drive from the ramp: cells driven inside the field (0 = on the edge). */
  private readonly depth: Int32Array;
  /** ...and the road distance (in cells) before that. The drive is depth + road. */
  private readonly road: Float32Array;

  constructor(picture: Picture, edges: OpenEdges = "all") {
    this.edges = edges;
    this.width = picture.width;
    this.height = picture.height;
    this.cells = Int16Array.from(picture.cells);
    this.open = new Uint8Array(this.cells.length);
    this.claimed = new Uint8Array(this.cells.length);
    this.depth = new Int32Array(this.cells.length).fill(1 << 30);
    this.road = new Float32Array(this.cells.length).fill(Infinity);
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
    const opened = [i];
    this.open[i] = 1;
    while (stack.length) {
      const j = stack.pop()!;
      for (const n of this.neighbors(j)) {
        const c = this.cells[n];
        if (c !== EMPTY) {
          // A claimed cube already has a truck coming for it; don't offer it again.
          if (this.claimed[n] === 0) this.reachable[c].add(n);
        } else if (this.open[n] === 0) {
          this.open[n] = 1;
          stack.push(n);
          opened.push(n);
        }
      }
    }
    this.updateDepths(opened);
  }

  /** Road distance (in cells) from the ramp, below the middle of the bottom edge, to a cell's side. */
  private roadTo(i: number, side: Side): number {
    const x = (i % this.width) + 0.5;
    const y = Math.floor(i / this.width) + 0.5;
    const mid = this.width / 2;
    switch (side) {
      case "bottom":
        return Math.abs(x - mid);
      case "left":
      case "right":
        return mid + (this.height - y);
      case "top":
        return mid + this.height + Math.min(x, this.width - x);
    }
  }

  /**
   * Is a way in of d1 cells inside after r1 of road better than (d2, r2)? Fewer
   * cells in from the road wins; on a tie, the shorter road.
   */
  private static better(d1: number, r1: number, d2: number, r2: number): boolean {
    return d1 < d2 || (d1 === d2 && r1 < r2);
  }

  /**
   * Updates the shortest drive to newly opened cells, and to any open cells that
   * now have a shorter one through them. Opening cells only ever shortens drives,
   * so this only touches the area around the change.
   */
  private updateDepths(opened: number[]): void {
    const queue: number[] = [];
    for (const i of opened) {
      for (const side of this.openSides(i)) {
        const r = this.roadTo(i, side);
        if (Board.better(0, r, this.depth[i], this.road[i])) {
          this.depth[i] = 0;
          this.road[i] = r;
        }
      }
      for (const n of this.neighbors(i)) {
        if (this.open[n] === 1 && Board.better(this.depth[n] + 1, this.road[n], this.depth[i], this.road[i])) {
          this.depth[i] = this.depth[n] + 1;
          this.road[i] = this.road[n];
        }
      }
      queue.push(i);
    }
    for (let q = 0; q < queue.length; q++) {
      const u = queue[q];
      for (const n of this.neighbors(u)) {
        if (this.open[n] !== 1) continue;
        if (Board.better(this.depth[u] + 1, this.road[u], this.depth[n], this.road[n])) {
          this.depth[n] = this.depth[u] + 1;
          this.road[n] = this.road[u];
          queue.push(n);
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

  /**
   * The next cube of `color` for a truck, or -1 if none can go now: the one fewest
   * cells in from the road, then the shortest drive from the ramp (so a row goes
   * from the middle out to the sides), then the lowest index (deterministic).
   */
  pickTarget(color: ColorId): number {
    let best = -1;
    let bestDepth = Infinity;
    let bestRoad = Infinity;
    for (const i of this.reachable[color]) {
      this.wayIn(i);
      const d = this.wayDepth;
      const r = this.wayRoad;
      if (Board.better(d, r, bestDepth, bestRoad) || (d === bestDepth && r === bestRoad && i < best)) {
        bestDepth = d;
        bestRoad = r;
        best = i;
      }
    }
    return best;
  }

  /** Results of wayIn(), kept in fields so the hot path allocates nothing. */
  private wayDepth = Infinity;
  private wayRoad = Infinity;

  /**
   * How a truck gets to cube i: cells in from the road (wayDepth) and road distance
   * from the ramp (wayRoad), either straight in from an open edge or through its
   * best cleared neighbor. Hot path (the level generator runs it millions of times).
   */
  private wayIn(i: number): void {
    const w = this.width;
    const h = this.height;
    const open = this.open;
    const depth = this.depth;
    const road = this.road;
    const mid = w / 2;
    const x = i % w;
    const y = (i - x) / w;
    let d = Infinity;
    let r = Infinity;
    if (y === h - 1) {
      d = 0;
      r = Math.abs(x + 0.5 - mid);
    }
    if (this.edges !== "bottom" && (x === 0 || x === w - 1)) {
      const rs = mid + (h - y - 0.5);
      if (Board.better(0, rs, d, r)) {
        d = 0;
        r = rs;
      }
    }
    if (this.edges === "all" && y === 0) {
      const rs = mid + h + Math.min(x + 0.5, w - x - 0.5);
      if (Board.better(0, rs, d, r)) {
        d = 0;
        r = rs;
      }
    }
    if (x > 0 && open[i - 1] === 1 && Board.better(depth[i - 1] + 1, road[i - 1], d, r)) {
      d = depth[i - 1] + 1;
      r = road[i - 1];
    }
    if (x < w - 1 && open[i + 1] === 1 && Board.better(depth[i + 1] + 1, road[i + 1], d, r)) {
      d = depth[i + 1] + 1;
      r = road[i + 1];
    }
    if (y > 0 && open[i - w] === 1 && Board.better(depth[i - w] + 1, road[i - w], d, r)) {
      d = depth[i - w] + 1;
      r = road[i - w];
    }
    if (y < h - 1 && open[i + w] === 1 && Board.better(depth[i + w] + 1, road[i + w], d, r)) {
      d = depth[i + w] + 1;
      r = road[i + w];
    }
    this.wayDepth = d;
    this.wayRoad = r;
  }

  /**
   * A truck has been sent for this cube: no other truck may take it, but it stays
   * on the board, still blocking the cubes behind it, until `eat` collects it.
   */
  claim(i: number): void {
    const c = this.cells[i];
    if (c === EMPTY || !this.reachable[c].has(i)) throw new Error(`cell ${i} is not reachable`);
    this.reachable[c].delete(i);
    this.claimed[i] = 1;
    this.pending++;
  }

  isClaimed(i: number): boolean {
    return this.claimed[i] === 1;
  }

  /** Removes a cube (claimed, or reachable and taken directly), opening the space behind it. */
  eat(i: number): void {
    const c = this.cells[i];
    if (c === EMPTY) throw new Error(`cell ${i} is already empty`);
    if (this.claimed[i] === 1) {
      this.claimed[i] = 0;
      this.pending--;
    } else if (!this.reachable[c].has(i)) {
      throw new Error(`cell ${i} is not reachable`);
    }
    this.cells[i] = EMPTY;
    this.reachable[c].delete(i);
    this.remaining--;
    this.remainingByColor[c]--;
    // It was reachable, so it connects to an open edge; so does any sealed gap it touches.
    this.flood(i);
  }
}
