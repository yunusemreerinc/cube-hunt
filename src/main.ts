import { Game, type Dispatch } from "./core/game";
import { EMPTY, type Level, type Picture } from "./core/types";
import { builtInLevels, type LevelSpec } from "./levels/art";
import { buildLevel } from "./levels/generator";
import { pictureFromFile } from "./levels/image";
import {
  badge,
  brickWall,
  car,
  countLabel,
  cubeSprite,
  dock,
  holdStripes,
  icon,
  lane,
  type IconKind,
  BODY_FONT,
  chip,
  labelWidth,
  luminance,
  pill,
  pod,
  roundButton,
  roundRect,
  shelf,
  shade,
  socketSprite,
  speedArrows,
  speedArrowsWidth,
  well,
} from "./view/draw";
import { RoadMap, type Pt, type Ring } from "./view/roads";

// ---- Layout (design units; the canvas is scaled to fit the window) ----
const W = 420;
const H = 900;
const BOARD = { x: 16, y: 64, w: 388, h: 388 };
/** Wide enough for two trucks side by side, one each way. */
const ROAD_W = 23;
/** Smallest gap between the board frame and the cube field, leaving room for the road. */
const FIELD_INSET = 38;
/**
 * The road's center line runs this far outside the cube field on every side, so
 * it hugs the picture whatever its shape. The brick walls fill the gap between
 * the road and the field on closed sides.
 */
const ROAD_GAP = 22;
/** Thickness of the brick walls on closed sides, between the road and the field. */
const WALL_T = 9.5;
/**
 * On the road, trucks keep this far right of the route (at scale 1), so trucks
 * going opposite ways pass side by side. Inside the picture they drive centered.
 */
const LANE = 5.8;
/** Tunnel ramp the trucks drive back into with their cargo. */
const TUNNEL = { x: W / 2, y: 496, w: 112, h: 36 };
/** The ramp has three lanes up to the road, as offsets from its middle. */
const RAMP_LANES = [-34, 0, 34];
/**
 * Trucks in the same ramp lane leave this far apart (design px, center to
 * center, at scale 1), so a crate's trucks drive in a line you can count
 * instead of on top of each other. A truck is 21 long.
 */
const CONVOY_GAP = 30;
const SLOT_Y = 540;
const SLOT_H = 66;
const TRAY_Y = 636;
const TRAY_ROWS = 3;
/** Tray crates: five columns, lined up under the five slots (68 wide, 10 apart). */
const BLOCK = { w: 68, h: 52, gx: 10, gy: 8 };
const BAR_Y = 836;
const MAX_SLOTS = 6;
/** A tapped crate's flight into its slot: speed (1/seconds), and how high it arcs (design px). */
const FLY_SPEED = 3.8;
const FLY_ARC = 26;
/** Seconds the landing bounce and glow last. */
const LAND_TIME = 0.45;
/** Seconds an emptied crate takes to pop out of the dock. */
const LEAVE_TIME = 0.5;
/**
 * The stack rising after a tap: each crate takes RISE_TIME to move up a row,
 * starting RISE_STAGGER after the one in front of it, so a wave rolls up the
 * column; then a shine sweeps across the new front crate for SHEEN_TIME.
 */
const RISE_TIME = 0.32;
const RISE_STAGGER = 0.06;
const SHEEN_TIME = 0.4;
/** How tray crates look at each depth: front, one back, two back, and just out of sight. */
const TRAY_ALPHA = [1, 0.55, 0.32, 0];
const TRAY_INSET = [0, 5, 9, 12];
const TRAY_LABEL = [25, 19, 19, 17];

// Pace at 1x. A crate sends a truck as soon as a cube is reachable, then one
// every POP_INTERVAL; the speed button multiplies driving, loading and that
// interval, so 2x and 3x are exactly double and triple.
/** Truck driving speed in design px per second. */
const CAR_SPEED = 200;
/**
 * Seconds between one crate's trucks at 1x, so its number visibly counts down
 * as each truck pops out. Matches the ramp spacing, so trucks don't queue.
 */
const POP_INTERVAL = CONVOY_GAP / CAR_SPEED;
/** Seconds a truck stops to load its cube: the cube lifts out, arcs into the bed and lands. */
const LOAD_TIME = 0.42;
/** Share of LOAD_TIME the cube spends working loose and rising out of its spot. */
const LIFT_END = 0.22;
/** Share of LOAD_TIME at which the cube lands in the bed; the truck settles after that. */
const LAND_AT = 0.78;
/** Where the bed's middle is, in truck units behind the truck's center, and the cargo cube's size. */
const BED_X = -6.3;
const BED_CUBE = 7;
/** Road surface: dark slate asphalt with cream curbs, white edge lines and a warm center line. */
const ASPHALT = "#565c68";
const CURB = "#f6efe4";
const EDGE_LINE = "rgba(255,255,255,0.5)";
const CENTER_LINE = "#ffd36b";
/** Distance over which a truck shrinks and fades as it drives down the ramp. */
const RAMP_FADE = 28;

