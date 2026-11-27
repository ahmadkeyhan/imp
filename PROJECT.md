# Imp

Isometric hive of 3D beams. Each piece is a small impossible object: a hex frame of square rods whose loops do not close in space. The contradiction only shows up as depth. On screen the joints still meet.

Version 0.4.0. React 19, Three.js r0.187, Vite. One WebGL view. No UI chrome.

## Run

```
npm run dev
```

- Piece: http://localhost:5173/
- Pin a seed: `?s=` (hex). `?s=0` is Round and has both elbows and 3-way joints. `?s=7` is Sharp.
- Contact sheet: http://localhost:5173/sheet.html
- Without `?s=` the bootloader rolls a new seed on each load.

`npm run build` emits `dist/`. Asset URLs are relative (`base: './'`) because the bootloader zips that folder for IPFS.

## What a piece is

A flat-top hex board, center plus two rings (`HIVE_R = 2`). Each cell is a 6-bit mask, `tile.name`, digits `'0'`/`'1'`. Digit 0 is the upper-left edge, then clockwise: NW, N, NE, SE, S, SW. A shared edge is the opposite digit (0–3, 1–4, 2–5).

Those six sides are three world axes. Sides 0 and 3 step x, 1 and 4 step y, 2 and 5 step z, opposite directions. Walking a loop adds those steps. A loop that does not return to the same point cannot be built. The camera looks along `(1, -1, 1)`, which is the kernel of the projection, so the mismatch is only in depth.

`IMPOSSIBLE` is `1`. Every accepted frame is a paradox. Set it to `0` and every frame is buildable.

Generation is randomized backtracking in `generateHive` (`src/hive.ts`):

- Footprint, weighted: Hive 35, Ring 30, Twin 20, Triangle 15. Core (inner 7 cells) is commented out. It collapsed to one triangle.
- Density, weighted: Medium 45, Sparse 30, Dense 25. Sparse is skipped on a mirror and on a Ring. Bias tilts the search toward fewer or more crossings.
- Symmetry is rare (`SYMMETRIC = 0.08`) and only across an axis the footprint already has. Accidental mirrors are thrown out and the search starts over, up to 4 times.
- One road network. A single-crossing stub is rejected (`countBits === 1` is skipped). Empty hives are rejected. Occupied cells must touch every side of the footprint, so the same loop cannot slide to a second place.
- A 4-, 5-, or 6-crossing cell may be drawn as stacked layers (`stackLayers`). The solid view ignores layers and uses `name`.

`measureHive` names the whole frame, not a part of it: Penrose (one 3-corner loop), Loop, Figure-8, Spectacles, Theta, Chain, Lattice. It also counts cells, loops, paradoxes, and symmetry (None, Mirror, Threefold, Sixfold). Build order is a breadth-first walk from the topmost joint.

Style is rolled after the structure, from the same RNG (`pickStyle`):

- Palette, about: Peach 35, Rose 21, Mist 18, Sand 14, Midnight 12 (percent). Midnight takes the end of each other range, so other seeds keep the palette they had.
- Corners: Sharp 75, Round 25.

## How it is drawn

Orthographic camera in `src/solidView.ts`. View `(1, -1, 1)`. Screen right `(1, 0, -1)`. Screen down `(1, 2, 1)`. `PX` is about 14.14 art pixels per world unit (`TILE_W = 160`, reach 6).

Artboard is 640 by `800 * sin(60°)`. The hive sits inside the window with 6% padding (`frameScale`). The rest of the view is a ground plane in the scene, not a CSS fill. Ground has no grit.

`top` is less than `bottom` on the camera, so camera-up points down the artboard. That flip reverses winding. The beam material uses `side: BackSide` so a normal outward mesh still shows. Do not "fix" the winding without flipping the camera back.

Each occupied cell is a group at the cell center. Beam cross-section is 3.4×3.4 (`BEAM`). A rod runs from the hub to `EXT` (9) on each open axis. Empty cells (`000000`) are skipped. Each arm is clipped only on its own hex edge, with a little bleed, so neighboring rods meet there and the other edges never shave a thick beam.

Joints:

- Sharp, and any joint that is not an elbow: a `BoxGeometry` hub plus a box rod per open side. This includes 3-way, 4-way, crosses, straight bars (opposite arms, same axis), and stubs.
- Round trait, and exactly two arms on different axes: one swept elbow. Square profile, hard edges, no bevel. Outer radius is `BEAM` + 0.22, inner radius 0.22, because inner = outer − beam. The arc center is `BEND * (u + v)`, not the origin, so the tangent at each end matches the arm. 8 steps.
- The corners trait is per hive, not per joint. A Round hive still keeps every 3-or-more joint sharp.

