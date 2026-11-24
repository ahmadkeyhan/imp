// Flat-top hex hive. Digit 0 is the upper-left edge, then clockwise:
// NW, N, NE, SE, S, SW. A shared edge meets the opposite digit (0-3, 1-4, 2-5).

export const ART_W = 640;
export const ART_H = 800*Math.sin(Math.PI/3);
export const TILE_W = 160;
export const TILE_H = 160*Math.sin(Math.PI/3);

const HEX_W = 160;
const HEX_H = 160*Math.sin(Math.PI/3);
const HEX_CX = 80;
const HEX_CY = 80*Math.sin(Math.PI/3);

// Screen step from (q, r) to a neighbor. Index is the side digit.
const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [0, -1],
  [1, -1],
  [1, 0],
  [0, 1],
  [-1, 1],
];

export type Tile = {
  q: number;
  r: number;
  /** Combined side mask, six digits. */
  name: string;
  /**
   * SVGs stacked in this cell. A mask with 4, 5, or 6 crossings is split into
   * pieces that each have at least two crossings and OR back to `name`.
   */
  layers: string[];
  x: number;
  y: number;
};

type Cell = {
  q: number;
  r: number;
  outer: number;
  neighbors: number[];
};

function maskName(mask: number): string {
  return mask.toString(2).padStart(6, '0');
}

// A 4, 5, or 6 mask may stay one SVG, or be drawn as a stack. Each piece has
// at least two crossings, the pieces share no side, and they OR back to `name`.
// 100000 + 001101 is not a stack: the first piece has a single crossing.
export function stackLayers(name: string, rnd: () => number): string[] {
  const sides: number[] = [];
  for (let side = 0; side < name.length; side++) {
    if (name[side] === '1') sides.push(side);
  }
  if (sides.length < 4 || rnd() < 0.5) return [name];

  const groups: number[][] = [];
  const start = sides.length % 2 === 1 ? 3 : 2;
  groups.push(sides.slice(0, start));
  for (let i = start; i < sides.length; i += 2) groups.push(sides.slice(i, i + 2));

  return groups.map((group) => {
    const digits = Array.from({ length: 6 }, () => '0');
    for (const side of group) digits[side] = '1';
    return digits.join('');
  });
}

function bit(mask: number, side: number): number {
  return (mask >> (5 - side)) & 1;
}

function buildCells(): Cell[] {
  const coords: { q: number; r: number }[] = [];
  for (let q = -2; q <= 2; q++) {
    for (let r = -2; r <= 2; r++) {
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= 2) coords.push({ q, r });
    }
  }

  const index = new Map(coords.map((cell, i) => [`${cell.q},${cell.r}`, i]));
  return coords.map((cell) => {
    let outer = 0;
    const neighbors = NEIGHBORS.map(([dq, dr], side) => {
      const next = index.get(`${cell.q + dq},${cell.r + dr}`);
      if (next === undefined) {
        outer |= 1 << (5 - side);
        return -1;
      }
      return next;
    });
    return { q: cell.q, r: cell.r, outer, neighbors };
  });
}

function shuffle(items: number[], rnd: () => number) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const swap = items[i];
    items[i] = items[j];
    items[j] = swap;
  }
}

function slot(q: number, r: number): { x: number; y: number } {
  const cx = ART_W / 2 + q * HEX_W * 0.75;
  const cy = ART_H / 2 + (r + q / 2) * HEX_H;
  return { x: cx - HEX_CX, y: cy - HEX_CY };
}

// Randomized backtracking. Tighter outer constraints go first. A mask is
// kept only when every already-assigned neighbor agrees on the shared edge.
// The all-zero hive matches the rules and is rejected.
export function generateHive(rnd: () => number): Tile[] {
  const cells = buildCells();
  const order = cells
    .map((_, index) => index)
    .sort((a, b) => {
      const span = (outer: number) => 1 << (6 - countBits(outer));
      return span(cells[a].outer) - span(cells[b].outer) || a - b;
    });
  const assigned = new Array<number>(cells.length).fill(-1);

  const legal = (index: number): number[] => {
    const cell = cells[index];
    const options: number[] = [];
    for (let mask = 0; mask < 64; mask++) {
      if (mask & cell.outer) continue;
      let fits = true;
      for (let side = 0; side < 6; side++) {
        const neighbor = cell.neighbors[side];
        if (neighbor < 0 || assigned[neighbor] < 0) continue;
        const opposite = (side + 3) % 6;
        if (bit(mask, side) !== bit(assigned[neighbor], opposite)) {
          fits = false;
          break;
        }
      }
      if (fits) options.push(mask);
    }
    return options;
  };

  const search = (step: number): boolean => {
    if (step === order.length) return assigned.some((mask) => mask !== 0);
    const index = order[step];
    const options = legal(index);
    shuffle(options, rnd);
    for (const mask of options) {
      assigned[index] = mask;
      if (search(step + 1)) return true;
      assigned[index] = -1;
    }
    return false;
  };

  if (!search(0)) throw new Error('hive: no structure matched the edge rules');

  return cells.map((cell, index) => {
    const name = maskName(assigned[index]);
    return {
      q: cell.q,
      r: cell.r,
      name,
      layers: stackLayers(name, rnd),
      ...slot(cell.q, cell.r),
    };
  });
}

function countBits(value: number): number {
  let count = 0;
  while (value) {
    count += value & 1;
    value >>= 1;
  }
  return count;
}
