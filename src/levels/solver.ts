import { Game } from "../core/game";
import type { Level } from "../core/types";
import { mulberry32 } from "./rng";

export interface SolveResult {
  solved: boolean;
  ticks: number;
  taps: number;
}

/**
 * Plays a level with a simple greedy strategy. If this wins, the level is
 * winnable without boosters. (A loss does not prove the level is impossible,
 * only that greedy play fails; the generator just tries again.)
 */
export function solveGreedy(level: Level, maxTicks = 200_000): SolveResult {
  const g = new Game(level);
  let ticks = 0;
  let taps = 0;
  while (g.status === "playing" && ticks < maxTicks) {
    // Fill free slots with blocks that can eat right away.
    while (g.hasFreeSlot()) {
      const col = chooseTap(g, false);
      if (col < 0) break;
      g.tap(col);
      taps++;
    }
    if (g.status !== "playing") break;
    const sent = g.tick();
    ticks++;
    if (sent.length === 0 && g.status === "playing") {
      // Nothing is eating: we have to tap something, even a blocked color.
      const col = chooseTap(g, true);
      if (col < 0) break;
      g.tap(col);
      taps++;
    }
  }
  return { solved: g.status === "won", ticks, taps };
}

function chooseTap(g: Game, force: boolean): number {
  let best = -1;
  let bestScore = -Infinity;
  for (let c = 0; c < g.columns.length; c++) {
    const b = g.front(c);
    if (!b) continue;
    const reach = g.board.reachableCount(b.color);
    if (!force && reach === 0) continue;
    const sameColor = g.slots.filter((s) => s?.color === b.color).length;
    // Prefer colors with lots of exposed cells that aren't already being cleared,
    // and when forced, prefer colors with many cells left (likely to open soon).
    const score = reach / (1 + sameColor) + (force ? g.board.remainingOf(b.color) * 1e-3 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/**
 * Difficulty estimate: the share of games won by a careless player who taps a
 * random block whenever a slot is free. 1 = can't lose, 0 = needs real planning.
 */
export function randomWinRate(level: Level, games = 24, seed = 1): number {
  let wins = 0;
  for (let k = 0; k < games; k++) {
    const rng = mulberry32(seed + k * 101);
    const g = new Game(level);
    while (g.status === "playing") {
      while (g.status === "playing" && g.hasFreeSlot()) {
        const cols = g.columns.flatMap((c, i) => (c.length ? [i] : []));
        if (cols.length === 0) break;
        g.tap(cols[Math.floor(rng() * cols.length)]);
      }
      if (g.status !== "playing") break;
      g.tick();
    }
    if (g.status === "won") wins++;
  }
  return wins / games;
}