interface Car {
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
  /** Trucks waiting in the tunnel per ramp lane, and seconds until each lane's next one may leave. */
  private ramp: Car[][] = RAMP_LANES.map(() => []);
  private rampTimer: number[] = RAMP_LANES.map(() => 0);
  /** Per ramp lane: trucks sent out but still waiting underground for the lane to clear, oldest first. */
  private particles: Particle[] = [];
  private flyers: Flyer[] = [];
  /** Empty crates popping out of the dock after their last truck left. */
  private leavers: { slot: number; color: string; t: number }[] = [];
  /** Per slot: seconds until it may send its next truck, and how much its number is still bumped (1 -> 0). */
  private slotTimer: number[] = new Array(MAX_SLOTS).fill(0);
  private slotBump: number[] = new Array(MAX_SLOTS).fill(0);
  /** Per slot: how much of its landing effect is left (1 just landed -> 0). */
  private slotLand: number[] = new Array(MAX_SLOTS).fill(0);
  /** Per tray column: seconds since its crates started rising (Infinity when settled). */
  private trayRise: number[] = [];
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
    this.ramp = RAMP_LANES.map(() => []);
    this.rampTimer = RAMP_LANES.map(() => 0);
    this.particles = [];
    this.flyers = [];
    this.leavers = [];
    this.slotTimer.fill(0);
    this.slotBump.fill(0);
    this.slotLand.fill(0);
    this.trayRise = [];
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
      this.trayRise[col] = 0; // the crates behind move up a row
    }
  }

  // ---- Update ----

  private update(dt: number): void {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt);
    const sdt = dt * this.speed;

    // Each slot sends a truck to a reachable cube as soon as it has one, then one
    // more every POP_INTERVAL, so its number counts down truck by truck. A crate
    // still flying into its slot waits until it lands.
    for (let k = 0; k < MAX_SLOTS; k++) {
      this.slotTimer[k] -= sdt;
      this.slotBump[k] = Math.max(0, this.slotBump[k] - dt * 6);
    }
    if (this.game.status === "playing") {
      const ready = (s: number) => this.slotTimer[s] <= 0 && !this.flyers.some((f) => f.slot === s);
      for (const d of this.game.tick(ready)) {
        this.sendTruck(d);
        this.slotTimer[d.slot] = POP_INTERVAL;
        this.slotBump[d.slot] = 1;
        // That was the crate's last truck: it leaves the dock.
        if (!this.game.slots[d.slot]) this.leave(d.slot, this.level.picture.palette[d.color]);
      }
    }

    // Each ramp lane lets one truck out at a time, a short gap behind the last.
    const spacing = (CONVOY_GAP * this.carScale()) / CAR_SPEED;
    this.ramp.forEach((queue, k) => {
      this.rampTimer[k] -= sdt;
      if (queue.length > 0 && this.rampTimer[k] <= 0) {
        this.cars.push(queue.shift()!);
        this.rampTimer[k] = spacing;
      }
    });

    for (const c of this.cars) {
      if (c.state === "load") {
        // Turn to face the cube while loading it.
        c.angle = turnToward(c.angle, Math.atan2(c.cube.y - c.y, c.cube.x - c.x), 10 * sdt);
        const before = 1 - c.wait / LOAD_TIME;
        c.wait -= sdt;
        if (before < LAND_AT && 1 - c.wait / LOAD_TIME >= LAND_AT) this.landPuff(c);
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
      this.drive(c, CAR_SPEED * sdt);
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

    for (const f of this.flyers) {
      f.t += dt * FLY_SPEED;
      if (f.t >= 1) this.land(f);
    }
    this.flyers = this.flyers.filter((f) => f.t < 1);
    for (const l of this.leavers) l.t += dt / LEAVE_TIME;
    // A leaving crate gives way at once to a new crate flying into its slot.
    this.leavers = this.leavers.filter((l) => l.t < 1 && !this.game.slots[l.slot] && !this.flyers.some((f) => f.slot === l.slot));
    for (let k = 0; k < MAX_SLOTS; k++) this.slotLand[k] = Math.max(0, this.slotLand[k] - dt / LAND_TIME);
    this.trayRise = this.trayRise.map((v) => (v ?? Infinity) + dt);

    if (this.game.status !== "playing" && this.cars.length === 0 && this.ramp.every((q) => q.length === 0)) {
      this.overlayDelay += dt;
    }
  }

  /** Sends a truck up the ramp lane with the shortest drive to its cube, right away. */
  private sendTruck(d: Dispatch): void {
    // Trucks never stop for each other: where routes cross they drive straight
    // through. They do leave each ramp lane in a spaced-out line, so each one
    // can be seen on its own.
    let lane = 0;
    let route: Pt[] = [];
    let bestScore = Infinity;
    RAMP_LANES.forEach((dx, k) => {
      const plan = this.roads.routeFrom(d.cell, { x: TUNNEL.x + dx, y: this.ring.y1 });
      const score = plan.cost;
      if (score < bestScore) {
        bestScore = score;
        lane = k;
        route = plan.path;
      }
    });
    const sx = TUNNEL.x + RAMP_LANES[lane];
    const sy = TUNNEL.y + TUNNEL.h * 0.2;
    this.ramp[lane].push({
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
    });
  }

  /** Trucks shrink with the cubes, so one still fits beside each cube it parks next to (a truck is 11 wide). */
  private carScale(): number {
    return Math.min(1, Math.max(0.5, this.cellSize() / 13));
  }

  /** How far to keep right here: full lane on the road, none on the one-lane parts, blended at the edge. */
  private laneShare(x: number, y: number): number {
    const r = this.ring;
    if (y > r.y1 && Math.abs(x - TUNNEL.x) <= RAMP_LANES[RAMP_LANES.length - 1] + 14) return 1; // driveway
    let d = Infinity; // distance to the road's center line
    if (x >= r.x0 && x <= r.x1) d = Math.min(d, Math.abs(y - r.y0), Math.abs(y - r.y1));
    if (y >= r.y0 && y <= r.y1) d = Math.min(d, Math.abs(x - r.x0), Math.abs(x - r.x1));
    return Math.max(0, Math.min(1, (ROAD_W / 2 + 2 - d) / 4));
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

  /** Where a truck is drawn: on the road it keeps to its own lane. */
  private carPose(c: Car): Pt {
    const lane = LANE * this.carScale() * this.laneShare(c.x, c.y);
    return { x: c.x - Math.sin(c.angle) * lane, y: c.y + Math.cos(c.angle) * lane };
  }

  /** Middle of a truck's open bed, where its cube ends up. */
  private bedPoint(c: Car): Pt {
    const { x, y } = this.carPose(c);
    const back = BED_X * this.carScale();
    return { x: x + Math.cos(c.angle) * back, y: y + Math.sin(c.angle) * back };
  }

  /**
   * A cube being loaded, at `t` (0..LAND_AT) through the load: it rocks loose and
   * rises out of its spot, then arcs up and over into the truck's bed, turning to
   * sit square in it and shrinking to the bed's size. Its shadow stays on the
   * ground, so the height reads clearly.
   */
  private drawLoading(c: Car, t: number): void {
    const ctx = this.ctx;
    const cs = this.cellSize();
    const s = cs - Math.max(1, cs * 0.1);
    const px = Math.round(s * this.scale * (window.devicePixelRatio || 1));
    const img = this.sprite(c.color, px, () => cubeSprite(c.color, px));
    const bed = this.bedPoint(c);
    const bedSize = BED_CUBE * this.carScale();
    const rise = cs * 0.3;
    const peak = cs * 1.1;
    let x = c.cube.x;
    let y = c.cube.y;
    let h: number;
    let size = s;
    let rot: number;
    if (t < LIFT_END) {
      const k = t / LIFT_END;
      h = rise * k * k;
      rot = Math.sin(k * Math.PI * 3) * 0.12 * (1 - k); // rocks loose
    } else {
      const k = (t - LIFT_END) / (LAND_AT - LIFT_END);
      const e = k * k * (3 - 2 * k);
      x += (bed.x - x) * e;
      y += (bed.y - y) * e;
      h = rise * (1 - k) + 4 * peak * k * (1 - k);
      size = s + (bedSize - s) * e;
      // Turn the short way round to line up with the truck.
      const turn = Math.atan2(Math.sin(c.angle), Math.cos(c.angle));
      const quarter = Math.round(turn / (Math.PI / 2)) * (Math.PI / 2);
      rot = (turn - quarter) * e;
    }
    const lift = h / (rise + peak);
    ctx.save();
    ctx.fillStyle = `rgba(60,30,10,${0.28 * (1 - 0.5 * lift)})`;
    ctx.beginPath();
    ctx.ellipse(x + h * 0.25, y + size * 0.15, size * 0.5 * (1 - 0.3 * lift), size * 0.38 * (1 - 0.3 * lift), 0, 0, Math.PI * 2);
    ctx.fill();
    const drawn = size * (1 + 0.25 * lift); // closer to the eye when higher up
    ctx.translate(x, y - h);
    ctx.rotate(rot);
    ctx.drawImage(img, -drawn / 2, -drawn / 2, drawn, drawn);
    ctx.restore();
  }

  /** A crate's last truck has left: it pops out of the dock in a burst of confetti. */
  private leave(slot: number, color: string): void {
    this.leavers = this.leavers.filter((l) => l.slot !== slot);
    this.leavers.push({ slot, color, t: 0 });
    const r = this.slotRect(slot);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h * 0.45;
    const tones = [color, shade(color, 0.45), "#ffffff"];
    for (let k = 0; k < 14; k++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4; // mostly upwards
      const v = 110 + Math.random() * 110;
      this.particles.push({
        x: cx + (Math.random() - 0.5) * r.w * 0.5,
        y: cy + (Math.random() - 0.5) * r.h * 0.3,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0.45 + Math.random() * 0.25,
        color: tones[k % tones.length],
        size: 3 + Math.random() * 1.5,
      });
    }
  }

  /**
   * An emptied crate leaving its bay, `t` (0..1) of the way through: a white
   * flash ring ripples out, and the crate, its count at 0, swells a little,
   * then shrinks away with a small spin as it fades.
   */
  private drawLeaving(x: number, r: { y: number; w: number; h: number }, color: string, t: number): void {
    const ctx = this.ctx;
    const grow = t * 16;
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.85;
    ctx.strokeStyle = "#ffffff";
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 3;
    roundRect(ctx, x - grow, r.y - grow, r.w + grow * 2, r.h + grow * 2, 14 + grow);
    ctx.stroke();
    ctx.restore();

    const swell = 0.25;
    const k = t < swell ? 0 : (t - swell) / (1 - swell);
    const scale = t < swell ? 1 + 0.12 * (t / swell) : 1.12 * (1 - k * k);
    if (scale <= 0.02) return;
    const cx = x + r.w / 2;
    const cy = r.y + r.h / 2;
    ctx.save();
    ctx.globalAlpha = 1 - k;
    ctx.translate(cx, cy);
    ctx.rotate(0.35 * k);
    ctx.scale(scale, scale);
    pod(ctx, -r.w / 2, -r.h / 2, r.w, r.h, color);
    // The countdown ends on 0 as the crate leaves.
    countLabel(ctx, "0", 0, -r.h / 2 + r.h * 0.4, 25, color);
    ctx.restore();
  }

  /** A crate lands in its slot: it bounces, a glow ripples out, and a few sparkles pop. */
  private land(f: Flyer): void {
    this.slotLand[f.slot] = 1;
    const r = this.slotRect(f.slot);
    for (let k = 0; k < 8; k++) {
      const a = -Math.PI * (0.1 + 0.8 * (k / 7)); // fan out upwards from the top edge
      const v = 90 + Math.random() * 70;
      this.particles.push({
        x: r.x + r.w / 2 + Math.cos(a) * r.w * 0.45,
        y: r.y + 2,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0.32 + Math.random() * 0.15,
        color: k % 2 ? "#ffffff" : shade(f.color, 0.5),
        size: 3.5,
      });
    }
  }

  /** A little dust where the cube lands in the bed. */
  private landPuff(c: Car): void {
    const bed = this.bedPoint(c);
    for (let k = 0; k < 4; k++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        x: bed.x,
        y: bed.y,
        vx: Math.cos(a) * (30 + Math.random() * 30),
        vy: Math.sin(a) * (30 + Math.random() * 30) - 20,
        life: 0.18 + Math.random() * 0.1,
        color: "#efe2cc",
        size: 2,
      });
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
    this.drawFlyers();
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
      const { x, y } = this.carPose(c);
      let size = carScale * (0.55 + 0.45 * fade);
      let cargo = c.cargo;
      if (c.state === "load") {
        const t = 1 - c.wait / LOAD_TIME;
        cargo = t >= LAND_AT;
        // The springs give a little as the cube lands, then settle.
        if (cargo) size *= 1 - 0.07 * Math.sin(((t - LAND_AT) / (1 - LAND_AT)) * Math.PI);
      }
      car(ctx, x, y, c.angle, c.color, cargo, size, fade);
    }
    // Cubes on their way into a truck are in the air, so they go over everything.
    for (const c of this.cars) {
      if (c.state === "load" && 1 - c.wait / LOAD_TIME < LAND_AT) this.drawLoading(c, 1 - c.wait / LOAD_TIME);
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
    // Round slate buttons with white icons; the colorful buttons live at the bottom.
    const round = (x: number, y: number, r: number, kind: IconKind, fn: () => void) => {
      roundButton(ctx, x, y, r);
      icon(ctx, kind, x, y, r * 0.95, "#4a505b");
      this.button(x - r, y - r, r * 2, r * 2, fn);
    };
    round(30, 32, 17, "restart", () => this.startLevel());
    round(70, 32, 15, "prev", () => this.goToLevel(this.levelIndex - 1));
    round(300, 32, 15, "next", () => this.goToLevel(this.levelIndex + 1));

    const title = this.custom
      ? this.level.picture.name
      : `${this.levelIndex + 1}/${this.specs.length} · ${this.level.picture.name}`;
    countLabel(ctx, title, 185, 24, 18, "#b5763c", false, 190);
    // The difficulty as a small chip in a color that warms up as it gets harder.
    const r = this.winRate;
    const [difficulty, tone] =
      r >= 0.9 ? ["Easy", "#5cc464"] : r >= 0.65 ? ["Medium", "#f2b43c"] : r >= 0.45 ? ["Hard", "#f0803c"] : ["Expert", "#e8424f"];
    const chipW = labelWidth(ctx, difficulty, 11) + 18;
    pod(ctx, 185 - chipW / 2, 38, chipW, 17, tone, 8.5);
    countLabel(ctx, difficulty, 185, 45.5, 11, tone, true);

    // Speed toggle: one arrow per step of speed, then the speed; each tap goes up one, 3x back to 1x.
    const sp = { x: 326, y: 14, w: 82, h: 38 };
    const spMid = sp.y + (sp.h - Math.max(3, sp.h * 0.1)) / 2;
    pod(ctx, sp.x, sp.y, sp.w, sp.h, "#3fb6f2", 16);
    // The label stays put: the layout is centered for the widest case (three
    // arrows), and the arrows sit just left of the label, growing leftwards.
    const textW = labelWidth(ctx, "3x", 17);
    const groupW = speedArrowsWidth(3, 13) + 6 + textW;
    const labelX = sp.x + (sp.w + groupW) / 2 - textW / 2;
    const arrowsW = speedArrowsWidth(this.speed, 13);
    speedArrows(ctx, this.speed, labelX - textW / 2 - 6 - arrowsW, spMid, 13, "#3fb6f2");
    countLabel(ctx, `${this.speed}x`, labelX, spMid, 17, "#3fb6f2");
    this.button(sp.x, sp.y, sp.w, sp.h, () => (this.speed = (this.speed % 3) + 1));
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

    // The road around the field: asphalt between cream curbs, with a soft shadow,
    // fine white edge lines and a dashed center line.
    const ring = this.ring;
    const loop = (out: number) =>
      roundRect(ctx, ring.x0 - out, ring.y0 - out, ring.x1 - ring.x0 + 2 * out, ring.y1 - ring.y0 + 2 * out, Math.max(1, 8 + out));
    ctx.save();
    ctx.lineJoin = "round";
    ctx.translate(0, 2.5);
    ctx.strokeStyle = "rgba(90,55,20,0.16)";
    ctx.lineWidth = ROAD_W + 7;
    loop(0);
    ctx.stroke();
    ctx.restore();
    ctx.lineJoin = "round";
    ctx.strokeStyle = CURB;
    ctx.lineWidth = ROAD_W + 4;
    loop(0);
    ctx.stroke();
    ctx.strokeStyle = ASPHALT;
    ctx.lineWidth = ROAD_W;
    ctx.stroke();
    ctx.strokeStyle = EDGE_LINE;
    ctx.lineWidth = 1;
    for (const out of [ROAD_W / 2 - 2.5, -(ROAD_W / 2 - 2.5)]) {
      loop(out);
      ctx.stroke();
    }
    ctx.strokeStyle = CENTER_LINE;
    ctx.lineWidth = 1.4;
    ctx.lineCap = "round";
    ctx.setLineDash([6, 7]);
    loop(0);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineCap = "butt";

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
    const top = this.ring.y1 + 1; // just below the road's center line, so it stays visible

    // A wide driveway from the road down to the ramp, one lane per ramp lane,
    // with curbs and edge lines down its sides.
    const apron = RAMP_LANES[RAMP_LANES.length - 1] + 14;
    ctx.fillStyle = CURB;
    ctx.fillRect(TUNNEL.x - apron - 2, this.ring.y1 + ROAD_W / 2, apron * 2 + 4, y - this.ring.y1 - ROAD_W / 2 + 2);
    ctx.fillStyle = ASPHALT;
    ctx.fillRect(TUNNEL.x - apron, top, apron * 2, y - top + 2);
    ctx.strokeStyle = EDGE_LINE;
    ctx.lineWidth = 1;
    for (const ex of [TUNNEL.x - apron + 2.5, TUNNEL.x + apron - 2.5]) {
      ctx.beginPath();
      ctx.moveTo(ex, this.ring.y1 + ROAD_W / 2 - 2.5);
      ctx.lineTo(ex, y - 4);
      ctx.stroke();
    }

    // The ramp: a brushed-metal portal around a deep slate tunnel.
    const r = 12;
    ctx.save();
    ctx.shadowColor = "rgba(60,35,15,0.35)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    const metal = ctx.createLinearGradient(0, y - 6, 0, y + TUNNEL.h + 6);
    metal.addColorStop(0, "#f4f0ea");
    metal.addColorStop(0.5, "#d3ccc1");
    metal.addColorStop(1, "#a59c90");
    ctx.fillStyle = metal;
    roundRect(ctx, x - 6, y - 6, TUNNEL.w + 12, TUNNEL.h + 12, r + 5);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "rgba(90,80,70,0.45)";
    ctx.lineWidth = 1;
    roundRect(ctx, x - 5.5, y - 5.5, TUNNEL.w + 11, TUNNEL.h + 11, r + 4.5);
    ctx.stroke();
    // The opening gets darker as the ramp goes down, with a shadow under the lip.
    const deep = ctx.createLinearGradient(0, y, 0, y + TUNNEL.h);
    deep.addColorStop(0, "#3d4350");
    deep.addColorStop(1, "#0c0e13");
    ctx.fillStyle = deep;
    roundRect(ctx, x, y, TUNNEL.w, TUNNEL.h, r);
    ctx.fill();
    const lip = ctx.createLinearGradient(0, y, 0, y + 9);
    lip.addColorStop(0, "rgba(0,0,0,0.45)");
    lip.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = lip;
    roundRect(ctx, x, y, TUNNEL.w, 9, r);
    ctx.fill();
    // A row of warm lights along the top of the portal.
    ctx.save();
    ctx.fillStyle = CENTER_LINE;
    ctx.shadowColor = "rgba(255,200,90,0.9)";
    ctx.shadowBlur = 4;
    for (let lx = x + 10; lx <= x + TUNNEL.w - 9; lx += 11) {
      ctx.beginPath();
      ctx.arc(lx, y - 3, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Lane markings between the ramp lanes, continuing up the driveway.
    ctx.lineWidth = 1.3;
    ctx.lineCap = "round";
    ctx.setLineDash([5, 6]);
    for (let k = 1; k < RAMP_LANES.length; k++) {
      const lx = TUNNEL.x + (RAMP_LANES[k - 1] + RAMP_LANES[k]) / 2;
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.beginPath();
      ctx.moveTo(lx, this.ring.y1 + ROAD_W / 2 + 2);
      ctx.lineTo(lx, y - 8);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.16)";
      ctx.beginPath();
      ctx.moveTo(lx, y + 5);
      ctx.lineTo(lx, y + TUNNEL.h - 6);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.lineCap = "butt";
  }


  private drawSlots(): void {
    const ctx = this.ctx;
    const dx = this.shake > 0 ? Math.sin(this.shake * 60) * 6 : 0;
    // The dock that holds the slots, sized to however many there are.
    const first = this.slotRect(0);
    const last = this.slotRect(this.game.slots.length - 1);
    dock(ctx, first.x - 8 + dx, first.y - 8, last.x + last.w - first.x + 16, first.h + 16);
    this.game.slots.forEach((b, i) => {
      const r = this.slotRect(i);
      const x = r.x + dx;
      well(ctx, x, r.y, r.w, r.h);
      if (this.flyers.some((f) => f.slot === i)) return; // drawn in flight, over the tray
      if (!b) {
        const leaving = this.leavers.find((l) => l.slot === i);
        if (leaving) this.drawLeaving(x, r, leaving.color, leaving.t);
        return;
      }
      const color = this.level.picture.palette[b.color];
      // Blocked only if nothing of its color can be reached now or will be once
      // the trucks already out collect their cubes. A blocked crate keeps its
      // full color so you can still tell what it is; stripes, a quieter number
      // and a badge say it is waiting.
      const waiting = this.game.slotBlocked(i);
      // Just landed: a glow ripples out of the bay, and the crate squashes and
      // springs back from its base with a little wobble.
      const land = this.slotLand[i] ?? 0;
      if (land > 0) {
        const grow = (1 - land) * 12;
        ctx.save();
        ctx.globalAlpha = land * 0.9;
        ctx.strokeStyle = shade(color, 0.45);
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.lineWidth = 3;
        roundRect(ctx, x - grow, r.y - grow, r.w + grow * 2, r.h + grow * 2, 14 + grow);
        ctx.stroke();
        ctx.restore();
      }
      const wob = land > 0 ? Math.sin((1 - land) * Math.PI * 3) * land * 0.1 : 0;
      ctx.save();
      ctx.translate(x + r.w / 2, r.y + r.h);
      ctx.scale(1 + wob, 1 - wob);
      ctx.translate(-(x + r.w / 2), -(r.y + r.h));
      pod(ctx, x, r.y, r.w, r.h, color);
      if (waiting) holdStripes(ctx, x, r.y, r.w, r.h, color);
      ctx.save();
      if (waiting) ctx.globalAlpha = 0.6;
      // The number pops a little each time a truck leaves.
      const bump = this.slotBump[i] ?? 0;
      countLabel(ctx, String(b.count), x + r.w / 2, r.y + r.h * 0.4, 25 * (1 + 0.22 * bump * bump), color);
      // How many of this crate's trucks are still to go.
      // A slim glossy pill: a recessed track, and a bright fill with a shine on top.
      const start = this.startCounts.get(b.id) ?? b.count;
      const barW = r.w - 22;
      const barH = 5;
      const barX = x + 11;
      const barY = r.y + r.h * 0.71;
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      roundRect(ctx, barX, barY, barW, barH, barH / 2);
      ctx.fill();
      const fillW = Math.max(barH, barW * (b.count / start));
      ctx.fillStyle = luminanceFill(color);
      roundRect(ctx, barX, barY, fillW, barH, barH / 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      roundRect(ctx, barX + 1, barY + 0.8, Math.max(0, fillW - 2), barH * 0.35, barH * 0.2);
      ctx.fill();
      ctx.restore();
      ctx.restore();
      if (waiting) pill(ctx, "blocked", x + r.w / 2, r.y + r.h + 9);
    });
  }

  /**
   * Crates on their way from the tray to a slot: eased in, arcing up and
   * swelling a little at the top of the arc, then settling to the slot's size.
   */
  private drawFlyers(): void {
    const ctx = this.ctx;
    for (const f of this.flyers) {
      const r = this.slotRect(f.slot);
      const t = 1 - (1 - f.t) ** 3;
      const lift = Math.sin(Math.PI * f.t);
      const grow = 1 + 0.12 * lift;
      const fw = (BLOCK.w + (r.w - BLOCK.w) * t) * grow;
      const fh = (BLOCK.h + (r.h - BLOCK.h) * t) * grow;
      const cx = f.fromX + BLOCK.w / 2 + (r.x + r.w / 2 - f.fromX - BLOCK.w / 2) * t;
      const cy = f.fromY + BLOCK.h / 2 + (r.y + r.h / 2 - f.fromY - BLOCK.h / 2) * t - FLY_ARC * lift;
      pod(ctx, cx - fw / 2, cy - fh / 2, fw, fh, f.color);
      countLabel(ctx, String(f.count), cx, cy - fh / 2 + fh * 0.42, 25 * grow, f.color);
    }
  }

  private drawTray(): void {
    const ctx = this.ctx;
    const cols = this.game.columns.length;
    if (cols > 0) {
      // A light shelf under the stacks, lined up with the slot dock above.
      const first = this.blockRect(0, 0);
      const last = this.blockRect(cols - 1, 0);
      const rowsH = TRAY_ROWS * (BLOCK.h + BLOCK.gy);
      shelf(ctx, first.x - 8, TRAY_Y - 12, last.x + last.w - first.x + 16, rowsH + 30);
      // A soft highlight band behind the front row: these are the crates you can tap.
      const band = ctx.createLinearGradient(0, TRAY_Y - 4, 0, TRAY_Y + BLOCK.h + 4);
      band.addColorStop(0, "rgba(255,255,255,0)");
      band.addColorStop(0.5, "rgba(255,255,255,0.55)");
      band.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = band;
      ctx.fillRect(first.x - 4, TRAY_Y - 4, last.x + last.w - first.x + 8, BLOCK.h + 8);
      // Each column sits in its own recessed lane.
      for (let c = 0; c < cols; c++) {
        const r = this.blockRect(c, 0);
        lane(ctx, r.x - 3, TRAY_Y - 5, r.w + 6, rowsH + 16);
      }
    }
    this.game.columns.forEach((col, c) => {
      // Crates further back are smaller and fainter, like a stack waiting its turn.
      // After a tap they rise a row in a cascade, front first: each springs up,
      // overshooting a touch before it settles, stretching a little while it
      // moves, and brightens and widens into its new depth. A shine then sweeps
      // across the new front crate.
      const since = this.trayRise[c] ?? Infinity;
      for (let row = TRAY_ROWS - 1; row >= 0; row--) {
        const b = col[row];
        if (!b) continue;
        const p = Math.max(0, Math.min(1, (since - row * RISE_STAGGER) / RISE_TIME));
        const rise = 1 - easeOutBack(p); // rows still to go; a little below 0 when overshooting
        const moving = Math.sin(Math.PI * p);
        const depth = row + Math.max(0, rise);
        const r = this.blockRect(c, row);
        const y = r.y + rise * (BLOCK.h + BLOCK.gy);
        const color = this.level.picture.palette[b.color];
        const alpha = atDepth(TRAY_ALPHA, depth);
        if (alpha <= 0.01) continue;
        const inset = atDepth(TRAY_INSET, depth);
        const w = (r.w - inset * 2) * (1 - 0.05 * moving);
        const h = r.h * (1 + 0.1 * moving);
        const top = y + r.h - h;
        ctx.save();
        ctx.globalAlpha = alpha;
        pod(ctx, r.x + r.w / 2 - w / 2, top, w, h, color);
        const front = depth < 0.5;
        countLabel(ctx, String(b.count), r.x + r.w / 2, top + h * 0.42, atDepth(TRAY_LABEL, depth), color, !front);
        ctx.restore();
        if (row === 0) {
          const q = (since - RISE_TIME) / SHEEN_TIME;
          if (q > 0 && q < 1) sheen(ctx, r.x + r.w / 2 - w / 2, top, w, h, q);
          this.button(r.x, r.y, r.w, r.h, () => this.tapColumn(c));
        }
      }
      // How many more wait out of sight: a small chip at the foot of the lane.
      const hidden = col.length - TRAY_ROWS;
      if (hidden > 0) {
        const r = this.blockRect(c, TRAY_ROWS);
        chip(ctx, `+${hidden} more`, r.x + r.w / 2, r.y + 1, "#b08960");
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
    // Flat while it can't be used, so the faded label stays clean.
    countLabel(ctx, "+1 Slot", 100, mid, 19, "#5cc464", !canSlot);
    badge(ctx, canSlot ? "1" : "0", 168, mid, "#5cc464");
    ctx.restore();
    if (canSlot) this.button(24, by, 176, bh, () => this.addSlot());

    pod(ctx, 220, by, 176, bh, "#8f7cf0", 20);
    // Center the icon and the words together as one group.
    const textW = labelWidth(ctx, "Your image", 18);
    const iconW = 20;
    const gap = 9;
    const left = 220 + (176 - (iconW + gap + textW)) / 2;
    icon(ctx, "picture", left + iconW / 2, mid, 18, "#8f7cf0");
    countLabel(ctx, "Your image", left + iconW + gap + textW / 2, mid, 18, "#8f7cf0");
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
      const next = this.custom
        ? { text: "Play again", color: "#5cc464", fn: () => this.startLevel() }
        : {
            text: last ? "Back to level 1" : "Next level",
            color: "#5cc464",
            fn: () => this.goToLevel(this.levelIndex + 1),
          };
      this.panel("Picture complete!", "Every cube was hauled away.", [next], "#5cc464");
    } else {
      const canSlot = !this.slotBoostUsed && this.game.slots.length < MAX_SLOTS;
      this.panel(
        "Out of moves",
        "Every slot is waiting for a color that can't be reached.",
        [
          ...(canSlot ? [{ text: "+1 Slot", color: "#5cc464", fn: () => this.addSlot() }] : []),
          { text: "Retry", color: "#8f7cf0", fn: () => this.startLevel() },
        ],
        "#e8424f",
      );
    }
  }

  /** A message panel over the game; `tone` colors its title. */
  private panel(
    title: string,
    body: string,
    actions: { text: string; color: string; fn: () => void }[],
    tone = "#8f7cf0",
  ): void {
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
    countLabel(ctx, title, W / 2, py + 44, 27, tone, false, pw - 36);
    if (body) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = BODY_FONT;
      ctx.fillStyle = "#8a6440";
      wrap(ctx, body, W / 2, py + 82, pw - 40, 20);
    }
    const bw = actions.length > 1 ? 130 : 200;
    const total = actions.length * bw + (actions.length - 1) * 16;
    actions.forEach((a, i) => {
      const bx = (W - total) / 2 + i * (bw + 16);
      const by = py + ph - 74;
      pod(ctx, bx, by, bw, 54, a.color, 20);
      countLabel(ctx, a.text, bx + bw / 2, by + (54 - Math.max(3, 5.4)) / 2, 19, a.color);
      this.button(bx, by, bw, 54, a.fn);
    });
  }
}

/** A progress-bar color that shows up on the crate: white, or dark on light crates. */
/** Ease-out with a small overshoot past 1 before settling: a springy arrival. */
function easeOutBack(t: number): number {
  const c = 1.9;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

/**
 * A glossy shine sweeping across a crate's face, `q` (0..1) of the way across:
 * a slanted white band clipped to the crate, brightest midway.
 */
function sheen(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, q: number): void {
  const face = h - Math.max(3, h * 0.1);
  ctx.save();
  roundRect(ctx, x, y, w, face, 14);
  ctx.clip();
  ctx.translate(x - w * 0.3 + w * 1.6 * q, y + face / 2);
  ctx.rotate(0.35);
  const band = ctx.createLinearGradient(-12, 0, 12, 0);
  band.addColorStop(0, "rgba(255,255,255,0)");
  band.addColorStop(0.5, `rgba(255,255,255,${0.6 * Math.sin(Math.PI * q)})`);
  band.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = band;
  ctx.fillRect(-12, -face, 24, face * 2);
  ctx.restore();
}

/** Reads a per-depth table (front = 0) at a fractional depth, blending between rows. */
function atDepth(table: number[], depth: number): number {
  const d = Math.max(0, Math.min(table.length - 1, depth));
  const i = Math.min(table.length - 2, Math.floor(d));
  return table[i] + (table[i + 1] - table[i]) * (d - i);
}

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
