import { Game } from "./core/game";
import { EMPTY, type Level, type Picture } from "./core/types";
import { builtInLevels, type LevelSpec } from "./levels/art";
import { buildLevel } from "./levels/generator";
import { pictureFromFile } from "./levels/image";
import { ant, label, roundRect, shade, tile } from "./view/draw";

// ---- Layout (design units; the canvas is scaled to fit the window) ----
const W = 420;
const H = 900;
const BOARD = { x: 16, y: 64, w: 388, h: 388 };
const HOLE = { x: W / 2, y: 496, rx: 42, ry: 18 };
const SLOT_Y = 540;
const SLOT_H = 66;
const TRAY_Y = 636;
const TRAY_ROWS = 3;
const BLOCK = { w: 80, h: 52, gx: 14, gy: 8 };
const BAR_Y = 836;
const MAX_SLOTS = 6;

/** Milliseconds between ant dispatches at 1x speed. */
const TICK_MS = 110;
const ANT_SPEED = 430; // design px per second at 1x

interface Ant {
  x: number;
  y: number;
  tx: number;
  ty: number;
  color: string;
  cell: number;
  back: boolean;
  angle: number;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}
interface Flyer {
  slot: number;
  fromX: number;
  fromY: number;
  t: number;
  color: string;
  count: number;
}
interface Button {
  x: number;
  y: number;
  w: number;
  h: number;
  onClick: () => void;
}

class App {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly fileInput: HTMLInputElement;
  private readonly specs: LevelSpec[] = builtInLevels();
  private levelIndex = 0;
  /** Set while playing a level made from an uploaded image. */
  private custom: Picture | null = null;
  private level!: Level;
  /** Random-player win rate of the current level, used as a difficulty label. */
  private winRate = 1;
  private game!: Game;
  /** Cells as currently drawn; they disappear when an ant arrives, not when it is sent. */
  private shown!: Int16Array;
  private ants: Ant[] = [];
  private particles: Particle[] = [];
  private flyers: Flyer[] = [];
  private buttons: Button[] = [];
  private speed = 1;
  private tickAcc = 0;
  private slotBoostUsed = false;
  private shake = 0;
  private time = 0;
  private overlayDelay = 0;
  private message = "";
  private scale = 1;

