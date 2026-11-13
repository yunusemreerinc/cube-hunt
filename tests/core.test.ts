import { describe, expect, it } from "vitest";
import { Board } from "../src/core/board";
import { Game } from "../src/core/game";
import { EMPTY, type Level, type Picture } from "../src/core/types";
import { builtInLevels } from "../src/levels/art";
import { buildLevel, generateLevel } from "../src/levels/generator";
import { quantize } from "../src/levels/image";
import { solveGreedy } from "../src/levels/solver";

/** 3x3 picture: color 1 in the middle, color 0 around it. */
function ring(): Picture {
  return {
    name: "ring",
    width: 3,
    height: 3,
    cells: Int16Array.from([0, 0, 0, 0, 1, 0, 0, 0, 0]),
    palette: ["#f00", "#00f"],
  };
}

describe("Board", () => {
  it("only exposes cells on the edge or next to eaten cells", () => {
    const b = new Board(ring());
    expect(b.reachableCount(0)).toBe(8);
    expect(b.reachableCount(1)).toBe(0);
    b.eat(b.pickTarget(0)); // nearest to the hole = bottom middle
    expect(b.reachableCount(1)).toBe(1);
  });

  it("refuses to eat an unreachable cell", () => {
    expect(() => new Board(ring()).eat(4)).toThrow();
  });
});

describe("Game", () => {
  const level = (columns: Level["columns"], slotCount = 5): Level => ({
    picture: ring(),
    columns,
    slotCount,
    edges: "all",
  });

  it("wins when the picture is eaten", () => {
    const g = new Game(level([[{ id: 0, color: 0, count: 8 }], [{ id: 1, color: 1, count: 1 }]]));
    g.tap(0);
    g.tap(1);
    while (g.status === "playing") g.tick();
    expect(g.status).toBe("won");
  });

  it("is stuck when every slot holds a color that cannot eat", () => {
    const g = new Game(level([[{ id: 0, color: 1, count: 1 }, { id: 1, color: 0, count: 8 }]], 1));
    g.tap(0);
    expect(g.status).toBe("stuck");
    g.addSlot();
    expect(g.status).toBe("playing");
    g.tap(0);
    while (g.status === "playing") g.tick();
    expect(g.status).toBe("won");
  });
});

describe("levels", () => {
  for (const spec of builtInLevels()) {
    it(`${spec.picture.name}: ant counts match the picture and greedy play wins`, () => {
      const { level } = buildLevel(spec.picture, spec);
      const cells = spec.picture.palette.map(() => 0);
      spec.picture.cells.forEach((c) => c !== EMPTY && cells[c]++);
      const ants = spec.picture.palette.map(() => 0);
      level.columns.flat().forEach((b) => (ants[b.color] += b.count));
      expect(ants).toEqual(cells);
      expect(solveGreedy(level).solved).toBe(true);
    });
  }

  it("later levels are harder for a careless player", () => {
    const rates = builtInLevels().map((s) => buildLevel(s.picture, s).winRate);
    expect(rates[0]).toBeGreaterThan(rates[rates.length - 1]);
  });

  it("generation is deterministic for a seed", () => {
    const p = builtInLevels()[2].picture;
    const a = generateLevel(p, { seed: 5, shuffle: 0.5 });
    const b = generateLevel(p, { seed: 5, shuffle: 0.5 });
    expect(a.columns).toEqual(b.columns);
  });
});

describe("quantize", () => {
  it("reduces colors and keeps transparency", () => {
    // 2x2: red, near-red, blue, transparent
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 250, 5, 5, 255, 0, 0, 255, 255, 0, 0, 0, 0]);
    const p = quantize(rgba, 2, 2, 4);
    expect(p.palette.length).toBe(2);
    expect(p.cells[0]).toBe(p.cells[1]);
    expect(p.cells[2]).not.toBe(p.cells[0]);
    expect(p.cells[3]).toBe(EMPTY);
  });
});

describe("Board edges", () => {
  it("with bottom-only entry, side cells are not reachable at the start", () => {
    // 3x3 single color: only the bottom row is open.
    const p: Picture = { name: "x", width: 3, height: 3, cells: new Int16Array(9), palette: ["#000"] };
    expect(new Board(p, "bottom").reachableCount(0)).toBe(3);
    expect(new Board(p, "sides").reachableCount(0)).toBe(7);
    expect(new Board(p, "all").reachableCount(0)).toBe(8);
  });
});
