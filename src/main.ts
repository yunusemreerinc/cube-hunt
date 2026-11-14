import { Game, type Dispatch } from "./core/game";
import { EMPTY, type Level, type Picture } from "./core/types";
import { builtInLevels, type LevelSpec } from "./levels/art";
import { buildLevel } from "./levels/generator";
import { pictureFromFile } from "./levels/image";
import {
  badge,
  brickWall,
  car,
  cubeSprite,
  holdStripes,
  icon,
  type IconKind,
  luminance,
  numeral,
  pill,
  pod,
  roundRect,
  shade,
  socketSprite,
  well,
} from "./view/draw";
import { RoadMap, type Pt, type Ring } from "./view/roads";

// ---- Layout (design units; the canvas is scaled to fit the window) ----
const W = 420;
const H = 900;
const BOARD = { x: 16, y: 64, w: 388, h: 388 };
const ROAD_W = 15;
/** Smallest gap between the board frame and the cube field, leaving room for the road. */
const FIELD_INSET = 31;
/**
 * The road's center line runs this far outside the cube field on every side, so
 * it hugs the picture whatever its shape (on a square picture it sits 13 px
 * inside the board frame). The brick walls fill the gap on closed sides.
 */
const ROAD_GAP = 18;
/** Thickness of the brick walls on closed sides, between the road and the field. */
const WALL_T = 9.5;
/** Trucks keep this far right of the route so traffic in and out doesn't overlap. */
const LANE = 2.5;
/** A truck stops when another is within this distance ahead of it (center to center, at scale 1). */
const FOLLOW_GAP = 25;
/** How far to either side of its path a truck checks for traffic, at scale 1. */
const FOLLOW_WIDTH = 4.5;
/** Any truck closer than this in front (even off to one side) also makes a truck give way: merging. */
const MERGE_GAP = 17;
/** Last-resort limit: seconds a truck waits without moving before squeezing past anyway. */
const MAX_WAIT = 6;
/** How long a truck that gave up waiting ignores traffic. */
const SQUEEZE_TIME = 0.5;
/** Tunnel ramp the trucks drive back into with their cargo. */
const TUNNEL = { x: W / 2, y: 496, w: 112, h: 36 };
/** The ramp has three lanes up to the road, as offsets from its middle. */
const RAMP_LANES = [-34, 0, 34];
const SLOT_Y = 540;
const SLOT_H = 66;
const TRAY_Y = 636;
const TRAY_ROWS = 3;
const BLOCK = { w: 80, h: 52, gx: 14, gy: 8 };
const BAR_Y = 836;
const MAX_SLOTS = 6;

// Pace at 1x. Trucks are sent the moment a cube is reachable; the speed button
// multiplies driving and loading, so 2x and 3x are exactly double and triple.
/** Truck driving speed in design px per second. */
const CAR_SPEED = 200;
/** Seconds a truck stops to load its cube. */
const LOAD_TIME = 0.25;
const ROAD_COLOR = "#a3968c";
/** Distance over which a truck shrinks and fades as it drives down the ramp. */
const RAMP_FADE = 28;

interface Car {
  /** Increases with each truck sent; older trucks go first when two block each other. */
  id: number;
  x: number;
  y: number;
  /** Where it came up out of the ramp; it grows to full size as it drives away from here. */
  sx: number;
  sy: number;
  /** Waypoints being driven, and the index of the next one. */
  path: Pt[];
  step: number;
  /** The way out, kept to drive home along. */
  route: Pt[];
  /** Center of the cube it collects. */
  cube: Pt;
  color: string;
  cell: number;
  /** out: driving to its cube; load: stopped, loading; home: driving to the tunnel. */
  state: "out" | "load" | "home" | "gone";
  cargo: boolean;
  wait: number;
  angle: number;
  /** Seconds spent waiting for traffic, and time left squeezing past after waiting too long. */
  waited: number;
  squeeze: number;
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
  private roads!: RoadMap;
  /** Center line of the road around this level's field. */
  private ring!: Ring;
  /** Cells as currently drawn; a cube leaves when its truck picks it up, not when the truck is sent. */
  private shown!: Int16Array;
  private cars: Car[] = [];
  /** Per ramp lane: trucks sent out but still waiting underground for the lane to clear, oldest first. */
  private tunnelQueues: Car[][] = RAMP_LANES.map(() => []);
  private nextCarId = 0;
  private particles: Particle[] = [];
  private flyers: Flyer[] = [];
  private buttons: Button[] = [];
  private speed = 1;
  private slotBoostUsed = false;
  private shake = 0;
  private time = 0;
  private overlayDelay = 0;
  private message = "";
  private scale = 1;
  /** How many trucks each crate (by block id) held when it entered a slot, for its progress bar. */
  private startCounts = new Map<number, number>();
  /** Pre-drawn cube images, keyed by color and size in device pixels. */
  private sprites = new Map<string, HTMLCanvasElement>();

