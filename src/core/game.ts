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
 * truck, which removes one reachable cell of its color.
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

  /** Booster: one more slot. Un-sticks the game if it was stuck. */
  addSlot(): void {
    this.slots.push(null);
    if (this.status === "stuck") this.status = "playing";
  }

  tick(): Dispatch[] {
    if (this.status !== "playing") return [];
    const out: Dispatch[] = [];
    for (let s = 0; s < this.slots.length; s++) {
      const b = this.slots[s];
      if (!b) continue;
      const cell = this.board.pickTarget(b.color);
      if (cell < 0) continue;
      this.board.eat(cell);
      b.count--;
      out.push({ slot: s, cell, color: b.color });
      if (b.count === 0) this.slots[s] = null;
    }
    this.updateStatus();
    return out;
  }

  /** Stuck = every slot is taken and none of them can eat. */
  isStuck(): boolean {
    if (this.hasFreeSlot()) return false;
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
