# Cube Hunt

A browser prototype of a color-sorting puzzle: tiny colored trucks haul a
pixel-art picture away cube by cube. You choose which crate of trucks to send out next.

## Play it

The game builds into **one HTML file** with everything inlined. It runs in any
modern browser (desktop or phone) by just opening it: no install and no server.

**Without installing anything:**

1. On GitHub, open **Actions → Test and build**, then the latest run on `main`.
2. Under **Artifacts**, download **cube-hunt** and unzip it.
3. Double-click `cube-hunt.html`.

The file is self-contained, so you can also email it, put it on a USB stick, or
upload it to any static host (Netlify Drop, itch.io as an HTML game, GitHub Pages).

**With Node.js 20 or newer:**

```bash
npm install
npm run build      # writes dist/index.html; double-click it to play
```

Add `?level=3` to the URL to jump to a level.

## Develop

```bash
npm install
npm run dev        # live-reloading dev server; open the printed URL
npm test           # rules, generator and solvability tests
npm run build      # type-check, then build the single-file game into dist/
```

## How to play

- The tray at the bottom holds crates. Each crate is one color and sends out as
  many trucks as its number. Only the front crate of each column can be tapped.
- Tapping a crate moves it into a free **slot**. Its trucks drive up out of the
  ramp one by one and follow the road around the field. Each turns in at an open
  side, drives through cleared space to one reachable cube of its color, loads it
  and carries it back down the ramp. Trucks wait their turn: they queue behind
  each other, give way when merging, and wait in the tunnel until their ramp lane
  is clear.
- A cube is **reachable** when a truck can drive up to it: it touches an open edge
  of the field, or cleared space that connects to one. On most levels trucks can
  only turn in from the bottom (the side with the ramp). The walls between the road
  and the field show which sides are closed.
- A crate whose color has nothing reachable is marked **blocked**. If every slot
  is full and every crate in them is blocked, you're out of moves.
- Boosters: **+1 Slot** once per level. **Your image** turns any picture into a
  level. **▶▶** switches between 1x, 2x and 3x speed.

## Code layout

```
src/core/      game rules only, no drawing (easy to test or port to Unity/Godot)
  board.ts     picture grid + which cells are reachable per color
  game.ts      tray columns, slots, tap(), tick(), win/stuck detection
src/levels/
  art.ts       the built-in pictures (drawn in code) and their difficulty settings
  generator.ts picture -> tray of crates; picks a tray that hits a difficulty target
  solver.ts    greedy solver (proves a level is winnable) + random-player win rate
  image.ts     uploaded image -> picture (downscale + k-means color reduction)
src/view/
  draw.ts      canvas drawing helpers (tiles, labels, trucks)
  roads.ts     truck routes: road around the field, then through cleared cells
src/main.ts    the app: layout, input, traffic, animation, overlays
vite.config.ts build settings, including the step that inlines the code into index.html
```

The rules are separate from the visuals. `Game.tick()` decides instantly which cube
each truck takes, and the view only animates the truck driving there and back. This keeps the
speed toggle simple and lets the solver run thousands of games in milliseconds.

## How levels are generated

1. Peel the picture one ring at a time from the open edges to find when each cube
   becomes reachable.
2. Cut each color's cubes into crates, ordered roughly by when they open up.
   `shuffle` adds noise to that order.
3. Deal the crates into 4 columns, earliest at the front.
4. Generate up to 16 candidate trays. Drop any that the greedy solver can't win, so
   every level is winnable without boosters. Of the rest, keep the one whose
   **random-player win rate** (how often someone tapping at random still wins) is
   closest to the level's `targetWinRate`. That rate is also shown as the
   Easy / Medium / Hard / Expert label.

Truck totals always match the picture exactly, and the tests check this.

## Ideas for next steps

- More boosters: pick any crate from the tray, a cannon that clears a color, undo.
- Level select, saved progress, stars for finishing without boosters.
- A hand-made level editor, and more and larger pictures.
- Sound and haptics.
- If it's fun: port `src/core` and `src/levels` to C# for a Unity mobile build.
