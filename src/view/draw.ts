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

/** A little ant facing `angle`, legs wiggling with `t`. */
export function ant(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  color: string,
  t: number,
  s = 1,
): void {
  const dark = shade(color, -0.6);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(s, s);
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.3;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let k = -1; k <= 1; k++) {
    const w = Math.sin(t * 22 + k * 2.1) * 1.8;
    ctx.moveTo(k * 2.4, 0);
    ctx.lineTo(k * 2.4 + w, -6);
    ctx.moveTo(k * 2.4, 0);
    ctx.lineTo(k * 2.4 - w, 6);
  }
  // antennae
  ctx.moveTo(5.5, -1);
  ctx.lineTo(9, -4);
  ctx.moveTo(5.5, 1);
  ctx.lineTo(9, 4);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.lineWidth = 1.2;
  for (const [cx, rx, ry] of [
    [-5, 4.2, 3.3],
    [0.3, 2.3, 2],
    [4.6, 2.8, 2.6],
  ]) {
    ctx.beginPath();
    ctx.ellipse(cx, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // eyes
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(5.6, -1.1, 0.9, 0, Math.PI * 2);
  ctx.arc(5.6, 1.1, 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
