/**
 * Builds the built-in levels off the main thread, so switching levels never
 * stalls the game: building one (trying candidate trays and simulating play
 * to hit its difficulty) can take around a second on a phone. Levels are
 * seeded, so a level built here is exactly the one the page would build.
 */
import { builtInLevels } from "./art";
import { buildLevel } from "./generator";

/** What the worker sends back for level `index`; the page already has the picture. */
export interface BuiltMessage {
  index: number;
  columns: import("../core/types").Level["columns"];
  slotCount: number;
  edges: import("../core/types").Level["edges"];
  winRate: number;
}

const specs = builtInLevels();
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<number>) => void) | null;
  postMessage(message: BuiltMessage): void;
};
scope.onmessage = (e) => {
  const index = e.data;
  const spec = specs[index];
  if (!spec) return;
  const built = buildLevel(spec.picture, spec);
  const { columns, slotCount, edges } = built.level;
  scope.postMessage({ index, columns, slotCount, edges, winRate: built.winRate });
};
