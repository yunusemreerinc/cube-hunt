import { describe, expect, it } from "vitest";
import { Board } from "../src/core/board";
import { Game } from "../src/core/game";
import type { Picture } from "../src/core/types";
import { builtInLevels } from "../src/levels/art";
import { buildLevel } from "../src/levels/generator";
import { solveGreedy } from "../src/levels/solver";
import { RoadMap, type Pt } from "../src/view/roads";

// Layout used by the tests: 10px cells starting at (100, 100), road ring 20px outside them.
const CS = 10;
const O = 100;
function roadsFor(board: Board): RoadMap {
  const ring = { x0: O - 20, y0: O - 20, x1: O + board.width * CS + 20, y1: O + board.height * CS + 20 };
  return new RoadMap(board, O, O, CS, ring, { x: O + (board.width * CS) / 2, y: ring.y1 });
}

/** Cell index under a waypoint, or -1 if it is outside the field (on the road). */
function cellAt(board: Board, p: Pt): number {
  const x = Math.floor((p.x - O) / CS);
  const y = Math.floor((p.y - O) / CS);
  if (x < 0 || y < 0 || x >= board.width || y >= board.height) return -1;
  return y * board.width + x;
}

function solid(width: number, height: number): Picture {
  return { name: "solid", width, height, cells: new Int16Array(width * height), palette: ["#000"] };
}

describe("RoadMap", () => {
  it("parks on the road below a cube on the open bottom edge", () => {
    const board = new Board(solid(5, 5), "bottom");
    const roads = roadsFor(board);
    const target = 4 * 5 + 1; // bottom row, x = 1
    const route = roads.route(target);
    expect(route[0]).toEqual(roads.entry);
    expect(route[route.length - 1]).toEqual({ x: O + 1.5 * CS, y: roads.ring.y1 });
  });

  it("drives in through cleared cells only, and parks next to the cube", () => {
    // Clear a corridor up the middle column of a 5x5 board, then target the cube beside its end.
    const board = new Board(solid(5, 5), "bottom");
    for (const y of [4, 3, 2]) board.eat(y * 5 + 2);
    const target = 2 * 5 + 1; // (1, 2), left of the corridor's top
    board.eat(target);
    const route = roadsFor(board).route(target);
    const cells = route.map((p) => cellAt(board, p)).filter((i) => i >= 0);
    expect(cells).toEqual([22, 17, 12]);
    expect(cells.every((i) => board.isOpen(i))).toBe(true);
  });

  it("goes round the road to reach an open side when that is shorter", () => {
    // All edges open: a cube at the top-left corner is reached from the top or left side.
    const board = new Board(solid(6, 6), "all");
    const route = roadsFor(board).route(0);
    const end = route[route.length - 1];
    const ring = roadsFor(board).ring;
    expect(end.x === ring.x0 || end.y === ring.y0).toBe(true);
    // It passes the bottom-left corner of the road on the way.
    expect(route).toContainEqual({ x: ring.x0, y: ring.y1 });
  });

  for (const spec of builtInLevels()) {
    it(`${spec.picture.name}: every route avoids cubes and ends beside its cube`, () => {
      const { level } = buildLevel(spec.picture, spec);
      expect(solveGreedy(level).solved).toBe(true);
      // Replay a game with a simple strategy and check every truck's route.
      const g = new Game(level);
      const roads = roadsFor(g.board);
      let checked = 0;
      for (let guard = 0; g.status !== "won" && guard < 100_000; guard++) {
        // This simple player can run out of moves; like a player would, it then
        // takes an extra slot and carries on, so every cube's route gets checked.
        if (g.status === "stuck") g.addSlot();
        while (g.hasFreeSlot()) {
          const col = g.columns.findIndex((c) => c.length && g.board.reachableCount(c[0].color) > 0);
          if (col < 0) break;
          g.tap(col);
        }
        const sent = g.tick();
        if (sent.length === 0 && g.status === "playing") {
          const col = g.columns.findIndex((c) => c.length > 0);
          if (col >= 0 && g.hasFreeSlot()) g.tap(col);
        }
        for (const d of sent) {
          const route = roads.route(d.cell);
          const cells = route.map((p) => cellAt(g.board, p)).filter((i) => i >= 0);
          for (const i of cells) expect(g.board.isOpen(i)).toBe(true);
          const last = route[route.length - 1];
          const cube = roads.center(d.cell);
          const parkedBeside =
            cells.length > 0
              ? Math.hypot(last.x - cube.x, last.y - cube.y) === CS
              : last.x === cube.x || last.y === cube.y; // on the road, straight out from the cube
          expect(parkedBeside).toBe(true);
          checked++;
        }
        // Trucks pick their cubes up before the next tick.
        for (const d of sent) g.collect(d.cell);
      }
      expect(g.status).toBe("won");
      // One route per cube in the picture.
      expect(checked).toBe(spec.picture.cells.filter((c) => c >= 0).length);
    });
  }
});
