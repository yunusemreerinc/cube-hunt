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
    b.eat(b.pickTarget(0)); // on the edge and nearest the ramp = bottom middle
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
    while (g.status === "playing") g.step();
    expect(g.status).toBe("won");
  });

  it("is stuck when every slot holds a color that cannot eat", () => {
    const g = new Game(level([[{ id: 0, color: 1, count: 1 }, { id: 1, color: 0, count: 8 }]], 1));
    g.tap(0);
    expect(g.status).toBe("stuck");
    g.addSlot();
    expect(g.status).toBe("playing");
    g.tap(0);
    while (g.status === "playing") g.step();
    expect(g.status).toBe("won");
  });
});

describe("levels", () => {
  for (const spec of builtInLevels()) {
    it(`${spec.picture.name}: truck counts match the picture and greedy play wins`, () => {
      const { level } = buildLevel(spec.picture, spec);
      const cells = spec.picture.palette.map(() => 0);
      spec.picture.cells.forEach((c) => c !== EMPTY && cells[c]++);
      const trucks = spec.picture.palette.map(() => 0);
      level.columns.flat().forEach((b) => (trucks[b.color] += b.count));
      expect(trucks).toEqual(cells);
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

describe("sealed gaps", () => {
  it("a transparent gap inside the picture opens only once trucks can reach it", () => {
    // 3x4, color 0 everywhere except a transparent cell at (1,1); only the bottom is open.
    //   0 0 0
    //   0 . 0
    //   0 0 0
    //   0 0 0
    const cells = Int16Array.from([0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 0, 0]);
    const b = new Board({ name: "gap", width: 3, height: 4, cells, palette: ["#000"] }, "bottom");
    expect(b.isOpen(4)).toBe(false);
    // Only the bottom row is reachable; the cells around the gap are not.
    expect(b.reachableCells(0).sort((x, y) => x - y)).toEqual([9, 10, 11]);
    b.eat(10);
    b.eat(7); // now (1,2) is cleared, which touches the gap
    expect(b.isOpen(4)).toBe(true);
    expect(b.reachableCells(0)).toEqual(expect.arrayContaining([1, 3, 5]));
  });
});

describe("claimed cubes", () => {
  it("stay on the board, blocking what is behind them, until a truck picks them up", () => {
    // 1x3 column, only the bottom open: cube 2 (bottom), then 1, then 0.
    const p: Picture = { name: "col", width: 1, height: 3, cells: new Int16Array(3), palette: ["#000"] };
    const level: Level = { picture: p, columns: [[{ id: 0, color: 0, count: 3 }]], slotCount: 1, edges: "bottom" };
    const g = new Game(level);
    g.tap(0);
    expect(g.tick().map((d) => d.cell)).toEqual([2]);
    // Cube 1 isn't reachable yet: cube 2 is claimed but still there.
    expect(g.tick()).toEqual([]);
    expect(g.board.remaining).toBe(3);
    expect(g.status).toBe("playing"); // not stuck: a truck is still on its way
    g.collect(2);
    expect(g.tick().map((d) => d.cell)).toEqual([1]);
  });

  it("are never offered to a second truck when the space next to them opens", () => {
    // 2x2, all one color, bottom open: claim both bottom cubes, then collect one.
    const p: Picture = { name: "sq", width: 2, height: 2, cells: new Int16Array(4), palette: ["#000"] };
    const b = new Board(p, "bottom");
    b.claim(2);
    b.claim(3);
    b.eat(2); // opens (0,1), which neighbors the still-claimed cube 3
    expect(b.reachableCells(0).sort()).toEqual([0]);
    expect(b.isClaimed(3)).toBe(true);
  });

  it("is not declared stuck while a pickup could still open new cubes", () => {
    // Bottom cube color 0, top cube color 1; one slot each, both filled.
    const p: Picture = { name: "two", width: 1, height: 2, cells: Int16Array.from([1, 0]), palette: ["#000", "#fff"] };
    const level: Level = {
      picture: p,
      columns: [[{ id: 0, color: 0, count: 1 }], [{ id: 1, color: 1, count: 1 }]],
      slotCount: 2,
      edges: "bottom",
    };
    const g = new Game(level);
    g.tap(0);
    g.tap(1);
    g.tick(); // claims the bottom cube; the top one isn't reachable yet
    expect(g.status).toBe("playing");
    g.collect(1);
    expect(g.tick().map((d) => d.cell)).toEqual([0]);
    g.collect(0);
    expect(g.status).toBe("won");
  });
});

describe("cubes touching the road first", () => {
  it("takes a cube touching the road before a nearer one further in", () => {
    // 9 wide, 4 tall, every side open. Clear the middle of the bottom row and dig
    // a shaft up the middle column.
    const p: Picture = { name: "wide", width: 9, height: 4, cells: new Int16Array(36), palette: ["#000"] };
    const b = new Board(p, "all");
    for (const x of [4, 3, 5, 2, 6]) b.eat(27 + x);
    b.eat(22);
    b.eat(13);
    // The shaft wall at (3,2) is a shorter drive, but it is a cell in from the
    // road; the bottom-row cube at (1,3) touches the road, so it goes first.
    expect(b.pickTarget(0)).toBe(27 + 1);
  });

  it("can take any cube touching the road, on every side", () => {
    // 3x3 with every side open: all eight outer cubes touch the road.
    const p: Picture = { name: "sq", width: 3, height: 3, cells: new Int16Array(9), palette: ["#000"] };
    const b = new Board(p, "all");
    expect(b.reachableCells(0).sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 5, 6, 7, 8]);
  });

  it("among cubes touching the road, takes the shortest drive from the ramp", () => {
    const p: Picture = { name: "row", width: 7, height: 1, cells: new Int16Array(7), palette: ["#000"] };
    const b = new Board(p, "bottom");
    expect(b.pickTarget(0)).toBe(3);
    b.eat(3);
    expect(b.pickTarget(0)).toBe(2); // 2 and 4 are both 1 along the road; the lower index wins
  });
});