Light and color (beam fragment shader), after the soft isometric reference:

- Tops: one long vertical gradient, `topLow` to `topMid` to `top`.
- Faces toward the right: `blush` to `right`, fading toward the ground along each arm and low on the right side.
- Faces toward the left: `right` to `shade`, into `left` (blue) on the left side and `low` (mint) at the bottom.
- Inner corners: tops take a soft `shade` shadow. No color is painted into corners.
- Anything shaded by distance from a joint must settle by `SEAM` (4.2 along the arm). The hexagon clip crosses faces at a slant from 4.3, and a later fade shows there as a cut.
- Gradients follow the joint, so they stay on the beams in the 3D view.
- Grit is only 0.012, enough to stop banding.
- The ground is flat `background`.

The dashed hex grid is off (`GRID = 0`). The live view draws the piece in; stills are whole.

`HiveMark.tsx` is the earlier 2D line drawing. It is not mounted. `App.tsx` leaves it commented out.

## Live view (not in capture or sheet stills)

- The reveal, called One line (`assemble` in `src/solidScene.ts`): the piece is sketched one beam at a time. The walk is depth first from the first joint in build order, and goes back to start each new branch. Every beam is drawn once, at most 0.26 s each, with all strokes inside 3.2 s. A joint pops with a small overshoot when the line first reaches it; rounded corners pop whole. The snap flash fires when it is complete. `R` replays it. A drag completes it at once. Reduced motion skips it. Chosen from nine; the others were removed on purpose.

- Comb: the same hex board continues to every edge, drawn in the ground shader. A slow swell travels outward.
- No walking light on the beams. It was removed on purpose.
- Orbit: drag to leave the `(1, -1, 1)` view. Joints are then placed at their walked 3D positions and arms are cut to half a step, so only the joints that cannot close come apart. Release and it springs back, with a short flash when it closes.
- Space or double-click plays the reveal. One small turn plays by itself after 7 s, as the only hint.
- `D` or `?dusk=1`: dark ground, same beams. `F`: fullscreen.
- Reduced motion: no swell or unprompted turn. Drag still works.
- With `?c=true` all of this is off. No random numbers were added, so seeds give the same pieces.

## Bootloader and seeds

`public/bootloader.js` is the bootloader.art runtime (`boot:web@1.0.0`). It is a standalone script tag. Do not bundle it. `src/bootloader.ts` only reads `window.$bootloader`.

`src/seed.ts` copies that file's seed parsing and sfc32. The contact sheet needs many generators on one page. The bootloader only makes one. Keep the two in sync. A short `?s=` is stripped to hex, sliced to 64 chars, and padded with `0`.

Features published to the bootloader, and listed on the sheet: Footprint, Topology, Symmetry, Density, Palette, Corners, Paradoxes, Loops, Cells.

The sheet (`sheet.html`, `src/sheet/Sheet.tsx`) generates a batch, paints thumbnails through one shared `WebGLRenderer` (`paintHiveStill`), and can filter by trait. One context per hive would exhaust the browser.

## Files

| Path | Role |
| --- | --- |
| `src/hive.ts` | Board, search, tiles, measure, topology names |
| `src/style.ts` | Palettes, corners trait, `pickStyle` |
| `src/features.ts` | Trait record for the bootloader and the sheet |
| `src/solidView.ts` | Camera, screen axes, pixels per world unit |
| `src/solidScene.ts` | Beams, elbows, grit shader, ground, grid, stills |
| `src/HiveThree.tsx` | Canvas, build and orbit timing, pointer light |
| `src/App.tsx` | Boot, generate, publish features, mount the view |
| `src/HiveMark.tsx` | Unused 2D mark |
| `src/sheet/Sheet.tsx` | Contact sheet |
| `src/seed.ts` | Seeded RNG, twin of the bootloader |
| `public/bootloader.js` | Do not bundle |

## Decisions already made

- Ground is flat and clean. No visible grain.
- No neon: no point lights, and no glow painted into corners.
- No bevel. Beam edges are a sharp square. An earlier chamfer on 3-way joints was removed on purpose.
- Only a 2-arm elbow rounds, and only when the hive rolled Round. 3 or more arms were better as the old boxes.
- Straight two-arm joints (opposite ends of one axis) are not corners.
- Do not put fillets on T or cross joints. Those left gaps and pinches.
- Camera winding stays flipped. Compensate in the material, not by reversing the geometry.
