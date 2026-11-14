import { EMPTY, type Picture } from "../core/types";
import type { BuildOptions } from "./generator";

/** Character grid used to author pictures. '.' means transparent. */
class Sketch {
  readonly g: string[][];
  constructor(readonly w: number, readonly h: number, fill = ".") {
    this.g = Array.from({ length: h }, () => new Array<string>(w).fill(fill));
  }
  static fromRows(rows: string[]): Sketch {
    const s = new Sketch(rows[0].length, rows.length);
    rows.forEach((r, y) => {
      if (r.length !== s.w) throw new Error(`row ${y} has length ${r.length}, expected ${s.w}`);
      [...r].forEach((ch, x) => (s.g[y][x] = ch));
    });
    return s;
  }
  get(x: number, y: number): string | undefined {
    return this.g[y]?.[x];
  }
  set(x: number, y: number, ch: string): this {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.g[y][x] = ch;
    return this;
  }
  /** Paints every cell whose center satisfies `test`. */
  paint(ch: string, test: (x: number, y: number) => boolean, only?: string): this {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (test(x + 0.5, y + 0.5) && (!only || only.includes(this.g[y][x]))) this.g[y][x] = ch;
    return this;
  }
  rect(x0: number, y0: number, x1: number, y1: number, ch: string): this {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, ch);
    return this;
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, ch: string, only?: string): this {
    return this.paint(ch, (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1, only);
  }
  circle(cx: number, cy: number, r: number, ch: string, only?: string): this {
    return this.ellipse(cx, cy, r, r, ch, only);
  }
  triangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, ch: string): this {
    const sign = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
      (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
    return this.paint(ch, (x, y) => {
      const d1 = sign(x, y, ax, ay, bx, by);
      const d2 = sign(x, y, bx, by, cx, cy);
      const d3 = sign(x, y, cx, cy, ax, ay);
      const neg = d1 < 0 || d2 < 0 || d3 < 0;
      const pos = d1 > 0 || d2 > 0 || d3 > 0;
      return !(neg && pos);
    });
  }
  /** Turns cells of `shape` that touch a `bg` cell into `ch`. */
  outline(shape: string, bg: string, ch: string): this {
    const hits: [number, number][] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (!shape.includes(this.g[y][x])) continue;
        const n = [this.get(x - 1, y), this.get(x + 1, y), this.get(x, y - 1), this.get(x, y + 1)];
        if (n.some((c) => c !== undefined && bg.includes(c))) hits.push([x, y]);
      }
    for (const [x, y] of hits) this.g[y][x] = ch;
    return this;
  }
  toPicture(name: string, colors: Record<string, string>): Picture {
    const keys = Object.keys(colors);
    const cells = new Int16Array(this.w * this.h);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const ch = this.g[y][x];
        if (ch === ".") cells[y * this.w + x] = EMPTY;
        else {
          const id = keys.indexOf(ch);
          if (id < 0) throw new Error(`${name}: no color for '${ch}'`);
          cells[y * this.w + x] = id;
        }
      }
    return { name, width: this.w, height: this.h, cells, palette: keys.map((k) => colors[k]) };
  }
}

function strawberry(): Picture {
  return Sketch.fromRows([
    ".......gg.......",
    "....GGGggGGG....",
    "...GGGGGGGGGG...",
    "..RRGGRRRRGGRR..",
    ".RRRRRRRRRRRRRR.",
    ".RRYRRRRYRRRRYR.",
    "RRRRRRYRRRRYRRRR",
    "RRYRRRRRRRRRRRRR",
    "RRRRRYRRRRYRRYRR",
    ".RRRRRRRRRRRRRR.",
    ".RYRRRRYRRRRYRR.",
    "..RRRRRRRRRRRR..",
    "...RRRYRRRYRR...",
    "....RRRRRRRR....",
    ".....RRRRRR.....",
    "......RRRR......",
  ]).toPicture("Strawberry", { R: "#ec4a5a", G: "#4cc46a", g: "#2b8a4a", Y: "#ffe27a" });
}

