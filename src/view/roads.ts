import type { Board, Side } from "../core/board";

export interface Pt {
  x: number;
  y: number;
}

/** The road's center line: a rectangle around the field, in screen units. */
export interface Ring {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Plans truck routes: from the driveway, along the road that circles the field,
 * in through an open edge, then through cleared cells to the cube. Trucks never
 * cross a cube that is still on the board (except one another truck has just
 * been sent to collect).
 */
export class RoadMap {
  constructor(
    private readonly board: Board,
    /** Top-left of the cell grid and the cell size, in screen units. */
    private readonly ox: number,
    private readonly oy: number,
    private readonly cs: number,
    readonly ring: Ring,
    /** Where the driveway from the ramp meets the road (on the ring's bottom side). */
    readonly entry: Pt,
  ) {}

  center(i: number): Pt {
    const x = i % this.board.width;
    const y = Math.floor(i / this.board.width);
    return { x: this.ox + (x + 0.5) * this.cs, y: this.oy + (y + 0.5) * this.cs };
  }

  /** The point on the road straight out from a cell on the given board side. */
  roadPoint(i: number, side: Side): Pt {
    const c = this.center(i);
    switch (side) {
      case "top":
        return { x: c.x, y: this.ring.y0 };
      case "bottom":
        return { x: c.x, y: this.ring.y1 };
      case "left":
        return { x: this.ring.x0, y: c.y };
      case "right":
        return { x: this.ring.x1, y: c.y };
    }
  }

  private get w(): number {
    return this.ring.x1 - this.ring.x0;
  }
  private get h(): number {
    return this.ring.y1 - this.ring.y0;
  }
  private get perimeter(): number {
    return 2 * (this.w + this.h);
  }

  /** Distance along the road, clockwise from the top-left corner, of a point on it. */
  private along(p: Pt): number {
    const { x0, y0, x1, y1 } = this.ring;
    const eps = 0.5;
    if (Math.abs(p.y - y0) < eps) return p.x - x0;
    if (Math.abs(p.x - x1) < eps) return this.w + (p.y - y0);
    if (Math.abs(p.y - y1) < eps) return this.w + this.h + (x1 - p.x);
    return 2 * this.w + this.h + (y1 - p.y);
  }

  /** Shortest distance along the road between two points on it. */
  roadDistance(a: Pt, b: Pt): number {
    const d = Math.abs(this.along(a) - this.along(b));
    return Math.min(d, this.perimeter - d);
  }

  /** Waypoints driving the short way round from `a` to `b` (excludes `a`, includes `b`). */
  roadPath(a: Pt, b: Pt): Pt[] {
    const P = this.perimeter;
    const ta = this.along(a);
    const forward = (this.along(b) - ta + P) % P;
    const clockwise = forward <= P - forward;
    const { x0, y0, x1, y1 } = this.ring;
    const corners = [
      { t: 0, p: { x: x0, y: y0 } },
      { t: this.w, p: { x: x1, y: y0 } },
      { t: this.w + this.h, p: { x: x1, y: y1 } },
      { t: 2 * this.w + this.h, p: { x: x0, y: y1 } },
    ];
    const limit = clockwise ? forward : P - forward;
    const passed = corners
      .map((c) => ({ p: c.p, d: clockwise ? (c.t - ta + P) % P : (ta - c.t + P) % P }))
      .filter((c) => c.d > 0.5 && c.d < limit - 0.5)
      .sort((m, n) => m.d - n.d)
      .map((c) => c.p);
    return [...passed, b];
  }

  /**
   * Route from the driveway to where a truck parks to load cell `t`: next to it
   * on a cleared cell, or on the road if the cube sits on an open edge. The first
   * point is `entry`. Picks the shortest total drive.
   */
  route(t: number): Pt[] {
    return this.routeFrom(t, this.entry).path;
  }

  /** Like `route`, starting where a given driveway lane meets the road; also returns its length. */
  routeFrom(t: number, entry: Pt): { path: Pt[]; cost: number } {
    const board = this.board;
    const dist = new Int32Array(board.width * board.height).fill(-1);
    const toward = new Int32Array(dist.length).fill(-1); // next cell on the way to the target
    dist[t] = 0;
    const queue = [t];
    let best: { cell: number; road: Pt; cost: number } | null = null;
    for (let q = 0; q < queue.length; q++) {
      const u = queue[q];
      const c = this.center(u);
      for (const side of board.openSides(u)) {
        const road = this.roadPoint(u, side);
        const cost =
          dist[u] * this.cs + Math.hypot(road.x - c.x, road.y - c.y) + this.roadDistance(entry, road);
        if (!best || cost < best.cost) best = { cell: u, road, cost };
      }
      for (const n of board.neighbors(u)) {
        if (dist[n] >= 0 || !board.isOpen(n)) continue;
        dist[n] = dist[u] + 1;
        toward[n] = u;
        queue.push(n);
      }
    }
    if (!best) {
      // Unreachable by road; shouldn't happen.
      const c = this.center(t);
      return { path: [entry, c], cost: Math.hypot(c.x - entry.x, c.y - entry.y) };
    }
    const path = [entry, ...this.roadPath(entry, best.road)];
    for (let u = best.cell; u !== t; u = toward[u]) path.push(this.center(u));
    return { path, cost: best.cost };
  }
}
