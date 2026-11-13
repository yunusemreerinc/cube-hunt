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
    B: "#a5e6f7",
    G: "#5cc464",
    R: "#e8424f",
    W: "#ffffff",
    C: "#f6e1bb",
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
    O: "#ff9f43",
    Y: "#ffd84a",
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
    O: "#f7a440",
    D: "#d97328",
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
    W: "#fff7c2",
    M: "#cfd6e6",
    A: "#f39c6b",
    C: "#f6d28a",
    R: "#b8a3f5",
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
    { picture: planet(), edges: "bottom", shuffle: 1.5, targetWinRate: 0.45, seed: 59 },
    { picture: cat(), edges: "bottom", shuffle: 0.8, targetWinRate: 0.4, seed: 41 },
  ];
}
