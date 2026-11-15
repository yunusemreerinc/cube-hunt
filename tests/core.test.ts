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
    // Builds every built-in level, which takes a while now there are dozens.
  }, 60000);

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

describe("cubes next to the road first", () => {
  it("takes a cube next to the road before a nearer one further in", () => {
    // 9 wide, 4 tall, only the bottom open (walls on the other sides). Clear the
    // middle of the bottom row and dig a shaft up the middle column.
    const p: Picture = { name: "wide", width: 9, height: 4, cells: new Int16Array(36), palette: ["#000"] };
    const b = new Board(p, "bottom");
    for (const x of [4, 3, 5, 2, 6]) b.eat(27 + x);
    b.eat(22);
    b.eat(13);
    // The shaft wall at (3,2) is a shorter drive, but it is a cell in from the
    // road; the bottom-row cube at (1,3) is next to the road, so it goes first.
    expect(b.pickTarget(0)).toBe(27 + 1);
  });

  it("does not count cubes behind a wall as next to the road", () => {
    // 3x3, only the bottom open: the side and top cubes touch the road but a wall
    // is in the way, so only the bottom row is reachable.
    const p: Picture = { name: "sq", width: 3, height: 3, cells: new Int16Array(9), palette: ["#000"] };
    const b = new Board(p, "bottom");
    expect(b.reachableCells(0).sort((x, y) => x - y)).toEqual([6, 7, 8]);
  });

  it("among cubes next to the road, takes the shortest drive from the ramp", () => {
    const p: Picture = { name: "row", width: 7, height: 1, cells: new Int16Array(7), palette: ["#000"] };
    const b = new Board(p, "bottom");
    expect(b.pickTarget(0)).toBe(3);
    b.eat(3);
    expect(b.pickTarget(0)).toBe(2); // 2 and 4 are both 1 along the road; the lower index wins
  });

  it("open on every side: rows near the ramp go before cubes on the far edges", () => {
    // Like the bottom of the strawberry: a pointed tip, with the widest rows
    // touching the left and right edges higher up.
    //   X X X X X
    //   X X X X X   <- (0,1) and (4,1) touch the side roads
    //   . X X X .   <- (1,2) and (3,2) are reached through the empty corners
    //   . . X . .
    const E = EMPTY;
    const cells = Int16Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, E, 0, 0, 0, E, E, E, 0, E, E]);
    const p: Picture = { name: "tip", width: 5, height: 4, cells, palette: ["#000"] };
    const level: Level = { picture: p, columns: [[{ id: 0, color: 0, count: 4 }]], slotCount: 1, edges: "all" };
    const g = new Game(level);
    g.tap(0);
    const claims: number[] = [];
    for (let sent = g.tick(); sent.length; sent = g.tick()) claims.push(...sent.map((d) => d.cell));
    // The tip, then the second row, and only then the side of the next row up.
    expect(claims).toEqual([17, 11, 13, 5]);
  });

  it("a crate isn't blocked while a truck already out will uncover its color", () => {
    // One column, open at the bottom: blue (0) at the bottom, then an empty gap
    // sealed in by it, then red (1), then green (2) on top.
    const E = EMPTY;
    const p: Picture = { name: "stack", width: 1, height: 4, cells: Int16Array.from([2, 1, E, 0]), palette: ["#00f", "#f00", "#0f0"] };
    const level: Level = {
      picture: p,
      columns: [[{ id: 0, color: 1, count: 1 }], [{ id: 1, color: 0, count: 1 }], [{ id: 2, color: 2, count: 1 }]],
      slotCount: 3,
      edges: "bottom",
    };
    const g = new Game(level);
    const red = g.tap(0);
    const green = g.tap(2);
    // No trucks out yet: red and green really are blocked.
    expect(g.slotBlocked(red)).toBe(true);
    expect(g.slotBlocked(green)).toBe(true);
    const blue = g.tap(1);
    expect(g.tick().map((d) => d.cell)).toEqual([3]); // a truck leaves for the blue cube
    expect(g.slots[blue]).toBeNull();
    // Once it collects that cube, the gap behind it opens and red can be reached,
    // so red isn't shown as blocked. Green stays blocked: red is still in its way.
    expect(g.slotBlocked(red)).toBe(false);
    expect(g.slotBlocked(green)).toBe(true);
    g.collect(3);
    expect(g.slotCanEat(red)).toBe(true);
    expect(g.slotBlocked(red)).toBe(false);
  });

  it("lets the view hold a slot back to space out its trucks", () => {
    const p: Picture = { name: "row", width: 3, height: 1, cells: new Int16Array(3), palette: ["#000"] };
    const level: Level = { picture: p, columns: [[{ id: 0, color: 0, count: 3 }]], slotCount: 1, edges: "bottom" };
    const g = new Game(level);
    g.tap(0);
    expect(g.tick(() => false)).toEqual([]);
    expect(g.slots[0]?.count).toBe(3);
    expect(g.tick((s) => s === 0).map((d) => d.cell)).toEqual([1]);
    expect(g.slots[0]?.count).toBe(2);
  });

  it("takes a row from the middle out, and never makes trucks wait", () => {
    // 5 wide, 2 tall, only the bottom open; one crate of 10 trucks.
    const p: Picture = { name: "rows", width: 5, height: 2, cells: new Int16Array(10), palette: ["#000"] };
    const level: Level = { picture: p, columns: [[{ id: 0, color: 0, count: 10 }]], slotCount: 1, edges: "bottom" };
    const g = new Game(level);
    g.tap(0);
    const claims: number[] = [];
    for (let sent = g.tick(); sent.length; sent = g.tick()) claims.push(...sent.map((d) => d.cell));
    // Bottom row (cells 5..9): middle first, then out to both sides.
    expect(claims).toEqual([7, 6, 8, 5, 9]);
    // Picking up the middle opens the cube above it, and a truck goes for it at once.
    g.collect(7);
    expect(g.tick().map((d) => d.cell)).toEqual([2]);
    expect(g.tick()).toEqual([]);
  });

  it("sends one truck to each reachable cube: 15 reachable cubes, 15 trucks", () => {
    // 15 wide, 2 tall, only the bottom open: the 15 bottom cubes are reachable.
    const p: Picture = { name: "15", width: 15, height: 2, cells: new Int16Array(30), palette: ["#000"] };
    const level: Level = { picture: p, columns: [[{ id: 0, color: 0, count: 20 }]], slotCount: 1, edges: "bottom" };
    const g = new Game(level);
    g.tap(0);
    const sent = new Set<number>();
    for (let t = 0; t < 30; t++) for (const d of g.tick()) sent.add(d.cell);
    // All 15 reachable cubes got a truck, each its own; the crate's other 5 wait.
    expect([...sent].sort((x, y) => x - y)).toEqual(Array.from({ length: 15 }, (_, i) => 15 + i));
    expect(g.slots[0]?.count).toBe(5);
    expect(g.status).toBe("playing"); // trucks are still on their way, so not stuck
    // Each pickup opens the cube above it, and a waiting truck goes for it right away.
    g.collect(15 + 7);
    expect(g.tick().map((d) => d.cell)).toEqual([7]);
    expect(g.tick()).toEqual([]);
  });
});
