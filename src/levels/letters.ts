import type { Picture } from "../core/types";
import type { LevelSpec } from "./art";

/** Five-by-seven uppercase glyphs, in English alphabetical order. */
const LETTERS: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  J: ["#####", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "##..#", "#.#.#", "#..##", "#..##", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
};

const COLORS = ["#ff586b", "#ff992e", "#ffe05a", "#51d5a0", "#b28aff"];
const WIDTH = 32;
const HEIGHT = 40;
const STROKE = 4;
const MARGIN = 6;

function letterPicture(letter: string, rows: string[], index: number): Picture {
  // The background is palette index 0; each glyph pixel fills four cubes
  // across and down. Three horizontal bands make each letter a color puzzle.
  const cells = new Int16Array(WIDTH * HEIGHT);
  rows.forEach((row, y) => {
    const color = y < 2 ? 1 : y < 5 ? 2 : 3;
    [...row].forEach((cell, x) => {
      if (cell !== "#") return;
      const left = MARGIN + x * STROKE;
      const top = MARGIN + y * STROKE;
      for (let dy = 0; dy < STROKE; dy++) {
        const start = (top + dy) * WIDTH + left;
        cells.fill(color, start, start + STROKE);
      }
    });
  });
  return {
    name: `Letter ${letter}`,
    width: WIDTH,
    height: HEIGHT,
    cells,
    palette: ["#252b50", ...[0, 1, 2].map((offset) => COLORS[(index + offset) % COLORS.length])],
  };
}

/** A separate level for every uppercase English letter, A through Z. */
export function letterLevels(): LevelSpec[] {
  return Object.entries(LETTERS).map(([letter, rows], index) => ({
    picture: letterPicture(letter, rows, index),
    edges: "bottom",
    shuffle: 1,
    targetWinRate: 0.6,
    seed: 100 + index,
  }));
}