function mushroom(): Picture {
  const s = new Sketch(20, 20, "B");
  s.rect(0, 17, 19, 19, "G");
  s.paint("R", (x, y) => y <= 11 && ((x - 10) / 8.6) ** 2 + ((y - 11) / 8.2) ** 2 <= 1);
  s.circle(6, 6, 1.6, "W", "R").circle(13.5, 5, 1.8, "W", "R").circle(10, 9, 1.2, "W", "R");
  s.circle(16, 9, 1.1, "W", "R").circle(3.5, 9.3, 0.9, "W", "R");
  s.rect(7, 12, 12, 17, "C");
  s.outline("RWC", "B", "K");
  s.rect(8, 13, 8, 14, "K").rect(11, 13, 11, 14, "K");
  s.paint("G", (x, y) => y > 16 && y < 17.5 && Math.sin(x * 1.7) > 0, "B");
  return s.toPicture("Mushroom", {
    B: "#3fa2e3",
    G: "#5cc464",
    R: "#e8424f",
    W: "#ffffff",
    C: "#d09b5c",
    K: "#2d2d40",
  });
}

function sunset(): Picture {
  const s = new Sketch(24, 24, "P");
  s.rect(0, 4, 23, 7, "K").rect(0, 8, 23, 13, "O");
  s.circle(12, 13.5, 5.2, "Y");
  s.rect(0, 14, 23, 23, "S");
  // Sun reflection, narrowing towards the viewer.
  for (let y = 15; y <= 21; y += 2) {
    const half = Math.max(1, 5 - (y - 15));
    s.rect(12 - half, y, 11 + half, y, "Y");
  }
  // Waves.
  s.paint("L", (x, y) => y > 16 && Math.sin(x * 0.9 + y * 2.1) > 0.82, "S");
  s.paint("K", (x, y) => y < 4 && Math.sin(x * 0.7 + y * 1.3) > 0.85, "P");
  return s.toPicture("Sunset", {
    P: "#7a5cc9",
    K: "#f07aa8",
    O: "#ff6d1a",
    Y: "#ffe63d",
    S: "#2f7fd6",
    L: "#86d6f2",
  });
}

function cat(): Picture {
  const s = new Sketch(24, 24, "B");
  s.triangle(3, 13, 5, 2, 12, 8, "O").triangle(21, 13, 19, 2, 12, 8, "O");
  s.triangle(5.5, 10, 6.3, 5, 9.5, 8, "P").triangle(18.5, 10, 17.7, 5, 14.5, 8, "P");
  s.ellipse(12, 14.5, 9.5, 7.6, "O");
  s.rect(10, 7, 10, 9, "D").rect(12, 7, 12, 10, "D").rect(14, 7, 14, 9, "D");
  s.outline("OPD", "B", "K");
  s.ellipse(12, 18, 4.2, 2.6, "W");
  s.rect(7, 13, 8, 14, "K").rect(16, 13, 17, 14, "K");
  s.set(7, 13, "W").set(16, 13, "W");
  s.rect(11, 16, 12, 16, "P");
  s.rect(11, 18, 12, 18, "K");
  return s.toPicture("Cat", {
    B: "#bff0d9",
    O: "#ff8c26",
    D: "#a83a1a",
    P: "#f58fb2",
    W: "#fff6ea",
    K: "#3a2a2a",
  });
}

