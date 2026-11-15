/**
 * Builds levels off the main thread, so the game never stalls for one:
 * building a level (trying candidate trays and simulating play to hit its
 * difficulty) can take around a second on a phone. It builds a built-in level
 * when sent its index, or an uploaded picture when sent the picture itself.
 * Levels are seeded, so a level built here is exactly the one the page would build.
 */
import type { Level, Picture } from "../core/types";
import { builtInLevels } from "./art";
import { buildLevel, type BuildOptions } from "./generator";

/** A request: a built-in level's index, or a picture to build with these options. */
export type BuildRequest = number | { picture: Picture; opts: BuildOptions };

/** What the worker sends back; the page already has the picture. `index` is -1 for an uploaded picture. */
export interface BuiltMessage {
  index: number;
  columns: Level["columns"];
  slotCount: number;
  edges: Level["edges"];
  winRate: number;
}

const specs = builtInLevels();
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<BuildRequest>) => void) | null;
  postMessage(message: BuiltMessage): void;
};
scope.onmessage = (e) => {
  const req = e.data;
  const index = typeof req === "number" ? req : -1;
  const picture = typeof req === "number" ? specs[req]?.picture : req.picture;
  const opts = typeof req === "number" ? specs[req] : req.opts;
  if (!picture || !opts) return;
  const built = buildLevel(picture, opts);
  const { columns, slotCount, edges } = built.level;
  scope.postMessage({ index, columns, slotCount, edges, winRate: built.winRate });
};
