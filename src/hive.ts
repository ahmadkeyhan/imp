// Flat-top hex hive. Digit 0 is the upper-left edge, then clockwise:
// NW, N, NE, SE, S, SW. A shared edge meets the opposite digit (0-3, 1-4, 2-5).

export const ART_W = 640.381;
export const ART_H = 693.149;
export const TILE_W = 160.381;
export const TILE_H = 138.896;

const HEX_W = 160;
const HEX_H = 138.564;
const HEX_CX = 80.19;
const HEX_CY = 69.447;

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
  name: string;
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

  return cells.map((cell, index) => ({
    q: cell.q,
    r: cell.r,
    name: maskName(assigned[index]),
    ...slot(cell.q, cell.r),
  }));
}

function countBits(value: number): number {
  let count = 0;
  while (value) {
    count += value & 1;
    value >>= 1;
  }
  return count;
}
