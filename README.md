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

There are 46 built-in levels. The first 10 are pictures in two runs that each
go from easier to harder: Strawberry, Mushroom, Sunset, Ringed Planet and Cat,
then Cactus, Rocket, Rubber Duck, Ice Cream and Watermelon. Pictures range from
29×29 cubes (Strawberry) to 46×46 (Ringed Planet). Then come the digits 0 to 9
and the letters A to Z (levels 11 to 46): each is a 32×40 board with the
character in three color bands on a dark background, at Medium or Hard.

- The tray at the bottom holds crates. Each crate is one color and sends out as
  many trucks as its number. Only the front crate of each column can be tapped.
- Tapping a crate moves it into a free **slot**. Its trucks drive up out of the
  ramp right away, spaced out in a line so you can see each one, and follow the road around the field. Each turns in at an open
  side, drives through cleared space to one reachable cube of its color, loads it
  and carries it back down the ramp. Trucks never stop for each other: where
  their routes cross, they drive straight through. On the road they keep to a lane
  each way.
- A cube is **reachable** when a truck can drive up to it: it touches an open edge
  of the field, or cleared space that connects to one. A cube only counts as
  cleared once its truck has actually picked it up, so crates never send trucks
  to cubes that are still walled in.
- Cubes are taken row by row from the ramp side, each row from the middle out:
  each truck takes the reachable cube of its color in the lowest row (no brick
  wall may be in the way), then the one with the shortest drive from the ramp.
  On a level open on every side, cubes on the far left and right edges wait for
  the rows below them. A crate sends a truck to
  every reachable cube, one after another (about 7 a second at 1x) so you can
  watch its number count down: with 15 reachable cubes, 15 trucks go in a row;
  any more go as soon as a pickup opens up a new cube. On most levels trucks can
  only turn in from the bottom (the side with the ramp). The walls between the road
  and the field show which sides are closed.
- A crate whose color has nothing reachable is marked **blocked**, unless a
  truck that is already out will uncover a cube of its color when it picks up
  its own. If every slot is full and every crate in them is blocked, you're out
  of moves.
- Boosters: **+1 Slot** once per level. **Your image** turns any picture into a
  level: it is shrunk so its longer side is 40 cubes, with up to 6 colors, so a
  square picture fills the board, and transparent areas become empty space.
  Simple, bold pictures work best; pixel art drawn at 40×40 maps one pixel to
  one cube. The speed button at the top right steps through **▶ 1x**, **▶▶ 2x** and **▶▶▶ 3x**.

## Code layout

```
src/core/      game rules only, no drawing (easy to test or port to Unity/Godot)
  board.ts     picture grid + which cells are reachable per color
  game.ts      tray columns, slots, tap(), tick(), win/stuck detection
src/levels/
  art.ts       the built-in pictures (drawn in code) and their difficulty settings
  numbers.ts   the digit levels 0-9, drawn from 5x7 glyphs
  letters.ts   the letter levels A-Z, drawn from 5x7 glyphs
  generator.ts picture -> tray of crates; picks a tray that hits a difficulty target
  solver.ts    greedy solver (proves a level is winnable) + random-player win rate
  worker.ts    builds levels in the background (the next few built-in ones, and uploads), so the game never stalls
  image.ts     uploaded image -> picture (downscale + k-means color reduction)
src/view/
  draw.ts      canvas drawing helpers (tiles, labels, trucks)
  roads.ts     truck routes: road around the field, then through cleared cells
src/main.ts    the app: layout, input, animation, overlays
vite.config.ts build settings, including the step that inlines the code into index.html
```

The rules are separate from the visuals. `Game.tick()` decides instantly which cube
each truck takes, and the view only animates the truck driving there and back. This keeps the
speed toggle simple and lets the solver run thousands of games in milliseconds.

## How levels are generated

1. Peel the picture one ring at a time from the open edges to find when each cube
   becomes reachable.
2. Cut each color's cubes into crates, ordered roughly by when they open up.
   Most crates are small (about 8 to 25 trucks on a typical level); only now
   and then is one big (about 40 to 80). `shuffle` adds noise to the order.
3. Deal the crates into 5 columns, earliest at the front. All randomness comes
   from a seeded generator, so a level is identical in every browser.
4. Generate up to 16 candidate trays. Drop any that the greedy solver can't win, so
   every level is winnable without boosters. Of the rest, keep the one whose
   **random-player win rate** (how often someone tapping at random still wins) is
   closest to the level's `targetWinRate`. That rate is also shown as the
   Easy / Medium / Hard / Expert label.

Truck totals always match the picture exactly, and the tests check this. Each
level's colors are also chosen to be easy to tell apart on small cubes.

## Ideas for next steps

- More boosters: pick any crate from the tray, a cannon that clears a color, undo.
- Level select, saved progress, stars for finishing without boosters.
- A hand-made level editor, and more pictures.
- Sound and haptics.
- If it's fun: port `src/core` and `src/levels` to C# for a Unity mobile build.
