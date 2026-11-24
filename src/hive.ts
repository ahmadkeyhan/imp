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

// Chance the hive is an impossible object. 0 keeps every structure buildable
// in 3D. 1 keeps only structures whose beams fail to close.
export const IMPOSSIBLE = 1;

// Sides 0 and 3 step x, sides 1 and 4 step y, sides 2 and 5 step z.
// Opposite sides step opposite ways. A loop that does not return to the same
// point cannot be built.
const AXIS = [0, 1, 2, 0, 1, 2];
const STEP = [-1, -1, -1, 1, 1, 1];

// The board is two rings. Beams stay inside the center and the first ring.
const HIVE_R = 2;
const STRUCTURE_R = 2;

function radius(q: number, r: number): number {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
}

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
  for (let q = -HIVE_R; q <= HIVE_R; q++) {
    for (let r = -HIVE_R; r <= HIVE_R; r++) {
      if (radius(q, r) <= HIVE_R) coords.push({ q, r });
    }
  }

  const index = new Map(coords.map((cell, i) => [`${cell.q},${cell.r}`, i]));
  return coords.map((cell) => {
    let outer = 0;
    const inside = radius(cell.q, cell.r) <= STRUCTURE_R;
    const neighbors = NEIGHBORS.map(([dq, dr], side) => {
      const nq = cell.q + dq;
      const nr = cell.r + dr;
      const next = index.get(`${nq},${nr}`);
      if (!inside || next === undefined || radius(nq, nr) > STRUCTURE_R) {
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

// A finished assignment has split into more than one road network when a
// closed piece sits beside another piece. A piece is closed once none of its
// crossings still faces an empty cell.
function piecesSplit(cells: Cell[], assigned: number[]): boolean {
  const seen = new Uint8Array(cells.length);
  let pieces = 0;
  let closed = 0;
  for (let i = 0; i < cells.length; i++) {
    if (assigned[i] <= 0 || seen[i]) continue;
    pieces++;
    const stack = [i];
    seen[i] = 1;
    let open = false;
    while (stack.length) {
      const index = stack.pop() as number;
      const cell = cells[index];
      for (let side = 0; side < 6; side++) {
        if (!bit(assigned[index], side)) continue;
        const neighbor = cell.neighbors[side];
        if (neighbor < 0) continue;
        if (assigned[neighbor] < 0) {
          open = true;
          continue;
        }
        if (assigned[neighbor] > 0 && !seen[neighbor]) {
          seen[neighbor] = 1;
          stack.push(neighbor);
        }
      }
    }
    if (!open) closed++;
    if (closed > 0 && pieces > 1) return true;
  }
  return false;
}

function isPossible(cells: Cell[], assigned: number[]): boolean {
  const placed: Array<[number, number, number] | null> = cells.map(() => null);
  for (let start = 0; start < cells.length; start++) {
    if (assigned[start] <= 0 || placed[start]) continue;
    placed[start] = [0, 0, 0];
    const stack = [start];
    while (stack.length) {
      const index = stack.pop() as number;
      const here = placed[index] as [number, number, number];
      const cell = cells[index];
      for (let side = 0; side < 6; side++) {
        if (!bit(assigned[index], side)) continue;
        const neighbor = cell.neighbors[side];
        if (neighbor < 0 || assigned[neighbor] <= 0) continue;
        const next: [number, number, number] = [here[0], here[1], here[2]];
        next[AXIS[side]] += STEP[side];
        const got = placed[neighbor];
        if (!got) {
          placed[neighbor] = next;
          stack.push(neighbor);
          continue;
        }
        if (got[0] !== next[0] || got[1] !== next[1] || got[2] !== next[2]) return false;
      }
    }
  }
  return true;
}

// Randomized backtracking. Tighter outer constraints go first. A mask is
// kept only when every already-assigned neighbor agrees on the shared edge.
// Roads stay one piece. A single-crossing tile may appear at most twice.
// The all-zero hive is rejected. IMPOSSIBLE picks a buildable frame or a
// contradictory one before the search starts.
export function generateHive(rnd: () => number): Tile[] {
  const cells = buildCells();
  const assigned = new Array<number>(cells.length).fill(-1);
  for (let index = 0; index < cells.length; index++) {
    if (radius(cells[index].q, cells[index].r) > STRUCTURE_R) assigned[index] = 0;
  }
  const order = cells
    .map((_, index) => index)
    .filter((index) => assigned[index] < 0)
    .sort((a, b) => {
      const span = (outer: number) => 1 << (6 - countBits(outer));
      return span(cells[a].outer) - span(cells[b].outer) || a - b;
    });
  let stubs = 0;
  const wantImpossible = rnd() < IMPOSSIBLE;

  const legal = (index: number): number[] => {
    const cell = cells[index];
    const options: number[] = [];
    for (let mask = 0; mask < 64; mask++) {
      if (mask & cell.outer) continue;
      if (countBits(mask) === 1) continue;
      // if (countBits(mask) === 1 && (stubs >= 2 || rnd() < 0.8)) continue;
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
    if (!wantImpossible && !isPossible(cells, assigned)) return false;
    if (step === order.length) {
      const formed = assigned.some((mask) => mask !== 0) && !piecesSplit(cells, assigned);
      return formed && isPossible(cells, assigned) !== wantImpossible;
    }
    const index = order[step];
    const options = legal(index);
    shuffle(options, rnd);
    for (const mask of options) {
      const stub = countBits(mask) === 1;
      assigned[index] = mask;
      if (stub) stubs++;
      if (!piecesSplit(cells, assigned) && search(step + 1)) return true;
      if (stub) stubs--;
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
