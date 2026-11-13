import { EMPTY, type Picture } from "../core/types";

type RGB = [number, number, number];

/**
 * Reduces RGBA pixels to at most `k` colors with k-means. Transparent pixels
 * (alpha < 128) become EMPTY. Pure function, so it can be tested without a DOM.
 */
export function quantize(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  k: number,
  name = "Your picture",
): Picture {
  const px: RGB[] = [];
  const idx: number[] = [];
  for (let i = 0; i < width * height; i++) {
    if (rgba[i * 4 + 3] < 128) continue;
    px.push([rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]]);
    idx.push(i);
  }
  const cells = new Int16Array(width * height).fill(EMPTY);
  if (px.length === 0) return { name, width, height, cells, palette: [] };

  const dist = (a: RGB, b: RGB) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

  // Deterministic k-means++ style init: start from the first pixel, then repeatedly
  // take the pixel farthest from all chosen centers.
  const centers: RGB[] = [[...px[0]]];
  while (centers.length < k) {
    let far = -1;
    let farD = 0;
    px.forEach((p, i) => {
      const d = Math.min(...centers.map((c) => dist(p, c)));
      if (d > farD) {
        farD = d;
        far = i;
      }
    });
    if (far < 0 || farD < 200) break; // remaining pixels are near-duplicates
    centers.push([...px[far]]);
  }

  const assign = new Int16Array(px.length);
  for (let iter = 0; iter < 12; iter++) {
    px.forEach((p, i) => {
      let best = 0;
      let bestD = Infinity;
      centers.forEach((c, j) => {
        const d = dist(p, c);
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      });
      assign[i] = best;
    });
    const sum = centers.map(() => [0, 0, 0, 0]);
    px.forEach((p, i) => {
      const s = sum[assign[i]];
      s[0] += p[0];
      s[1] += p[1];
      s[2] += p[2];
      s[3]++;
    });
    sum.forEach((s, j) => {
      if (s[3]) centers[j] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
    });
  }

  // Drop empty clusters and renumber.
  const used = [...new Set(assign)].sort((a, b) => a - b);
  const remap = new Map(used.map((c, i) => [c, i]));
  px.forEach((_, i) => (cells[idx[i]] = remap.get(assign[i])!));
  const hex = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  const palette = used.map((c) => `#${hex(centers[c][0])}${hex(centers[c][1])}${hex(centers[c][2])}`);
  return { name, width, height, cells, palette };
}

/** Loads an image file, scales it down to `maxSide` cells and quantizes it. */
export async function pictureFromFile(file: File, maxSide = 28, colors = 6): Promise<Picture> {
  const bmp = await createImageBitmap(file);
  const scale = maxSide / Math.max(bmp.width, bmp.height);
  const w = Math.max(4, Math.round(bmp.width * scale));
  const h = Math.max(4, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  return quantize(data, w, h, colors, file.name.replace(/\.[^.]+$/, "") || "Your picture");
}
