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
    // The cube sits proud of the bed: drop shadow, beveled sides, lighter top face.
    const c = 8;
    const cx = -6.2 - c / 2;
    const cy = -c / 2;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(cx + 0.9, cy + 0.9, c, c);
    ctx.fillStyle = shade(color, -0.22);
    ctx.fillRect(cx, cy, c, c);
    ctx.fillStyle = shade(color, 0.14);
    ctx.fillRect(cx + 1.3, cy + 1.3, c - 2.6, c - 2.6);
    // Same highlight on every side, so it still looks right when the truck turns.
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 0.8;
    ctx.strokeRect(cx + 1.7, cy + 1.7, c - 3.4, c - 3.4);
    ctx.strokeStyle = dark;
    ctx.lineWidth = 0.9;
    ctx.strokeRect(cx, cy, c, c);
  }
  ctx.restore();
}
