import { Board } from "./board";
import { cloneLevel, type Block, type ColorId, type Level } from "./types";

export type Status = "playing" | "won" | "stuck";

/** One truck sent from a slot to haul away a cell. */
export interface Dispatch {
  slot: number;
  cell: number;
  color: ColorId;
}

/**
 * Game rules, independent of rendering and timing. The view calls `tap()` on
 * player input and `tick()` on a timer; each tick every slot sends at most one
 * truck, which claims one reachable cube of its color. The cube stays on the
 * board, still blocking the cubes behind it, until the view calls `collect()`
 * when the truck actually picks it up. `step()` does both at once.
 */
export class Game {
  readonly level: Level;
  readonly board: Board;
  readonly columns: Block[][];
  readonly slots: (Block | null)[];
  status: Status = "playing";

  constructor(level: Level) {
    this.level = cloneLevel(level);
    this.board = new Board(level.picture, level.edges);
    this.columns = this.level.columns;
    this.slots = new Array<Block | null>(level.slotCount).fill(null);
  }

  front(col: number): Block | undefined {
    return this.columns[col]?.[0];
  }

  hasFreeSlot(): boolean {
    return this.slots.includes(null);
  }

  canTap(col: number): boolean {
    return this.status === "playing" && !!this.front(col) && this.hasFreeSlot();
  }

  /** Moves the front block of `col` into the first free slot. Returns the slot index, or -1. */
  tap(col: number): number {
    if (!this.canTap(col)) return -1;
    const slot = this.slots.indexOf(null);
    this.slots[slot] = this.columns[col].shift()!;
    this.updateStatus();
    return slot;
  }

  /** Can the block in this slot eat anything right now? */
  slotCanEat(slot: number): boolean {
    const b = this.slots[slot];
    return !!b && this.board.reachableCount(b.color) > 0;
  }

  /**
   * Is this slot's crate really blocked: nothing of its color reachable now, and
   * nothing that the trucks already out will open up when they collect their cubes?
   */
  slotBlocked(slot: number): boolean {
    const b = this.slots[slot];
    return !!b && this.board.reachableCount(b.color) === 0 && !this.board.opensUp(b.color);
  }

  /** Booster: one more slot. Un-sticks the game if it was stuck. */
  addSlot(): void {
    this.slots.push(null);
    if (this.status === "stuck") this.status = "playing";
  }

  /** `ready` lets the view hold a slot back, e.g. to space out its trucks. */
  tick(ready: (slot: number) => boolean = () => true): Dispatch[] {
    if (this.status !== "playing") return [];
    const out: Dispatch[] = [];
    for (let s = 0; s < this.slots.length; s++) {
      const b = this.slots[s];
      if (!b || !ready(s)) continue;
      const cell = this.board.pickTarget(b.color);
      if (cell < 0) continue;
      this.board.claim(cell);
      b.count--;
      out.push({ slot: s, cell, color: b.color });
      if (b.count === 0) this.slots[s] = null;
    }
    this.updateStatus();
    return out;
  }

  /** A truck has picked up its claimed cube: it leaves the board and opens the space behind it. */
  collect(cell: number): void {
    this.board.eat(cell);
    this.updateStatus();
  }

  /** One tick with every truck picking up its cube at once. Used by the solver and tests. */
  step(): Dispatch[] {
    const sent = this.tick();
    for (const d of sent) this.board.eat(d.cell);
    this.updateStatus();
    return sent;
  }

  /**
   * Stuck = every slot is taken, none of them can eat, and no truck is still on
   * its way (a pickup could open up new cubes).
   */
  isStuck(): boolean {
    if (this.hasFreeSlot() || this.board.pending > 0) return false;
    for (let s = 0; s < this.slots.length; s++) if (this.slotCanEat(s)) return false;
    return true;
  }

  trayCount(): number {
    return this.columns.reduce((n, c) => n + c.length, 0);
  }

  private updateStatus(): void {
    if (this.board.remaining === 0) this.status = "won";
    else if (this.isStuck()) this.status = "stuck";
  }
}
