# Cube Hunt

A browser prototype of a color-sorting puzzle: colored ants eat a pixel-art
picture cube by cube. You choose which crate of ants to send out next.

## Run it

```bash
npm install
npm run dev        # open the printed URL; ?level=3 jumps to a level
npm test           # rules, generator and solvability tests
npm run build      # type-check and build into dist/
```

## How to play

- The tray at the bottom holds crates. Each crate is one color and holds as many
  ants as its number. Only the front crate of each column can be tapped.
- Tapping a crate moves it into a free **slot**. Its ants march out one by one,
  and each eats one reachable cube of the same color.
- A cube is **reachable** when it touches an open edge of the board or a cube that
  has already been eaten. On most levels ants can only enter from the bottom (the
  side with the hole). The walls show which edges are closed.
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
src/view/      canvas drawing helpers (tiles, labels, ants)
src/main.ts    the app: layout, input, animation, overlays
```

The rules are separate from the visuals. `Game.tick()` decides instantly which cube
each ant eats, and the view only animates the ant walking there. This keeps the
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

Ant totals always match the picture exactly, and the tests check this.

## Ideas for next steps

- More boosters: pick any crate from the tray, a cannon that clears a color, undo.
- Level select, saved progress, stars for finishing without boosters.
- A hand-made level editor, and more and larger pictures.
- Sound, haptics, and ants that walk along the board edge instead of straight lines.
- If it's fun: port `src/core` and `src/levels` to C# for a Unity mobile build.