function planet(): Picture {
  const s = new Sketch(28, 28, "N");
  const stars = [
    [2, 3], [7, 1], [12, 4], [20, 2], [25, 8], [3, 10], [1, 20], [6, 25], [14, 26], [22, 24],
    [26, 18], [9, 8], [18, 6], [24, 13], [4, 16],
  ];
  for (const [x, y] of stars) s.set(x, y, "W");
  s.circle(23, 5, 2.3, "M");
  s.circle(14, 14, 7.8, "A");
  s.paint("C", (_x, y) => Math.floor((y - 6) / 2.4) % 2 === 1, "A");
  const ring = (x: number, y: number) => {
    const d = ((x - 14) / 13.2) ** 2 + ((y - 15) / 3.6) ** 2;
    return d >= 0.62 && d <= 1;
  };
  // The back half of the ring is hidden behind the planet.
  s.paint("R", (x, y) => ring(x, y) && !(y < 15 && (x - 14) ** 2 + (y - 14) ** 2 <= 7.8 ** 2));
  return s.toPicture("Ringed Planet", {
    N: "#2b2d5c",
    W: "#ffffff",
    M: "#97a2b8",
    A: "#ef6a35",
    C: "#ffd84f",
    R: "#a874ff",
  });
}

function duck(): Picture {
  const s = new Sketch(24, 24, "B");
  // Body with a perky tail, and a round head.
  s.ellipse(11, 15, 8.5, 4.6, "Y");
  s.triangle(2, 9.5, 4.5, 15, 8.5, 13, "Y");
  s.circle(15.5, 8, 4.4, "Y");
  s.outline("Y", "B", "K");
  // Beak, eye and a shine on the head.
  s.rect(20, 8, 21, 9, "O").set(22, 9, "O");
  s.set(16, 7, "K").set(14, 6, "W");
  // Water covering the bottom of the duck, with white crests.
  s.rect(0, 19, 23, 23, "S");
  s.paint("W", (_x, y) => (y > 19 && y < 20) || (y > 22 && y < 23), "S");
  s.paint("S", (x, y) => y > 19 && Math.sin(x * 1.3) < 0.2, "W");
  return s.toPicture("Rubber Duck", {
    B: "#c79af0",
    Y: "#ffd21f",
    K: "#2b2340",
    O: "#ff6a13",
    W: "#ffffff",
    S: "#1a69cf",
  });
}

function cactus(): Picture {
  const s = new Sketch(22, 24, "B");
  // Trunk with a rounded top, and two arms.
  s.rect(8, 6, 13, 17, "G").circle(10.5, 6, 3, "G");
  s.rect(3, 8, 5, 13, "G").circle(4, 8, 1.6, "G").rect(3, 13, 8, 15, "G");
  s.rect(16, 6, 18, 11, "G").circle(17, 6, 1.6, "G").rect(13, 11, 18, 13, "G");
  s.outline("G", "B", "g");
  s.rect(10, 5, 10, 16, "g"); // a rib down the trunk
  // A flower on top.
  s.circle(10.5, 2.6, 1.9, "P").set(10, 2, "Y").set(11, 2, "Y");
  // Terracotta pot with a rim.
  s.rect(4, 18, 17, 19, "T");
  s.paint("T", (x, y) => y > 20 && Math.abs(x - 11) <= 5.5 - (y - 20) * 0.5);
  return s.toPicture("Cactus", {
    B: "#8ed0f5",
    G: "#4cbb4f",
    g: "#14522a",
    P: "#ff4fa0",
    Y: "#ffd21f",
    T: "#b84a24",
  });
}

function iceCream(): Picture {
  const s = new Sketch(22, 28, "N");
  // A wide waffle cone with a criss-cross pattern.
  s.triangle(3.5, 15.5, 18.5, 15.5, 11, 27.8, "C");
  s.paint("c", (x, y) => Math.floor(x + y) % 4 === 0 || Math.floor(x - y + 60) % 4 === 0, "C");
  // Mint scoop, wider than the cone, melting over its rim in separate drips.
  s.ellipse(11, 13.4, 8.4, 3.3, "M");
  for (const [x, len] of [[5, 2], [9, 3], [13, 1], [16, 2]]) s.rect(x, 16, x, 16 + len, "M");
  // A round strawberry scoop on top, with sprinkles.
  s.circle(11, 8.4, 5.3, "P");
  for (const [x, y] of [[8, 6], [12, 5], [14, 8], [9, 10], [11, 8], [7, 9], [13, 11]]) s.set(x, y, "W");
  // A cherry with a little stem.
  s.circle(11.5, 2.4, 1.7, "R");
  s.set(12, 0, "c").set(13, 0, "c");
  return s.toPicture("Ice Cream", {
    N: "#2e3a6e",
    C: "#f0b264",
    c: "#5e3210",
    M: "#4fd29a",
    P: "#ff94c6",
    W: "#ffffff",
    R: "#f2002f",
  });
}