  constructor() {
    this.canvas = document.getElementById("game") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    this.fileInput = document.getElementById("file") as HTMLInputElement;
    this.fileInput.addEventListener("change", () => this.onFile());
    window.addEventListener("resize", () => this.resize());
    // Also follow the container, which can change size without the window doing so.
    if (this.canvas.parentElement && "ResizeObserver" in window) {
      new ResizeObserver(() => this.resize()).observe(this.canvas.parentElement);
    }
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
    const cs = this.cellSize();
    const p = this.level.picture;
    const fx = BOARD.x + (BOARD.w - cs * p.width) / 2;
    const fy = BOARD.y + (BOARD.h - cs * p.height) / 2;
    this.ring = {
      x0: fx - ROAD_GAP,
      y0: fy - ROAD_GAP,
      x1: fx + cs * p.width + ROAD_GAP,
      y1: fy + cs * p.height + ROAD_GAP,
    };
    this.roads = new RoadMap(this.game.board, fx, fy, cs, this.ring, { x: TUNNEL.x, y: this.ring.y1 });
    this.shown = Int16Array.from(this.level.picture.cells);
    this.sprites.clear();
    this.startCounts.clear();
    this.cars = [];
    this.tunnelQueues = RAMP_LANES.map(() => []);
    this.nextCarId = 0;
    this.particles = [];
    this.flyers = [];
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
    return Math.min((BOARD.w - 2 * FIELD_INSET) / p.width, (BOARD.h - 2 * FIELD_INSET) / p.height);
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
    this.startCounts.set(block.id, count);
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

    // Don't wait between trucks: every slot sends a truck to every reachable cube
    // of its color right away. Each tick sends at most one per slot, so keep
    // ticking until nothing more can go.
    if (this.game.status === "playing") {
      for (let sent = this.game.tick(); sent.length > 0; sent = this.game.tick()) {
        for (const d of sent) this.sendTruck(d);
      }
    }

    this.releaseFromTunnel();
    const blocked = this.trafficAhead();
    for (const c of this.cars) {
      if (c.state === "load") {
        // Turn to face the cube while loading it.
        c.angle = turnToward(c.angle, Math.atan2(c.cube.y - c.y, c.cube.x - c.x), 10 * sdt);
        c.wait -= sdt;
        if (c.wait <= 0) {
          // Drive back out the way it came, then down the ramp.
          c.state = "home";
          c.path = [
            ...c.route.slice(0, -1).reverse(),
            { x: c.sx, y: c.sy },
          ];
          c.step = 0;
        }
        continue;
      }
      c.squeeze = Math.max(0, c.squeeze - sdt);
      if (blocked.has(c) && c.squeeze === 0) {
        c.waited += sdt;
        if (c.waited > MAX_WAIT) {
          c.squeeze = SQUEEZE_TIME;
          c.waited = 0;
        }
      } else {
        c.waited = 0;
        this.drive(c, CAR_SPEED * sdt);
      }
      // Steer smoothly instead of snapping to the new heading.
      const next = c.path[c.step];
      if (next && Math.hypot(next.x - c.x, next.y - c.y) > 0.5) {
        c.angle = turnToward(c.angle, Math.atan2(next.y - c.y, next.x - c.x), 14 * sdt);
      }
    }
    this.cars = this.cars.filter((c) => c.state !== "gone");

    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 500 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const f of this.flyers) f.t += dt * 5.5;
    this.flyers = this.flyers.filter((f) => f.t < 1);

