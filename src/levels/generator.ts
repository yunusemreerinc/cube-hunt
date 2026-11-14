import { Board } from "../core/board";
import { EMPTY, type Block, type Level, type OpenEdges, type Picture } from "../core/types";
import { mulberry32 } from "./rng";
import { randomWinRate, solveGreedy } from "./solver";

export interface GenOptions {
  seed: number;
  /** 0 = blocks arrive in the order the picture opens up (easy), 1 = heavily shuffled (hard). */
  shuffle: number;
  columns?: number;
  slots?: number;
  /** Which edges trucks drive in from: "all" (easy), "sides", or "bottom" (hard). */
  edges?: OpenEdges;
  minBlock?: number;
  maxBlock?: number;
}

/**
 * For every cell, the "layer" in which it becomes reachable if the picture is
 * peeled one full ring at a time. Low layer = available early.
 */
export function peelLayers(picture: Picture, edges: OpenEdges = "all"): Int32Array {
  const board = new Board(picture, edges);
  const layer = new Int32Array(picture.cells.length).fill(-1);
  let l = 0;
  while (board.remaining > 0) {
    const ring = picture.palette.flatMap((_, c) => board.reachableCells(c));
    for (const i of ring) {
      layer[i] = l;
      board.eat(i);
    }
    l++;
  }
  return layer;
}

/**
 * Fisher-Yates shuffle driven by `rng`. Unlike sorting with a random comparator,
 * this gives the same order in every JavaScript engine for the same seed.
 */
export function shuffled<T>(items: T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function splitCount(n: number, min: number, max: number, rng: () => number): number[] {
  const out: number[] = [];
  let rem = n;
  while (rem > 0) {
    let s: number;
    if (rem <= max) s = rem;
    else s = min + Math.floor(rng() * (Math.min(max, rem - min) - min + 1));
    out.push(s);
    rem -= s;
  }
  return out;
}

/** Builds a tray for a picture. Not checked for solvability; see `buildLevel`. */
export function generateLevel(picture: Picture, opts: GenOptions): Level {
  const rng = mulberry32(opts.seed);
  const columns = opts.columns ?? 4;
  const total = picture.cells.reduce((n, c) => n + (c === EMPTY ? 0 : 1), 0);
  const minBlock = opts.minBlock ?? Math.max(4, Math.round(total / 90));
  const maxBlock = opts.maxBlock ?? Math.max(minBlock + 6, Math.min(80, Math.round(total / 14)));

  const edges = opts.edges ?? "all";
  const layers = peelLayers(picture, edges);
  let maxLayer = 0;
  for (const l of layers) maxLayer = Math.max(maxLayer, l);

  // Group each color's cells in peel order, then cut into blocks.
  const byColor: number[][] = picture.palette.map(() => []);
  picture.cells.forEach((c, i) => {
    if (c !== EMPTY) byColor[c].push(i);
  });

  type Pending = { block: Block; time: number };
  const pending: Pending[] = [];
  let id = 0;
  byColor.forEach((cells, color) => {
    if (cells.length === 0) return;
    cells.sort((a, b) => layers[a] - layers[b]);
    let offset = 0;
    for (const size of splitCount(cells.length, minBlock, maxBlock, rng)) {
      // A block is "due" when its first cells open up.
      const time = layers[cells[offset]];
      pending.push({ block: { id: id++, color, count: size }, time });
      offset += size;
    }
  });

  const noise = opts.shuffle * (maxLayer + 1);
  for (const p of pending) p.time += rng() * noise;
  pending.sort((a, b) => a.time - b.time);

  // Deal row by row so the earliest blocks end up at the front, in random column order.
  const cols: Block[][] = Array.from({ length: columns }, () => []);
  for (let i = 0; i < pending.length; i += columns) {
    const row = pending.slice(i, i + columns);
    const order = shuffled(cols.map((_, c) => c), rng);
    // Prefer shorter columns for a ragged last row.
    order.sort((a, b) => cols[a].length - cols[b].length);
    row.forEach((p, k) => cols[order[k]].push(p.block));
  }
  return { picture, columns: cols, slotCount: opts.slots ?? 5, edges };
}

export interface BuildOptions extends GenOptions {
  /** Desired random-player win rate (1 = trivial, ~0.3 = hard). */
  targetWinRate?: number;
}

export interface BuiltLevel {
  level: Level;
  /** Measured random-player win rate of the chosen tray. */
  winRate: number;
}

/**
 * Generates candidate trays, keeps the ones the greedy solver wins (so every
 * level is winnable without boosters), and returns the one whose random-player
 * win rate is closest to `targetWinRate`.
 */
export function buildLevel(picture: Picture, opts: BuildOptions, candidates = 16): BuiltLevel {
  const target = opts.targetWinRate ?? 1;
  let best: BuiltLevel | null = null;
  for (let k = 0; k < candidates; k++) {
    const level = generateLevel(picture, { ...opts, seed: opts.seed + k * 7919 });
    if (!solveGreedy(level).solved) continue;
    const winRate = randomWinRate(level, 24, opts.seed);
    if (!best || Math.abs(winRate - target) < Math.abs(best.winRate - target)) best = { level, winRate };
    if (Math.abs(winRate - target) < 0.04) break;
  }
  if (best) return best;
  // Nothing passed: back off the shuffle until the solver wins.
  for (let k = 1; k <= 8; k++) {
    const level = generateLevel(picture, { ...opts, shuffle: opts.shuffle * (1 - k / 8), seed: opts.seed + k });
    if (solveGreedy(level).solved) return { level, winRate: randomWinRate(level, 24, opts.seed) };
  }
  console.warn(`Could not verify level "${picture.name}" as solvable`);
  const level = generateLevel(picture, { ...opts, shuffle: 0 });
  return { level, winRate: randomWinRate(level, 24, opts.seed) };
}