function rocket(): Picture {
  const s = new Sketch(24, 28, "N");
  const stars = [[2, 2], [20, 3], [5, 9], [21, 11], [3, 17], [19, 19], [6, 25], [18, 26], [10, 1], [15, 5]];
  for (const [x, y] of stars) s.set(x, y, "Y");
  // Body: a tall rounded hull with a red nose.
  s.ellipse(12, 11.5, 4.7, 10, "W");
  s.rect(8, 12, 15, 20, "W");
  s.paint("R", (_x, y) => y < 5.5, "W");
  // Fins.
  s.triangle(8, 14, 8, 22, 3.5, 22, "R").triangle(16, 14, 16, 22, 20.5, 22, "R");
  // Round window.
  s.circle(12, 10.5, 2.5, "B");
  // Flame.
  s.triangle(8.5, 21, 15.5, 21, 12, 27.8, "O").triangle(10, 21, 14, 21, 12, 25.5, "Y");
  return s.toPicture("Rocket", {
    N: "#1b1f3a",
    Y: "#ffd21f",
    W: "#ffffff",
    R: "#d61f4a",
    B: "#3fa2e3",
    O: "#ff7a14",
  });
}

function watermelon(): Picture {
  const s = new Sketch(26, 20, "B");
  // A half slice, flat side up: dark rind, light rind, red flesh.
  const inside = (r: number) => (x: number, y: number) => y >= 3 && (x - 13) ** 2 + (y - 3) ** 2 <= r * r;
  s.paint("G", inside(12.5)).paint("L", inside(11)).paint("R", inside(9.6));
  for (const [x, y] of [[8, 6], [12, 5], [16, 6], [10, 9], [14, 9], [18, 9], [7, 9], [12, 12], [16, 11]]) {
    s.set(x, y, "K");
  }
  return s.toPicture("Watermelon", {
    B: "#b3c7ff",
    G: "#257a35",
    L: "#c4ee86",
    R: "#ff4b5c",
    K: "#2b2340",
  });
}

export interface LevelSpec extends BuildOptions {
  picture: Picture;
}

export function builtInLevels(): LevelSpec[] {
  return [
    { picture: strawberry(), edges: "all", shuffle: 0.2, targetWinRate: 1, seed: 11 },
    { picture: mushroom(), edges: "bottom", shuffle: 0.5, targetWinRate: 0.85, seed: 23 },
    { picture: sunset(), edges: "bottom", shuffle: 0.5, targetWinRate: 0.6, seed: 37 },
    { picture: planet(), edges: "bottom", shuffle: 2, targetWinRate: 0.45, seed: 61 },
    { picture: cat(), edges: "bottom", shuffle: 0.8, targetWinRate: 0.4, seed: 41 },
    // A second run of levels, again from easier to harder.
    { picture: cactus(), edges: "bottom", shuffle: 1.5, targetWinRate: 0.75, seed: 71 },
    { picture: rocket(), edges: "bottom", shuffle: 1.5, targetWinRate: 0.8, seed: 101 },
    { picture: duck(), edges: "bottom", shuffle: 0.6, targetWinRate: 0.7, seed: 67 },
    { picture: iceCream(), edges: "bottom", shuffle: 1.5, targetWinRate: 0.5, seed: 83 },
    { picture: watermelon(), edges: "bottom", shuffle: 1.5, targetWinRate: 0.35, seed: 101 },
  ];
}
