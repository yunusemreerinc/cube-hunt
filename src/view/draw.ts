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

/** Truck images, drawn once per color, cargo and resolution, then stamped rotated. */
const truckSprites = new Map<string, HTMLCanvasElement>();
/** The truck image's size in truck units (it is 21 long and 11 wide, wheels a little wider). */
const TRUCK_W = 24;
const TRUCK_H = 15;

/**
 * A tiny top-down pickup truck facing `angle` (front points along +x), painted in
 * `color`, at scale `s`. With `cargo` set it carries one cube of that color on its
 * bed. The truck itself comes from a cached image; only its shadow is drawn live,
 * so it always falls down and to the right whichever way the truck faces.
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
  ctx.save();
  ctx.globalAlpha *= alpha;

  // Soft shadow on the table.
  ctx.save();
  ctx.translate(x + 1.5 * s, y + 2.5 * s);
  ctx.rotate(angle);
  ctx.fillStyle = "rgba(60,30,10,0.24)";
  ctx.beginPath();
  ctx.ellipse(0, 0, 11.5 * s, 6.5 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Draw the image at (at least) the canvas's real pixel density so it stays sharp.
  const m = ctx.getTransform();
  const res = Math.max(2, Math.ceil(Math.hypot(m.a, m.b) * Math.max(1, s) * 2) / 2);
  const key = `${color}|${cargo ? 1 : 0}|${res}`;
  let img = truckSprites.get(key);
  if (!img) {
    img = truckSprite(color, cargo, res);
    truckSprites.set(key, img);
  }
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.drawImage(img, (-TRUCK_W / 2) * s, (-TRUCK_H / 2) * s, TRUCK_W * s, TRUCK_H * s);
  ctx.restore();
}

/**
 * Paints one truck, `res` pixels per truck unit, facing right: chunky tires, a
 * body shaded across its width so it reads as rounded, a hood with a glossy
 * crease and headlights, a tinted glass cab with a reflection, side mirrors, and
 * an open bed with ribs, a rim and taillights, holding a glossy cube when loaded.
 */