    if (this.game.status !== "playing" && this.cars.length === 0 && this.tunnelQueues.every((q) => q.length === 0)) {
      this.overlayDelay += dt;
    }
  }

  /** The way a truck is going: toward its next waypoint, or the way it faces when stopped. */
  private heading(c: Car): number {
    const next = c.state === "load" ? undefined : c.path[c.step];
    if (next && Math.hypot(next.x - c.x, next.y - c.y) > 0.5) return Math.atan2(next.y - c.y, next.x - c.x);
    return c.angle;
  }

  /** Puts a truck for this dispatch in the tunnel, in the ramp lane that suits its route best. */
  private sendTruck(d: Dispatch): void {
    // Each truck takes the ramp lane with the shortest drive, counting the trucks
    // already waiting for it; any queue waits out of sight in the tunnel.
    let lane = 0;
    let route: Pt[] = [];
    let bestScore = Infinity;
    RAMP_LANES.forEach((dx, k) => {
      const plan = this.roads.routeFrom(d.cell, { x: TUNNEL.x + dx, y: this.ring.y1 });
      const score = plan.cost + this.tunnelQueues[k].length * FOLLOW_GAP * 1.5;
      if (score < bestScore) {
        bestScore = score;
        lane = k;
        route = plan.path;
      }
    });
    const sx = TUNNEL.x + RAMP_LANES[lane];
    const sy = TUNNEL.y + TUNNEL.h * 0.2;
    this.tunnelQueues[lane].push({
      id: this.nextCarId++,
      x: sx,
      y: sy,
      sx,
      sy,
      path: route,
      step: 0,
      route,
      cube: this.roads.center(d.cell),
      color: this.level.picture.palette[d.color],
      cell: d.cell,
      state: "out",
      cargo: false,
      wait: 0,
      angle: -Math.PI / 2,
      waited: 0,
      squeeze: 0,
    });
  }

  /** In each ramp lane, lets the next queued truck come up once the one before it has moved on. */
  private releaseFromTunnel(): void {
    const room = FOLLOW_GAP * this.carScale();
    for (const queue of this.tunnelQueues) {
      const next = queue[0];
      if (!next) continue;
      const clear = !this.cars.some(
        (o) => o.state === "out" && o.step === 0 && Math.hypot(o.x - next.sx, o.y - next.sy) < room,
      );
      if (clear) this.cars.push(queue.shift()!);
    }
  }

  /**
   * Trucks that must stop this frame: another truck is just ahead in their lane,
   * or close in front while merging. Oncoming trucks are in the other lane and
   * don't count. When trucks block each other in a loop, the one sent first goes.
   */
  private trafficAhead(): Set<Car> {
    const s = this.carScale();
    const gap = FOLLOW_GAP * s;
    const width = FOLLOW_WIDTH * s;
    const merge = MERGE_GAP * s;
    const cars = this.cars;
    const dirs = cars.map((c) => this.heading(c));
    const ahead = cars.map(() => new Set<number>());
    for (let i = 0; i < cars.length; i++) {
      if (cars[i].state === "load") continue; // parked trucks don't need to look
      const fx = Math.cos(dirs[i]);
      const fy = Math.sin(dirs[i]);
      for (let j = 0; j < cars.length; j++) {
        if (i === j) continue;
        const dx = cars[j].x - cars[i].x;
        const dy = cars[j].y - cars[i].y;
        const along = dx * fx + dy * fy;
        if (along <= 0 || along > gap) continue;
        if (Math.cos(dirs[i] - dirs[j]) < -0.5) continue; // oncoming, in the other lane
        const inLane = Math.abs(dx * fy - dy * fx) <= width;
        const merging = Math.hypot(dx, dy) < merge;
        if (inLane || merging) ahead[i].add(j);
      }
    }
    // Each stopped truck waits for the nearest truck in its way.
    const waitsFor = new Map<number, number>();
    ahead.forEach((set, i) => {
      let best = -1;
      let bestD = Infinity;
      for (const j of set) {
        const d = Math.hypot(cars[j].x - cars[i].x, cars[j].y - cars[i].y);
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      if (best >= 0) waitsFor.set(i, best);
    });
    // A queue behind a moving or loading truck is fine. A loop (A waits for B ...
    // waits for A) would never clear, so the oldest truck in the loop goes.
    const out = new Set<Car>();
    for (const i of waitsFor.keys()) {
      const chain = [i];
      let j = waitsFor.get(i)!;
      while (waitsFor.has(j) && !chain.includes(j) && chain.length < cars.length) {
        chain.push(j);
        j = waitsFor.get(j)!;
      }
      const loop = j === i;
      const oldest = loop && chain.every((k) => cars[k].id >= cars[i].id);
      if (!oldest) out.add(cars[i]);
    }
    return out;
  }

  private carScale(): number {
    return Math.min(1.15, Math.max(0.85, this.cellSize() / 17));
  }

  /** Moves a truck `dist` along its waypoints, handling arrival at the end. */
  private drive(c: Car, dist: number): void {
    while (dist > 0 && c.step < c.path.length) {
      const t = c.path[c.step];
      const d = Math.hypot(t.x - c.x, t.y - c.y);
      if (d > dist) {
        c.x += ((t.x - c.x) / d) * dist;
        c.y += ((t.y - c.y) / d) * dist;
        return;
      }
      c.x = t.x;
      c.y = t.y;
      dist -= d;
      c.step++;
    }
    if (c.step < c.path.length) return;
    if (c.state === "out") {
      this.pickUp(c);
      c.state = "load";
      c.wait = LOAD_TIME;
    } else {
      c.state = "gone";
    }
  }

  /** The truck lifts its cube off the board, kicking up a little dust. */
  private pickUp(c: Car): void {
    this.shown[c.cell] = EMPTY;
    // Only now does the space open up, so trucks are never sent for cubes behind it early.
    this.game.collect(c.cell);
    c.cargo = true;
    const cs = this.cellSize();
    for (let k = 0; k < 3; k++) {
      this.particles.push({
        x: c.cube.x + (Math.random() - 0.5) * cs,
        y: c.cube.y + (Math.random() - 0.5) * cs,
        vx: (Math.random() - 0.5) * 70,
        vy: -30 - Math.random() * 40,
        life: 0.25 + Math.random() * 0.15,
        color: "#e8d6b8",
        size: Math.max(2, cs * 0.25),
      });
    }
  }

  // ---- Draw ----

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    // Fit the container's content box (the whole page in index.html), keeping the aspect ratio.
    const host = this.canvas.parentElement ?? document.body;
    const style = getComputedStyle(host);
    const availW = host.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const availH = host.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    this.scale = Math.max(0.1, Math.min(availW / W, availH / H));
    this.canvas.style.width = `${W * this.scale}px`;
    this.canvas.style.height = `${H * this.scale}px`;
    this.canvas.width = Math.round(W * this.scale * dpr);
    this.canvas.height = Math.round(H * this.scale * dpr);
    this.ctx.setTransform(this.scale * dpr, 0, 0, this.scale * dpr, 0, 0);
    this.sprites.clear();
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
    this.drawTunnel();
    this.drawSlots();
    this.drawTray();
    this.drawBottomBar();
    const carScale = this.carScale();
    for (const c of this.cars) {
      // Trucks grow as they climb out of the ramp, and shrink as they roll back down it.
      let fade = 1;
      if (c.state === "out" && c.step === 0) fade = Math.hypot(c.x - c.sx, c.y - c.sy) / RAMP_FADE;
      if (c.state === "home" && c.step === c.path.length - 1) {
        const end = c.path[c.path.length - 1];
        fade = Math.hypot(end.x - c.x, end.y - c.y) / RAMP_FADE;
      }
      fade = Math.min(1, fade);
      if (fade <= 0.02) continue; // still down in the tunnel
      const lane = LANE * carScale;
      const x = c.x - Math.sin(c.angle) * lane;
      const y = c.y + Math.cos(c.angle) * lane;
      car(ctx, x, y, c.angle, c.color, c.cargo, carScale * (0.55 + 0.45 * fade), fade);
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
    const round = (x: number, y: number, r: number, color: string, kind: IconKind, fn: () => void) => {
      const h = r * 2 + 4;
      pod(ctx, x - r, y - r, r * 2, h, color, r);
      icon(ctx, kind, x, y - r + (h - Math.max(3, h * 0.1)) / 2, r * 0.95, color);
      this.button(x - r, y - r, r * 2, h, fn);
    };
    round(30, 32, 18, "#8f7cf0", "restart", () => this.startLevel());
    round(70, 32, 15, "#f0a35c", "prev", () => this.goToLevel(this.levelIndex - 1));
    round(300, 32, 15, "#f0a35c", "next", () => this.goToLevel(this.levelIndex + 1));

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
    pod(ctx, 330, 14, 76, 38, "#3fb6f2", 16);
    icon(ctx, "fast", 353, 31, 18, "#3fb6f2");
    numeral(ctx, `${this.speed}x`, 384, 31, 17, "#3fb6f2");
    this.button(330, 14, 76, 38, () => (this.speed = (this.speed % 3) + 1));
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

    // The road around the field, with a dashed center line.
    ctx.lineJoin = "round";
    ctx.strokeStyle = ROAD_COLOR;
    ctx.lineWidth = ROAD_W;
    const ring = this.ring;
    roundRect(ctx, ring.x0, ring.y0, ring.x1 - ring.x0, ring.y1 - ring.y0, 8);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1.2;
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    const cs = this.cellSize();
    this.drawWalls(cs);
    const gap = Math.max(1, cs * 0.1);
    const s = cs - gap;
    // Sprites are drawn at the canvas's real pixel size so they stay sharp.
    const px = Math.round(s * this.scale * (window.devicePixelRatio || 1));
    const socket = this.sprite("socket", px, () => socketSprite(px));
    const cubes = p.palette.map((color) => this.sprite(color, px, () => cubeSprite(color, px)));
    for (let i = 0; i < this.shown.length; i++) {
      const c = this.shown[i];
      const [cx, cy] = this.cellCenter(i);
      if (c === EMPTY) {
        if (p.cells[i] !== EMPTY) {
          const inset = s * 0.08;
          ctx.drawImage(socket, cx - s / 2 + inset, cy - s / 2 + inset, s - 2 * inset, s - 2 * inset);
        }
        continue;
      }
      ctx.drawImage(cubes[c], cx - s / 2, cy - s / 2, s, s);
    }
  }

  /** A cached pre-drawn image; the cache is cleared whenever the level or screen size changes. */
  private sprite(key: string, px: number, make: () => HTMLCanvasElement): HTMLCanvasElement {
    const k = `${key}|${px}`;
    let img = this.sprites.get(k);
    if (!img) {
      img = make();
      this.sprites.set(k, img);
    }
    return img;
  }

  /** Thick walls on the edges trucks can't enter from; the open edge faces the tunnel. */
  private drawWalls(cs: number): void {
    const { edges, picture: p } = this.level;
    if (edges === "all") return;
    const ctx = this.ctx;
    // The wall fills the gap between the road and the field on each closed side.
    const t = WALL_T;
    const fx = BOARD.x + (BOARD.w - cs * p.width) / 2;
    const fy = BOARD.y + (BOARD.h - cs * p.height) / 2;
    const fw = cs * p.width;
    const fh = cs * p.height;
    const out = 1; // a hair outside the cubes, so it never covers them
    // Soft shadow under the wall.
    ctx.save();
    ctx.shadowColor = "rgba(80,40,10,0.35)";
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1.5;
    ctx.fillStyle = "#c2553a";
    if (edges === "bottom") {
      ctx.fillRect(fx - out - t, fy - out - t, t, fh + out + t);
      ctx.fillRect(fx + fw + out, fy - out - t, t, fh + out + t);
    }
    ctx.fillRect(fx - out - t, fy - out - t, fw + 2 * (out + t), t);
    ctx.restore();
    // Then the bricks: top wall across, and side walls down to the open bottom.
    brickWall(ctx, fx - out - t, fy - out - t, fw + 2 * (out + t), t);
    if (edges === "bottom") {
      brickWall(ctx, fx - out - t, fy - out, t, fh + out);
      brickWall(ctx, fx + fw + out, fy - out, t, fh + out);
    }
  }

  /** A ramp sloping down into the table, with hazard stripes along its lip. */
  private drawTunnel(): void {
    const ctx = this.ctx;
    const x = TUNNEL.x - TUNNEL.w / 2;
    const y = TUNNEL.y - TUNNEL.h / 2;
    // A wide driveway from the road down to the ramp, one lane per ramp lane.
    const apron = RAMP_LANES[RAMP_LANES.length - 1] + 14;
    ctx.fillStyle = ROAD_COLOR;
    ctx.fillRect(TUNNEL.x - apron, this.ring.y1, apron * 2, y - this.ring.y1 + 2);
    const r = 12;
    ctx.fillStyle = "rgba(110,70,30,0.25)";
    roundRect(ctx, x - 4, y - 2, TUNNEL.w + 8, TUNNEL.h + 10, r + 4);
    ctx.fill();
    // Hazard-striped rim.
    ctx.save();
    roundRect(ctx, x - 5, y - 5, TUNNEL.w + 10, TUNNEL.h + 10, r + 4);
    ctx.clip();
    ctx.fillStyle = "#f2c230";
    ctx.fillRect(x - 5, y - 5, TUNNEL.w + 10, TUNNEL.h + 10);
    ctx.fillStyle = "#3a2a1c";
    for (let sx = x - 40; sx < x + TUNNEL.w + 20; sx += 14) {
      ctx.beginPath();
      ctx.moveTo(sx, y + TUNNEL.h + 6);
      ctx.lineTo(sx + 7, y + TUNNEL.h + 6);
      ctx.lineTo(sx + 7 + TUNNEL.h + 12, y - 6);
      ctx.lineTo(sx + TUNNEL.h + 12, y - 6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // The ramp gets darker as it goes down.
    const g = ctx.createLinearGradient(0, y, 0, y + TUNNEL.h);
    g.addColorStop(0, "#6b4a2c");
    g.addColorStop(1, "#1d140c");
    ctx.fillStyle = g;
    roundRect(ctx, x, y, TUNNEL.w, TUNNEL.h, r);
    ctx.fill();
    // Lane markings between the ramp lanes, continuing up the driveway.
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    for (let k = 1; k < RAMP_LANES.length; k++) {
      const lx = TUNNEL.x + (RAMP_LANES[k - 1] + RAMP_LANES[k]) / 2;
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.beginPath();
      ctx.moveTo(lx, this.ring.y1 + ROAD_W / 2 + 2);
      ctx.lineTo(lx, y - 1);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,240,200,0.35)";
      ctx.beginPath();
      ctx.moveTo(lx, y + 4);
      ctx.lineTo(lx, y + TUNNEL.h - 6);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  private drawSlots(): void {
    const ctx = this.ctx;
    const dx = this.shake > 0 ? Math.sin(this.shake * 60) * 6 : 0;
    this.game.slots.forEach((b, i) => {
      const r = this.slotRect(i);
      const x = r.x + dx;
      well(ctx, x, r.y, r.w, r.h);
      const flying = this.flyers.find((f) => f.slot === i);
      if (flying) {
        const t = 1 - (1 - flying.t) ** 3;
        const fx = flying.fromX + (x - flying.fromX) * t;
        const fy = flying.fromY + (r.y - flying.fromY) * t;
        const fw = BLOCK.w + (r.w - BLOCK.w) * t;
        const fh = BLOCK.h + (r.h - BLOCK.h) * t;
        pod(ctx, fx, fy, fw, fh, flying.color);
        numeral(ctx, String(flying.count), fx + fw / 2, fy + fh * 0.42, 24, flying.color);
        return;
      }
      if (!b) return;
      const color = this.level.picture.palette[b.color];
      const waiting = !this.game.slotCanEat(i);
      // A blocked crate keeps its full color so you can still tell what it is;
      // stripes, a quieter number and a badge say it is waiting.
      pod(ctx, x, r.y, r.w, r.h, color);
      if (waiting) holdStripes(ctx, x, r.y, r.w, r.h, color);
      ctx.save();
      if (waiting) ctx.globalAlpha = 0.6;
      numeral(ctx, String(b.count), x + r.w / 2, r.y + r.h * 0.4, 24, color);
      // How many of this crate's trucks are still to go.
      const start = this.startCounts.get(b.id) ?? b.count;
      const barW = r.w - 20;
      const barY = r.y + r.h * 0.72;
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      roundRect(ctx, x + 10, barY, barW, 4, 2);
      ctx.fill();
      ctx.fillStyle = luminanceFill(color);
      roundRect(ctx, x + 10, barY, Math.max(4, barW * (b.count / start)), 4, 2);
      ctx.fill();
      ctx.restore();
      if (waiting) pill(ctx, "blocked", x + r.w / 2, r.y + r.h + 9);
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
          pod(ctx, r.x, r.y, r.w, r.h, color);
          numeral(ctx, String(b.count), r.x + r.w / 2, r.y + r.h * 0.44, 24, color);
          this.button(r.x, r.y, r.w, r.h, () => this.tapColumn(c));
        } else {
          // Crates further back are smaller and fainter, like a stack waiting its turn.
          ctx.save();
          ctx.globalAlpha = row === 1 ? 0.55 : 0.32;
          const inset = row === 1 ? 5 : 9;
          pod(ctx, r.x + inset, r.y, r.w - inset * 2, r.h, color);
          numeral(ctx, String(b.count), r.x + r.w / 2, r.y + r.h * 0.44, 19, color);
          ctx.restore();
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
    const band = ctx.createLinearGradient(0, BAR_Y - 10, 0, H);
    band.addColorStop(0, "rgba(110,70,30,0)");
    band.addColorStop(0.25, "rgba(110,70,30,0.13)");
    ctx.fillStyle = band;
    ctx.fillRect(0, BAR_Y - 10, W, H - BAR_Y + 10);

    const canSlot = !this.slotBoostUsed && this.game.slots.length < MAX_SLOTS && this.game.status !== "won";
    const by = BAR_Y + 4;
    const bh = 54;
    const mid = by + (bh - Math.max(3, bh * 0.1)) / 2;
    ctx.save();
    ctx.globalAlpha = canSlot ? 1 : 0.45;
    pod(ctx, 24, by, 176, bh, "#5cc464", 20);
    numeral(ctx, "+1 Slot", 100, mid, 19, "#5cc464");
    badge(ctx, canSlot ? "1" : "0", 168, mid, "#5cc464");
    ctx.restore();
    if (canSlot) this.button(24, by, 176, bh, () => this.addSlot());

    pod(ctx, 220, by, 176, bh, "#8f7cf0", 20);
    // Center the icon and the words together as one group.
    ctx.font = `800 18px "Nunito", ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
    const textW = ctx.measureText("Your image").width;
    const iconW = 20;
    const gap = 9;
    const left = 220 + (176 - (iconW + gap + textW)) / 2;
    icon(ctx, "picture", left + iconW / 2, mid, 18, "#8f7cf0");
    numeral(ctx, "Your image", left + iconW + gap + textW / 2, mid, 18, "#8f7cf0");
    this.button(220, by, 176, bh, () => this.fileInput.click());
  }

  private drawOverlay(): void {
    if (this.message) {
      this.panel(this.message, "", []);
      return;
    }
    if (this.game.status === "playing" || this.overlayDelay < 0.4) return;
    if (this.game.status === "won") {
      const last = !this.custom && this.levelIndex === this.specs.length - 1;
      this.panel("Picture complete!", "Every cube was hauled away.", [
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
    ctx.save();
    ctx.shadowColor = "rgba(40,20,5,0.35)";
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = "#fbf4e8";
    roundRect(ctx, px, py, pw, ph, 24);
    ctx.fill();
    ctx.restore();
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
      pod(ctx, bx, by, bw, 54, a.color, 20);
      numeral(ctx, a.text, bx + bw / 2, by + (54 - Math.max(3, 5.4)) / 2, 19, a.color);
      this.button(bx, by, bw, 54, a.fn);
    });
  }
}

/** A progress-bar color that shows up on the crate: white, or dark on light crates. */
function luminanceFill(color: string): string {
  return luminance(color) > 0.72 ? shade(color, -0.55) : "rgba(255,255,255,0.9)";
}

/** Rotates `from` toward `to` by at most `maxStep` radians, taking the short way round. */
function turnToward(from: number, to: number, maxStep: number): number {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return from + Math.max(-maxStep, Math.min(maxStep, diff));
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
