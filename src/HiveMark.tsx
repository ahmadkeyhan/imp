import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { ART_H, ART_W, TILE_H, TILE_W } from './hive.ts';
import type { Tile } from './hive.ts';
import type { Style } from './style.ts';

// Centerline of each beam, in the same projection as the rods. A face outline
// fills in once the mark is only a few dozen pixels across.
const REACH = 6;
const R = TILE_W / 2;
const APOTHEM = TILE_H / 2;
const H = [
  [(R * 0.75) / REACH, (APOTHEM * 0.5) / REACH],
  [0, APOTHEM / REACH],
  [-(R * 0.75) / REACH, (APOTHEM * 0.5) / REACH],
];
const AXIS = [0, 1, 2, 0, 1, 2];
const STEP = [-1, -1, -1, 1, 1, 1];

// Flat-top, same orientation as the tiles. Larger than the old circle, and
// set off the structure along the grid's northeast step.
const MARK_R = 40;
const EDGE = 56;
const BODY = 78;
const GAP = 14;

type Seg = readonly [number, number, number, number];

function hexPoints(cx: number, cy: number, radius: number): string {
  const apothem = radius * Math.sin(Math.PI / 3);
  const corners: Array<[number, number]> = [
    [-radius / 2, -apothem],
    [-radius, 0],
    [-radius / 2, apothem],
    [radius / 2, apothem],
    [radius, 0],
    [radius / 2, -apothem],
  ];
  return corners.map(([x, y]) => `${cx + x},${cy + y}`).join(' ');
}

// Screen northeast matches axial (q + 1, r - 1): right and up.
function placeNortheast(minX: number, minY: number, maxX: number, maxY: number): { cx: number; cy: number } {
  const hx = (minX + maxX) / 2;
  const hy = (minY + maxY) / 2;
  const ux = TILE_W * 0.75;
  const uy = -TILE_H / 2;
  const len = Math.hypot(ux, uy);
  const nx = ux / len;
  const ny = uy / len;
  let reach = 0;
  for (const x of [minX - BODY, maxX + BODY]) {
    for (const y of [minY - BODY, maxY + BODY]) {
      reach = Math.max(reach, (x - hx) * nx + (y - hy) * ny);
    }
  }
  const apothem = MARK_R * Math.sin(Math.PI / 3);
  let cx = hx + nx * (reach + apothem + GAP);
  let cy = hy + ny * (reach + apothem + GAP);
  cx = Math.min(ART_W - EDGE - MARK_R, Math.max(EDGE + MARK_R, cx));
  cy = Math.min(ART_H - EDGE - apothem, Math.max(EDGE + apothem, cy));
  return { cx, cy };
}

function beams(tiles: Tile[]): Seg[] {
  const segs: Seg[] = [];
  for (const tile of tiles) {
    if (tile.name === '000000') continue;
    const cx = tile.x + TILE_W / 2;
    const cy = tile.y + TILE_H / 2;
    for (let side = 0; side < 6; side++) {
      if (tile.name[side] !== '1') continue;
      const axis = AXIS[side];
      const sign = STEP[side];
      segs.push([
        cx,
        cy,
        cx + H[axis][0] * sign * REACH,
        cy + H[axis][1] * sign * REACH,
      ]);
    }
  }
  return segs;
}

function markOf(tiles: Tile[]): { lines: string[]; hex: string; r: number } {
  const segs = beams(tiles);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x1, y1, x2, y2] of segs) {
    minX = Math.min(minX, x1, x2);
    minY = Math.min(minY, y1, y2);
    maxX = Math.max(maxX, x1, x2);
    maxY = Math.max(maxY, y1, y2);
  }
  if (!Number.isFinite(minX)) {
    minX = ART_W / 2;
    maxX = ART_W / 2;
    minY = ART_H / 2;
    maxY = ART_H / 2;
  }
  const { cx: ox, cy: oy } = placeNortheast(minX, minY, maxX, maxY);
  const span = Math.max(1, maxX - minX, maxY - minY);
  const apothem = MARK_R * Math.sin(Math.PI / 3);
  const scale = (apothem * 1.45) / span;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const fit = (x: number, y: number) => `${ox + (x - cx) * scale},${oy + (y - cy) * scale}`;
  return {
    lines: segs.map(([x1, y1, x2, y2]) => `${fit(x1, y1)} ${fit(x2, y2)}`),
    hex: hexPoints(ox, oy, MARK_R),
    r: MARK_R,
  };
}

export function HiveMark({ tiles, art, width, height, style }: {
  tiles: Tile[];
  art: Style;
  width: number;
  height: number;
  style?: CSSProperties;
}) {
  const mark = useMemo(() => markOf(tiles), [tiles]);
  const stroke = art.palette.mark;
  const weight = Math.max(0.9, mark.r / 16);

  return (
    <svg
      viewBox={`0 0 ${ART_W} ${ART_H}`}
      width={width}
      height={height}
      style={{ ...style, pointerEvents: 'none' }}
    >
      <polygon points={mark.hex} fill="none" stroke={stroke} strokeDasharray={4} strokeWidth={weight * 0.5} strokeLinejoin="round" opacity={0.2} />
      {mark.lines.map((points, index) => (
        <polyline key={index} points={points} fill="none" stroke={stroke} strokeWidth={weight} strokeLinejoin="round" strokeLinecap="round" />
      ))}
    </svg>
  );
}