function truckSprite(color: string, cargo: boolean, res: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(TRUCK_W * res);
  canvas.height = Math.ceil(TRUCK_H * res);
  const g = canvas.getContext("2d")!;
  g.scale(res, res);
  g.translate(TRUCK_W / 2, TRUCK_H / 2);
  const deep = shade(color, -0.5);

  // Tires, with a lighter tread line.
  for (const wx of [-6.6, 5.6]) {
    for (const wy of [-5.75, 5.75]) {
      g.fillStyle = "#1e1916";
      roundRect(g, wx - 2.7, wy - 1.5, 5.4, 3, 1.3);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.14)";
      roundRect(g, wx - 2, wy - 0.35, 4, 0.7, 0.35);
      g.fill();
    }
  }

  // Body: a darker rim all round, then the painted top, lighter down the middle.
  g.fillStyle = deep;
  roundRect(g, -10.7, -5.7, 21.4, 11.4, 3.4);
  g.fill();
  // A faint light edge, so dark trucks still stand out against dark cubes.
  g.strokeStyle = "rgba(255,255,255,0.4)";
  g.lineWidth = 0.5;
  roundRect(g, -10.95, -5.95, 21.9, 11.9, 3.6);
  g.stroke();
  const paint = g.createLinearGradient(0, -5.2, 0, 5.2);
  paint.addColorStop(0, shade(color, -0.12));
  paint.addColorStop(0.3, shade(color, 0.18));
  paint.addColorStop(0.55, color);
  paint.addColorStop(1, shade(color, -0.22));
  g.fillStyle = paint;
  roundRect(g, -10.2, -5.2, 20.4, 10.4, 3);
  g.fill();

  // Hood: a glossy crease down the middle, a dark grille and two headlights.
  g.strokeStyle = "rgba(255,255,255,0.45)";
  g.lineWidth = 0.6;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(4.8, -1.4);
  g.lineTo(9.2, -1.2);
  g.stroke();
  g.fillStyle = deep;
  roundRect(g, 9.75, -2, 0.6, 4, 0.3);
  g.fill();
  g.fillStyle = "#fff7c8";
  for (const hy of [-3.9, 2.5]) {
    roundRect(g, 9.1, hy, 1.2, 1.4, 0.5);
    g.fill();
  }

  // Cab: tinted windshield with a reflection, the roof, and a strip of rear window.
  const glass = g.createLinearGradient(1.6, 0, 4.4, 0);
  glass.addColorStop(0, "#22303f");
  glass.addColorStop(1, "#46647e");
  g.fillStyle = glass;
  g.beginPath();
  g.moveTo(1.5, -4.4);
  g.lineTo(4.3, -3.8);
  g.quadraticCurveTo(4.7, 0, 4.3, 3.8);
  g.lineTo(1.5, 4.4);
  g.closePath();
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.4)";
  g.beginPath();
  g.moveTo(2.3, -4.1);
  g.lineTo(3.2, -3.9);
  g.lineTo(2.6, -0.6);
  g.lineTo(1.9, -0.8);
  g.closePath();
  g.fill();
  const roof = g.createLinearGradient(0, -4.3, 0, 4.3);
  roof.addColorStop(0, shade(color, 0.05));
  roof.addColorStop(0.35, shade(color, 0.3));
  roof.addColorStop(1, shade(color, -0.1));
  g.fillStyle = roof;
  roundRect(g, -2.2, -4.3, 3.9, 8.6, 1.5);
  g.fill();
  g.fillStyle = "#2a3644";
  roundRect(g, -2.75, -3.8, 0.7, 7.6, 0.35);
  g.fill();
  // Side mirrors.
  g.fillStyle = shade(color, -0.25);
  for (const my of [-1, 1]) {
    g.beginPath();
    g.ellipse(2.6, my * 5.75, 0.75, 0.55, 0, 0, Math.PI * 2);
    g.fill();
  }

  // Open bed: a recessed floor with ribs, a bright rim and red taillights.
  g.fillStyle = shade(color, -0.55);
  roundRect(g, -9.8, -4.3, 6.8, 8.6, 1.3);
  g.fill();
  g.strokeStyle = "rgba(0,0,0,0.22)";
  g.lineWidth = 0.45;
  for (const ry of [-2.2, 0, 2.2]) {
    g.beginPath();
    g.moveTo(-9.2, ry);
    g.lineTo(-3.6, ry);
    g.stroke();
  }
  g.strokeStyle = shade(color, 0.22);
  g.lineWidth = 0.55;
  roundRect(g, -9.8, -4.3, 6.8, 8.6, 1.3);
  g.stroke();
  g.fillStyle = "#ff4d4d";
  for (const ty of [-4.6, 3.2]) {
    roundRect(g, -10.45, ty, 0.8, 1.4, 0.35);
    g.fill();
  }

  if (cargo) {
    // The same glossy cube as on the board, sitting square in the bed.
    const c = 7;
    const px = Math.max(4, Math.round(c * res));
    g.fillStyle = "rgba(0,0,0,0.28)";
    roundRect(g, -6.3 - c / 2 + 0.5, -c / 2 + 0.6, c, c, 1.8);
    g.fill();
    g.drawImage(cubeSprite(color, px), -6.3 - c / 2, -c / 2, c, c);
  }
  return canvas;
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

/**
 * A glossy rounded block for the slots and the tray, in the same style as the
 * board's cubes: soft shadow, darker base for depth, a face that fades from light
 * to the full color, a gloss band and a crisp edge.
 */
export function pod(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  r = 14,
): void {
  const depth = Math.max(3, h * 0.1);
  const face = h - depth;
  ctx.save();
  ctx.shadowColor = "rgba(80,45,15,0.28)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = shade(color, -0.32);
  roundRect(ctx, x, y + depth, w, face, r);
  ctx.fill();
  ctx.restore();

  const grad = ctx.createLinearGradient(0, y, 0, y + face);
  grad.addColorStop(0, shade(color, 0.22));
  grad.addColorStop(0.6, color);
  grad.addColorStop(1, shade(color, -0.05));
  ctx.fillStyle = grad;
  roundRect(ctx, x, y, w, face, r);
  ctx.fill();

  const gloss = ctx.createLinearGradient(0, y + 2, 0, y + face * 0.48);
  gloss.addColorStop(0, "rgba(255,255,255,0.4)");
  gloss.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gloss;
  roundRect(ctx, x + w * 0.08, y + 2.5, w * 0.84, face * 0.46, r * 0.75);
  ctx.fill();

  ctx.save();
  ctx.globalAlpha *= 0.35;
  ctx.strokeStyle = shade(color, -0.45);
  ctx.lineWidth = 1;
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, face - 1, r);
  ctx.stroke();
  ctx.restore();
}

/**
 * A crate's number: white with a soft shadow, or dark on light colors so it
 * always stays readable.
 */
