import type { Picture } from "../core/types";
import type { LevelSpec } from "./art";

const DIGITS = [
  [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  ["#####", "#....", "#....", "####.", "....#", "....#", "####."],
  [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
];

const COLORS = ["#ff586b", "#ff992e", "#ffe05a", "#51d5a0", "#b28aff"];
const WIDTH = 32;
const HEIGHT = 40;
const STROKE = 4;
const MARGIN = 6;

function numberPicture(digit: number): Picture {
  // Palette index 0 is the background. Each glyph pixel becomes a 4x4 block
  // of cubes, with three horizontal color bands for the player to sort.
  const cells = new Int16Array(WIDTH * HEIGHT);
  DIGITS[digit].forEach((row, y) => {
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
    name: `Number ${digit}`,
    width: WIDTH,
    height: HEIGHT,
    cells,
    palette: ["#252b50", ...[0, 1, 2].map((offset) => COLORS[(digit + offset) % COLORS.length])],
  };
}

/** Separate level pack containing one board for each digit, in numeric order. */
export function numberLevels(): LevelSpec[] {
  return DIGITS.map((_, digit) => ({
    picture: numberPicture(digit),
    edges: "bottom",
    shuffle: 1,
    targetWinRate: 0.6,
    seed: 10 + digit,
  }));
}