  constructor() {
    this.canvas = document.getElementById("game") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    this.fileInput = document.getElementById("file") as HTMLInputElement;
    this.fileInput.addEventListener("change", () => this.onFile());
    window.addEventListener("resize", () => this.resize());
    this.canvas.addEventListener("pointerdown", (e) => this.onPointer(e));
    const param = Number(new URLSearchParams(location.search).get("level"));
    if (param >= 1 && param <= this.specs.length) this.levelIndex = param - 1;
    this.resize();
    this.startLevel();
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.update(dt);
      this.draw();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  // ---- Level lifecycle ----

  private startLevel(): void {
    const spec = this.specs[this.levelIndex];
    const built = this.custom
      ? buildLevel(this.custom, { seed: 1234, shuffle: 0.7, edges: "bottom", targetWinRate: 0.6 })
      : buildLevel(spec.picture, spec);
    this.level = built.level;
    this.winRate = built.winRate;
    this.game = new Game(this.level);
    this.shown = Int16Array.from(this.level.picture.cells);
    this.ants = [];
    this.particles = [];
    this.flyers = [];
    this.tickAcc = 0;
    this.slotBoostUsed = false;
    this.overlayDelay = 0;
  }

  private goToLevel(i: number): void {
    this.custom = null;
    this.levelIndex = (i + this.specs.length) % this.specs.length;
    this.startLevel();
  }

  private async onFile(): Promise<void> {
    const file = this.fileInput.files?.[0];
    this.fileInput.value = "";
    if (!file) return;
    try {
      this.message = "Building level…";
      this.custom = await pictureFromFile(file);
      this.message = "";
      this.startLevel();
    } catch (err) {
      console.error(err);
      this.message = "Couldn't read that image";
      setTimeout(() => (this.message = ""), 2500);
    }
  }

  private addSlot(): void {
    if (this.slotBoostUsed || this.game.slots.length >= MAX_SLOTS) return;
    this.slotBoostUsed = true;
    this.game.addSlot();
    this.overlayDelay = 0;
  }

  // ---- Geometry ----

  private cellSize(): number {
    const p = this.level.picture;
    return Math.min((BOARD.w - 20) / p.width, (BOARD.h - 20) / p.height);
  }

  private cellCenter(i: number): [number, number] {
    const p = this.level.picture;
    const cs = this.cellSize();
    const ox = BOARD.x + (BOARD.w - cs * p.width) / 2;
    const oy = BOARD.y + (BOARD.h - cs * p.height) / 2;
    const x = i % p.width;
    const y = Math.floor(i / p.width);
    return [ox + (x + 0.5) * cs, oy + (y + 0.5) * cs];
  }

  private slotRect(i: number): { x: number; y: number; w: number; h: number } {
    const n = this.game.slots.length;
    const gap = 10;
    const w = Math.min(68, (W - 32 - gap * (n - 1)) / n);
    const x0 = (W - (n * w + (n - 1) * gap)) / 2;
    return { x: x0 + i * (w + gap), y: SLOT_Y, w, h: SLOT_H };
  }

  private blockRect(col: number, row: number): { x: number; y: number; w: number; h: number } {
    const cols = this.game.columns.length;
    const x0 = (W - (cols * BLOCK.w + (cols - 1) * BLOCK.gx)) / 2;
    return {
      x: x0 + col * (BLOCK.w + BLOCK.gx),
      y: TRAY_Y + row * (BLOCK.h + BLOCK.gy),
      w: BLOCK.w,
      h: BLOCK.h,
    };
  }

  // ---- Input ----

  private onPointer(e: PointerEvent): void {
    const r = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    // Buttons are registered during draw; the last drawn (topmost) wins.
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        b.onClick();
        return;
      }
    }
  }

  private tapColumn(col: number): void {
    const block = this.game.front(col);
    if (!block || this.game.status !== "playing") return;
    if (!this.game.hasFreeSlot()) {
      this.shake = 0.35;
      return;
    }
    const from = this.blockRect(col, 0);
    const color = this.level.picture.palette[block.color];
    const count = block.count;
    const slot = this.game.tap(col);
    if (slot >= 0) {
      this.flyers.push({ slot, fromX: from.x, fromY: from.y, t: 0, color, count });
    }
  }

  // ---- Update ----

  private update(dt: number): void {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt);
    const sdt = dt * this.speed;

    if (this.game.status === "playing") {
      this.tickAcc += sdt * 1000;
      while (this.tickAcc >= TICK_MS) {
        this.tickAcc -= TICK_MS;
        for (const d of this.game.tick()) {
          const r = this.slotRect(d.slot);
          const [tx, ty] = this.cellCenter(d.cell);
          this.ants.push({
            x: r.x + r.w / 2 + (Math.random() - 0.5) * 16,
            y: r.y + 6,
            tx,
            ty,
            color: this.level.picture.palette[d.color],
            cell: d.cell,
            back: false,
            angle: -Math.PI / 2,
          });
        }
      }
    } else {
      this.tickAcc = 0;
    }

    const step = ANT_SPEED * sdt;
    for (const a of this.ants) {
      const dx = a.tx - a.x;
      const dy = a.ty - a.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.01) a.angle = Math.atan2(dy, dx);
      if (d <= step) {
        a.x = a.tx;
        a.y = a.ty;
        if (!a.back) {
          this.eatVisual(a);
          a.back = true;
          a.tx = HOLE.x + (Math.random() - 0.5) * HOLE.rx;
          a.ty = HOLE.y + (Math.random() - 0.5) * HOLE.ry * 0.6;
        } else {
          a.cell = -2; // arrived home; removed below
        }
      } else {
        a.x += (dx / d) * step;
        a.y += (dy / d) * step;
      }
    }
    this.ants = this.ants.filter((a) => a.cell !== -2);

    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 500 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const f of this.flyers) f.t += dt * 5.5;
    this.flyers = this.flyers.filter((f) => f.t < 1);

    if (this.game.status !== "playing" && this.ants.length === 0) this.overlayDelay += dt;
  }

  private eatVisual(a: Ant): void {
    this.shown[a.cell] = EMPTY;
    const cs = this.cellSize();
    for (let k = 0; k < 4; k++) {
      this.particles.push({
        x: a.tx,
        y: a.ty,
        vx: (Math.random() - 0.5) * 160,
        vy: -60 - Math.random() * 120,
        life: 0.35 + Math.random() * 0.2,
        color: a.color,
        size: Math.max(2, cs * 0.35),
      });
    }
  }

  // ---- Draw ----

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    this.canvas.style.width = `${W * this.scale}px`;
    this.canvas.style.height = `${H * this.scale}px`;
    this.canvas.width = Math.round(W * this.scale * dpr);
    this.canvas.height = Math.round(H * this.scale * dpr);
    this.ctx.setTransform(this.scale * dpr, 0, 0, this.scale * dpr, 0, 0);
  }

  private button(x: number, y: number, w: number, h: number, onClick: () => void): void {
    this.buttons.push({ x, y, w, h, onClick });
  }

  private draw(): void {
    const ctx = this.ctx;
    this.buttons = [];
    this.drawBackground();
    this.drawTopBar();
    this.drawBoard();
    this.drawHole();
    this.drawSlots();
    this.drawTray();
    this.drawBottomBar();
    for (const a of this.ants) {
      const s = a.back ? 0.9 : 1;
      ant(ctx, a.x, a.y, a.angle, a.color, this.time, s);
    }
    for (const p of this.particles) {
      ctx.globalAlpha = Math.min(1, p.life * 3);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    this.drawOverlay();
  }

  private drawBackground(): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#efcf9f";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(160,100,40,0.10)";
    for (let x = 0; x < W; x += 70) ctx.fillRect(x, 0, 2, H);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    for (let x = 0; x < W; x += 70) ctx.fillRect(x + 2, 0, 3, H);
  }

  private drawTopBar(): void {
    const ctx = this.ctx;
    const round = (x: number, y: number, r: number, color: string, text: string, fn: () => void) => {
      tile(ctx, x - r, y - r, r * 2, r * 2 + 4, color, 4, r);
      label(ctx, text, x, y, r * 0.95, color);
      this.button(x - r, y - r, r * 2, r * 2 + 4, fn);
    };
    round(30, 32, 18, "#8f7cf0", "↻", () => this.startLevel());
    round(70, 32, 15, "#f0a35c", "‹", () => this.goToLevel(this.levelIndex - 1));
    round(300, 32, 15, "#f0a35c", "›", () => this.goToLevel(this.levelIndex + 1));

    const title = this.custom
      ? this.level.picture.name
      : `${this.levelIndex + 1}/${this.specs.length} · ${this.level.picture.name}`;
    ctx.font = `800 17px ui-rounded, "Nunito", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#6b4523";
    ctx.fillText(title, 185, 25, 190);
    const r = this.winRate;
    const difficulty = r >= 0.9 ? "Easy" : r >= 0.65 ? "Medium" : r >= 0.45 ? "Hard" : "Expert";
    ctx.font = `700 12px ui-rounded, "Nunito", system-ui, sans-serif`;
    ctx.fillStyle = "#9a6b3e";
    ctx.fillText(difficulty, 185, 44);

    // Speed toggle
    tile(ctx, 330, 16, 76, 36, "#3fb6f2", 4, 14);
    label(ctx, `▶▶ ${this.speed}x`, 368, 32, 16, "#3fb6f2");
    this.button(330, 16, 76, 36, () => (this.speed = (this.speed % 3) + 1));
  }

  private drawBoard(): void {
    const ctx = this.ctx;
    const p = this.level.picture;
    ctx.fillStyle = "rgba(120,70,20,0.18)";
    roundRect(ctx, BOARD.x + 2, BOARD.y + 6, BOARD.w, BOARD.h, 16);
    ctx.fill();
    ctx.fillStyle = "#fbf4e8";
    roundRect(ctx, BOARD.x, BOARD.y, BOARD.w, BOARD.h, 16);
    ctx.fill();

    const cs = this.cellSize();
    this.drawWalls(cs);
    const gap = Math.max(0.6, cs * 0.06);
    for (let i = 0; i < this.shown.length; i++) {
      const c = this.shown[i];
      const [cx, cy] = this.cellCenter(i);
      if (c === EMPTY) {
        if (p.cells[i] !== EMPTY) {
          ctx.fillStyle = "rgba(150,120,90,0.10)";
          ctx.fillRect(cx - cs / 2 + gap, cy - cs / 2 + gap, cs - gap * 2, cs - gap * 2);
        }
        continue;
      }
      const color = p.palette[c];
      const x = cx - cs / 2 + gap / 2;
      const y = cy - cs / 2 + gap / 2;
      const s = cs - gap;
      ctx.fillStyle = shade(color, -0.25);
      ctx.fillRect(x, y, s, s);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, s, s * 0.82);
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fillRect(x, y, s, Math.max(1, s * 0.16));
    }
  }

  /** Thick walls on the edges ants can't enter from; the open edge faces the hole. */
  private drawWalls(cs: number): void {
    const { edges, picture: p } = this.level;
    if (edges === "all") return;
    const ctx = this.ctx;
    const x0 = BOARD.x + (BOARD.w - cs * p.width) / 2 - 4;
    const y0 = BOARD.y + (BOARD.h - cs * p.height) / 2 - 4;
    const x1 = x0 + cs * p.width + 8;
    const y1 = y0 + cs * p.height + 8;
    ctx.strokeStyle = "#c08a55";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    if (edges === "bottom") {
      ctx.moveTo(x0, y1);
      ctx.lineTo(x0, y0);
      ctx.lineTo(x1, y0);
      ctx.lineTo(x1, y1);
    } else {
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y0);
    }
    ctx.stroke();
  }

  private drawHole(): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#c79a66";
    ctx.beginPath();
    ctx.ellipse(HOLE.x, HOLE.y + 3, HOLE.rx + 5, HOLE.ry + 5, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(HOLE.x, HOLE.y + 4, 2, HOLE.x, HOLE.y, HOLE.rx);
    g.addColorStop(0, "#2e1a0c");
    g.addColorStop(1, "#7a4b25");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(HOLE.x, HOLE.y, HOLE.rx, HOLE.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawSlots(): void {
    const ctx = this.ctx;
    const dx = this.shake > 0 ? Math.sin(this.shake * 60) * 6 : 0;
    this.game.slots.forEach((b, i) => {
      const r = this.slotRect(i);
      const x = r.x + dx;
      ctx.fillStyle = "rgba(110,70,30,0.18)";
      roundRect(ctx, x, r.y + 6, r.w, r.h, 14);
      ctx.fill();
      const flying = this.flyers.find((f) => f.slot === i);
      if (!b && !flying) {
        ctx.strokeStyle = "rgba(110,70,30,0.35)";
        ctx.setLineDash([6, 5]);
        ctx.lineWidth = 2;
        roundRect(ctx, x + 2, r.y + 2, r.w - 4, r.h - 4, 12);
        ctx.stroke();
        ctx.setLineDash([]);
        return;
      }
      if (flying) {
        const t = 1 - (1 - flying.t) ** 3;
        const fx = flying.fromX + (x - flying.fromX) * t;
        const fy = flying.fromY + (r.y - flying.fromY) * t;
        tile(ctx, fx, fy, r.w, r.h, flying.color, 7, 14);
        label(ctx, String(flying.count), fx + r.w / 2, fy + r.h / 2 - 3, 24, flying.color);
        return;
      }
      if (!b) return;
      const color = this.level.picture.palette[b.color];
      const waiting = !this.game.slotCanEat(i);
      ctx.globalAlpha = waiting ? 0.55 : 1;
      // handle on top, like a little crate lid
      ctx.fillStyle = shade(color, -0.35);
      roundRect(ctx, x + r.w * 0.25, r.y - 7, r.w * 0.5, 12, 5);
      ctx.fill();
      tile(ctx, x, r.y, r.w, r.h, color, 7, 14);
      label(ctx, String(b.count), x + r.w / 2, r.y + r.h / 2 - 3, 24, color);
      ctx.globalAlpha = 1;
      if (waiting) {
        ctx.font = `800 11px ui-rounded, system-ui, sans-serif`;
        ctx.fillStyle = "#6b4523";
        ctx.textAlign = "center";
        ctx.fillText("blocked", x + r.w / 2, r.y + r.h + 14);
      }
    });
  }

  private drawTray(): void {
    const ctx = this.ctx;
    this.game.columns.forEach((col, c) => {
      for (let row = TRAY_ROWS - 1; row >= 0; row--) {
        const b = col[row];
        if (!b) continue;
        const r = this.blockRect(c, row);
        const color = this.level.picture.palette[b.color];
        if (row === 0) {
          tile(ctx, r.x, r.y, r.w, r.h, color, 7, 12);
          label(ctx, String(b.count), r.x + r.w / 2, r.y + r.h / 2 - 3, 24, color);
          this.button(r.x, r.y, r.w, r.h, () => this.tapColumn(c));
        } else {
          ctx.globalAlpha = row === 1 ? 0.5 : 0.3;
          tile(ctx, r.x + 4, r.y, r.w - 8, r.h, color, 6, 12);
          label(ctx, String(b.count), r.x + r.w / 2, r.y + r.h / 2 - 3, 20, color);
          ctx.globalAlpha = 1;
        }
      }
      const hidden = col.length - TRAY_ROWS;
      if (hidden > 0) {
        const r = this.blockRect(c, TRAY_ROWS);
        ctx.font = `800 12px ui-rounded, system-ui, sans-serif`;
        ctx.fillStyle = "rgba(107,69,35,0.7)";
        ctx.textAlign = "center";
        ctx.fillText(`+${hidden} more`, r.x + r.w / 2, r.y + 2);
      }
    });
  }

  private drawBottomBar(): void {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(110,70,30,0.15)";
    ctx.fillRect(0, BAR_Y - 6, W, H - BAR_Y + 6);

    const canSlot = !this.slotBoostUsed && this.game.slots.length < MAX_SLOTS && this.game.status !== "won";
    ctx.globalAlpha = canSlot ? 1 : 0.45;
    tile(ctx, 24, BAR_Y + 6, 176, 52, "#5cc464", 6, 18);
    label(ctx, canSlot ? "+1 Slot  (1)" : "+1 Slot  (0)", 112, BAR_Y + 29, 18, "#5cc464");
    ctx.globalAlpha = 1;
    if (canSlot) this.button(24, BAR_Y + 6, 176, 52, () => this.addSlot());

    tile(ctx, 220, BAR_Y + 6, 176, 52, "#8f7cf0", 6, 18);
    label(ctx, "Your image", 308, BAR_Y + 29, 18, "#8f7cf0");
    this.button(220, BAR_Y + 6, 176, 52, () => this.fileInput.click());
  }

  private drawOverlay(): void {
    if (this.message) {
      this.panel(this.message, "", []);
      return;
    }
    if (this.game.status === "playing" || this.overlayDelay < 0.4) return;
    if (this.game.status === "won") {
      const last = !this.custom && this.levelIndex === this.specs.length - 1;
      this.panel("Picture complete!", "Every cube was eaten.", [
        this.custom
          ? { text: "Play again", color: "#5cc464", fn: () => this.startLevel() }
          : {
              text: last ? "Back to level 1" : "Next level",
              color: "#5cc464",
              fn: () => this.goToLevel(this.levelIndex + 1),
            },
      ]);
    } else {
      const canSlot = !this.slotBoostUsed && this.game.slots.length < MAX_SLOTS;
      this.panel("Out of moves", "Every slot is waiting for a color that can't be reached.", [
        ...(canSlot ? [{ text: "+1 Slot", color: "#5cc464", fn: () => this.addSlot() }] : []),
        { text: "Retry", color: "#8f7cf0", fn: () => this.startLevel() },
      ]);
    }
  }

  private panel(title: string, body: string, actions: { text: string; color: string; fn: () => void }[]): void {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(40,25,10,0.45)";
    ctx.fillRect(0, 0, W, H);
    // Block clicks to everything underneath.
    this.button(0, 0, W, H, () => {});
    const pw = 320;
    const ph = actions.length ? 220 : 120;
    const px = (W - pw) / 2;
    const py = (H - ph) / 2 - 60;
    ctx.fillStyle = "#fbf4e8";
    roundRect(ctx, px, py, pw, ph, 22);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#6b4523";
    ctx.font = `800 26px ui-rounded, "Nunito", system-ui, sans-serif`;
    ctx.fillText(title, W / 2, py + 44, pw - 30);
    if (body) {
      ctx.font = `600 15px ui-rounded, system-ui, sans-serif`;
      ctx.fillStyle = "#8a6440";
      wrap(ctx, body, W / 2, py + 82, pw - 40, 20);
    }
    const bw = actions.length > 1 ? 130 : 200;
    const total = actions.length * bw + (actions.length - 1) * 16;
    actions.forEach((a, i) => {
      const bx = (W - total) / 2 + i * (bw + 16);
      const by = py + ph - 74;
      tile(ctx, bx, by, bw, 52, a.color, 6, 18);
      label(ctx, a.text, bx + bw / 2, by + 23, 19, a.color);
      this.button(bx, by, bw, 52, a.fn);
    });
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number): void {
  const words = text.split(" ");
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      line = w;
      y += lh;
    } else line = test;
  }
  ctx.fillText(line, x, y);
}

new App();