/** The heavy rounded face used by countLabel, with its slightly tight spacing. */
function labelFont(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.font = `900 ${size}px ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", system-ui, sans-serif`;
  // Tight letters, but a little extra room between words so labels stay easy to read.
  const spaced = ctx as CanvasRenderingContext2D & { letterSpacing?: string; wordSpacing?: string };
  if ("letterSpacing" in ctx) spaced.letterSpacing = `${-size * 0.02}px`;
  if ("wordSpacing" in ctx) spaced.wordSpacing = `${size * 0.12}px`;
}

/** The rounded face for sentences: the labels' family, heavy but without outline or tight spacing. */
export const BODY_FONT = `800 15px ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", system-ui, sans-serif`;

/** How wide countLabel draws `text` at `size`, for laying out an icon beside it. */
export function labelWidth(ctx: CanvasRenderingContext2D, text: string, size: number): number {
  ctx.save();
  labelFont(ctx, size);
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w;
}

/**
 * A crate's truck count (and button labels to match), styled like a modern game label: a heavy rounded face
 * with a soft gradient fill, a crisp rounded outline in a deep shade of the
 * crate's color, and a solid drop under it so the number looks pressed out of
 * the crate. Light crates get dark lettering with a white edge instead.
 * `flat` leaves out the drop and thins the outline, for small or faded crates.
 * With `maxWidth`, a label that would be wider shrinks to fit.
 */
export function countLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  flat = false,
  maxWidth = Infinity,
): void {
  if (maxWidth < Infinity) {
    const w = labelWidth(ctx, text, size);
    if (w > maxWidth) size *= maxWidth / w;
  }
  ctx.save();
  labelFont(ctx, size);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  const light = luminance(color) > 0.72;
  const edge = light ? "#ffffff" : shade(color, -0.62);
  const drop = Math.max(1.5, size * 0.08);
  const outline = size * (flat ? 0.1 : 0.16);
  const top = y - size * 0.42;
  const bottom = y + size * 0.42;

  // The drop: a solid copy of the outline a little lower, with a soft shadow.
  if (!flat) {
    ctx.save();
    ctx.shadowColor = "rgba(40,20,5,0.35)";
    ctx.shadowBlur = size * 0.18;
    ctx.shadowOffsetY = size * 0.06;
    ctx.strokeStyle = light ? shade(color, -0.2) : shade(color, -0.75);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = outline;
    ctx.strokeText(text, x, y + drop);
    ctx.fillText(text, x, y + drop);
    ctx.restore();
  }

  // The outline.
  ctx.strokeStyle = edge;
  ctx.lineWidth = outline;
  ctx.strokeText(text, x, y);

  // The face: bright on top, fading into a hint of the crate's color.
  const fill = ctx.createLinearGradient(0, top, 0, bottom);
  if (light) {
    fill.addColorStop(0, shade(color, -0.5));
    fill.addColorStop(1, shade(color, -0.72));
  } else {
    fill.addColorStop(0, "#ffffff");
    fill.addColorStop(0.55, "#ffffff");
    fill.addColorStop(1, shade(color, 0.7));
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** A soft recessed well: where an empty slot waits for a crate. */
export function well(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 14): void {
  ctx.fillStyle = "rgba(110,70,30,0.13)";
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  // Inner shadow fading down from the top edge, light catching the bottom lip.
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, "rgba(80,45,15,0.2)");
  g.addColorStop(0.35, "rgba(80,45,15,0)");
  ctx.fillStyle = g;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + r, y + h - 0.5);
  ctx.lineTo(x + w - r, y + h - 0.5);
  ctx.stroke();
}

/** A small rounded label, e.g. "blocked" under a slot. */
export function pill(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number): void {
  // A small glossy chip, lettered like the other labels.
  const tone = "#6e4a2e";
  const w = labelWidth(ctx, text, 10) + 16;
  const h = 16;
  pod(ctx, cx - w / 2, cy - h / 2, w, h, tone, h / 2);
  countLabel(ctx, text, cx, cy - 0.6, 10, tone, true);
}

/**
 * Faint diagonal "on hold" stripes over a pod's face, so a blocked crate reads as
 * paused while keeping its full color. Dark stripes on light crates, light ones
 * on dark crates.
 */
