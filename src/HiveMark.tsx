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

const PREFERRED_R = 28;
const EDGE = 12;
const CLEARANCE = 10;

type Seg = readonly [number, number, number, number];

function place(maxY: number): { cy: number; r: number } {
  const preferred = ART_H - EDGE - PREFERRED_R;
  if (preferred - PREFERRED_R >= maxY + CLEARANCE) return { cy: preferred, r: PREFERRED_R };
  const room = ART_H - EDGE - (maxY + CLEARANCE);
  const r = Math.min(PREFERRED_R, Math.max(8, room / 2));
  return { cy: maxY + CLEARANCE + r, r };
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

function markOf(tiles: Tile[]): { lines: string[]; cy: number; r: number } {
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
  // The painted beam hangs below its centerline, so the circle clears that body.
  const foot = (Number.isFinite(maxY) ? maxY : ART_H / 2) + 24;
  const { cy: oy, r } = place(foot);
  const span = Math.max(1, maxX - minX, maxY - minY);
  const scale = (r * 1.35) / span;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const ox = ART_W / 2;
  const fit = (x: number, y: number) => `${ox + (x - cx) * scale},${oy + (y - cy) * scale}`;
  return {
    lines: segs.map(([x1, y1, x2, y2]) => `${fit(x1, y1)} ${fit(x2, y2)}`),
    cy: oy,
    r,
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
      <circle cx={ART_W / 2} cy={mark.cy} r={mark.r} fill="none" stroke={stroke} strokeWidth={weight * 0.85} />
      {mark.lines.map((points, index) => (
        <polyline key={index} points={points} fill="none" stroke={stroke} strokeWidth={weight} strokeLinejoin="round" strokeLinecap="round" />
      ))}
    </svg>
  );
}
