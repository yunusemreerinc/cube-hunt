/** Mixes a hex color towards black (amt < 0) or white (amt > 0). */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt),
  );
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
}

export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

/** A chunky 3D-ish tile: darker base, colored face, light top edge. */
export function tile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  depth: number,
  r: number,
): void {
  ctx.fillStyle = shade(color, -0.32);
  roundRect(ctx, x, y + depth, w, h - depth, r);
  ctx.fill();
  ctx.fillStyle = color;
  roundRect(ctx, x, y, w, h - depth, r);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  roundRect(ctx, x + w * 0.12, y + 2, w * 0.76, Math.max(2, (h - depth) * 0.18), r / 2);
  ctx.fill();
}

/** Big bubbly number, readable on any block color. */
export function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
): void {
  ctx.font = `800 ${size}px ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = size * 0.22;
  ctx.strokeStyle = shade(color, -0.55);
  ctx.strokeText(text, x, y);
  ctx.fillStyle = "#fff";
  ctx.fillText(text, x, y);
}

/**
 * A tiny top-down pickup truck facing `angle` (front points along +x), painted in
 * `color`. With `cargo` set it carries one cube of that color on its bed.
 */
export function car(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  color: string,
  cargo: boolean,
  s = 1,
  alpha = 1,
): void {
  const dark = shade(color, -0.55);
  ctx.save();
  ctx.globalAlpha *= alpha;

  // Soft shadow on the table, always cast down and to the right.
  ctx.save();
  ctx.translate(x + 1.5 * s, y + 2.5 * s);
  ctx.rotate(angle);
  ctx.fillStyle = "rgba(60,30,10,0.22)";
  ctx.beginPath();
  ctx.ellipse(0, 0, 11.5 * s, 6.5 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(s, s);

  // Wheels stick out a little past the body.
  ctx.fillStyle = "#2b2420";
  for (const wx of [-6.5, 5.5]) {
    for (const wy of [-5.9, 5.9]) {
      roundRect(ctx, wx - 2.6, wy - 1.4, 5.2, 2.8, 1.2);
      ctx.fill();
    }
  }

  // Body.
  ctx.fillStyle = color;
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1;
  roundRect(ctx, -10.5, -5.5, 21, 11, 3);
  ctx.fill();
  ctx.stroke();

  // Hood, a touch lighter, and headlights.
  ctx.fillStyle = shade(color, 0.18);
  roundRect(ctx, 4.5, -4.3, 5.4, 8.6, 2);
  ctx.fill();
  ctx.fillStyle = "#fff3b0";
  ctx.beginPath();
  ctx.arc(10, -3.4, 1, 0, Math.PI * 2);
  ctx.arc(10, 3.4, 1, 0, Math.PI * 2);
  ctx.fill();

  // Cab: windshield and roof.
  ctx.fillStyle = "#d5eef8";
  roundRect(ctx, 2.2, -4.1, 2.4, 8.2, 1);
  ctx.fill();
  ctx.fillStyle = shade(color, -0.12);
  roundRect(ctx, -1.8, -4.3, 4, 8.6, 1.5);
  ctx.fill();

  // Open bed at the back.
  ctx.fillStyle = shade(color, -0.4);
  roundRect(ctx, -9.6, -4.4, 7, 8.8, 1.5);
  ctx.fill();

  if (cargo) {
    // The same glossy, rounded cube as on the board, with a shine that radiates from
    // the middle so it looks right whichever way the truck faces.
    const c = 8;
    const cx = -6.2 - c / 2;
    const cy = -c / 2;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    roundRect(ctx, cx + 0.8, cy + 0.9, c, c, 2.2);
    ctx.fill();
    const glow = ctx.createRadialGradient(cx + c / 2, cy + c / 2, 0, cx + c / 2, cy + c / 2, c * 0.72);
    glow.addColorStop(0, shade(color, 0.32));
    glow.addColorStop(0.6, color);
    glow.addColorStop(1, shade(color, -0.18));
    ctx.fillStyle = glow;
    roundRect(ctx, cx, cy, c, c, 2.2);
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * A glossy, rounded cube drawn onto its own canvas `px` device pixels square, so
 * the board can stamp copies instead of redrawing gradients for every cube.
 * Layers: a darker base for depth, a face that fades from light to the full
 * color, a soft gloss band, a small top-left highlight and a crisp edge.
 */
export function cubeSprite(color: string, px: number): HTMLCanvasElement {
  const size = Math.max(4, Math.round(px));
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  const s = size;
  const r = s * 0.24;
  const depth = Math.max(1, s * 0.11);
  const face = s - depth;

  // Base, peeking out below the face.
  g.fillStyle = shade(color, -0.34);
  roundRect(g, 0, depth, s, face, r);
  g.fill();

  // Face: lighter at the top, a touch darker at the bottom.
  const grad = g.createLinearGradient(0, 0, 0, face);
  grad.addColorStop(0, shade(color, 0.24));
  grad.addColorStop(0.55, color);
  grad.addColorStop(1, shade(color, -0.07));
  g.fillStyle = grad;
  roundRect(g, 0, 0, s, face, r);
  g.fill();

  // Soft gloss band across the top.
  const gloss = g.createLinearGradient(0, s * 0.06, 0, face * 0.5);
  gloss.addColorStop(0, "rgba(255,255,255,0.42)");
  gloss.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gloss;
  roundRect(g, s * 0.13, s * 0.06, s * 0.74, face * 0.44, r * 0.7);
  g.fill();

  // Small highlight in the top-left corner.
  g.fillStyle = "rgba(255,255,255,0.75)";
  g.beginPath();
  g.ellipse(s * 0.28, s * 0.22, s * 0.075, s * 0.045, -0.6, 0, Math.PI * 2);
  g.fill();

  // Crisp outline so light colors stay distinct from the board.
  g.globalAlpha = 0.35;
  g.strokeStyle = shade(color, -0.45);
  g.lineWidth = Math.max(1, s * 0.03);
  const inset = g.lineWidth / 2;
  roundRect(g, inset, inset, s - 2 * inset, s - 2 * inset, r);
  g.stroke();
  g.globalAlpha = 1;
  return canvas;
}

/** The faint rounded socket left where a cube has been taken. */
export function socketSprite(px: number): HTMLCanvasElement {
  const size = Math.max(4, Math.round(px));
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  const r = size * 0.24;
  g.fillStyle = "rgba(150,120,90,0.10)";
  roundRect(g, 0, 0, size, size, r);
  g.fill();
  // A slightly darker top edge reads as a shallow recess.
  g.fillStyle = "rgba(120,90,60,0.08)";
  roundRect(g, 0, 0, size, size * 0.3, r);
  g.fill();
  return canvas;
}