export function holdStripes(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  r = 14,
): void {
  const face = h - Math.max(3, h * 0.1); // same face height as pod()
  ctx.save();
  roundRect(ctx, x, y, w, face, r);
  ctx.clip();
  ctx.fillStyle = luminance(color) < 0.35 ? "rgba(255,255,255,0.16)" : "rgba(40,20,5,0.16)";
  const step = 11;
  for (let sx = x - face; sx < x + w; sx += step) {
    ctx.beginPath();
    ctx.moveTo(sx, y + face);
    ctx.lineTo(sx + 5, y + face);
    ctx.lineTo(sx + 5 + face, y);
    ctx.lineTo(sx + face, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export type IconKind = "restart" | "prev" | "next" | "fast" | "picture";

/**
 * A white line icon centered on (cx, cy), drawn as shapes rather than font
 * glyphs so it looks the same on every device. `size` is roughly its height.
 */
export function icon(
  ctx: CanvasRenderingContext2D,
  kind: IconKind,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  const s = size / 2;
  ctx.save();
  ctx.shadowColor = shade(color, -0.6);
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1.2;
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.lineWidth = Math.max(2, size * 0.16);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  switch (kind) {
    case "restart": {
      // Three-quarter circle with an arrowhead at its open end.
      const r = s * 0.78;
      const end = -Math.PI * 0.35;
      ctx.arc(cx, cy, r, -Math.PI * 0.05 + Math.PI * 0.5, end + Math.PI * 2 - 0.2, false);
      ctx.stroke();
      const ax = cx + r * Math.cos(end);
      const ay = cy + r * Math.sin(end);
      const h = s * 0.55;
      ctx.beginPath();
      ctx.moveTo(ax + h * 0.95, ay - h * 0.2);
      ctx.lineTo(ax - h * 0.1, ay - h * 0.65);
      ctx.lineTo(ax - h * 0.15, ay + h * 0.55);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "prev":
    case "next": {
      const d = kind === "prev" ? 1 : -1;
      ctx.moveTo(cx + d * s * 0.35, cy - s * 0.7);
      ctx.lineTo(cx - d * s * 0.35, cy);
      ctx.lineTo(cx + d * s * 0.35, cy + s * 0.7);
      ctx.stroke();
      break;
    }
    case "fast": {
      // Two play triangles side by side.
      for (const ox of [-s * 0.55, s * 0.35]) {
        ctx.beginPath();
        ctx.moveTo(cx + ox - s * 0.45, cy - s * 0.62);
        ctx.lineTo(cx + ox + s * 0.5, cy);
        ctx.lineTo(cx + ox - s * 0.45, cy + s * 0.62);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case "picture": {
      // A framed photo: border, a hill and a sun.
      ctx.lineWidth = Math.max(1.6, size * 0.11);
      roundRect(ctx, cx - s, cy - s * 0.78, s * 2, s * 1.56, s * 0.3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.75, cy + s * 0.5);
      ctx.lineTo(cx - s * 0.2, cy - s * 0.1);
      ctx.lineTo(cx + s * 0.15, cy + s * 0.25);
      ctx.lineTo(cx + s * 0.4, cy + s * 0.02);
      ctx.lineTo(cx + s * 0.75, cy + s * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + s * 0.42, cy - s * 0.35, s * 0.16, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

/** A small white counter badge, e.g. how many boosters are left. */
export function badge(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, color: string): void {
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "rgba(0,0,0,0.18)";
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  labelFont(ctx, 13);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = shade(color, -0.35);
  ctx.fillText(text, cx, cy + 0.5);
  ctx.restore();
}

/**
 * A strip of red brick wall filling the rectangle (x, y, w, h): two staggered
 * courses of bricks running along its long side, with light mortar, a lit top
 * edge and a shaded bottom edge.
 */
export function brickWall(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const along = w >= h; // bricks run along the strip's long side
  const len = along ? w : h;
  const thick = along ? h : w;
  const brick = 11; // brick length
  ctx.save();
  ctx.translate(x, y);
  if (!along) {
    // Draw vertical strips as horizontal ones turned a quarter.
    ctx.translate(w, 0);
    ctx.rotate(Math.PI / 2);
  }
  // Mortar shows through the gaps between bricks.
  ctx.fillStyle = "#e9d3b8";
  ctx.fillRect(0, 0, len, thick);
  const course = thick / 2;
  for (let row = 0; row < 2; row++) {
    const top = row * course;
    for (let bx = row === 0 ? 0 : -brick / 2; bx < len; bx += brick) {
      const left = Math.max(0, bx) + 0.5;
      const right = Math.min(len, bx + brick) - 0.5;
      if (right <= left) continue;
      ctx.fillStyle = "#c2553a";
      ctx.fillRect(left, top + 0.5, right - left, course - 1);
      ctx.fillStyle = "rgba(255,220,190,0.35)"; // lit top of each brick
      ctx.fillRect(left, top + 0.5, right - left, Math.max(0.6, course * 0.25));
      ctx.fillStyle = "rgba(70,20,10,0.25)"; // shaded bottom of each brick
      ctx.fillRect(left, top + course - 1.1, right - left, 0.6);
    }
  }
  ctx.restore();
}
