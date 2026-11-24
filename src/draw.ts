import { TILE_H, TILE_W } from './hive.ts';
import type { Tile } from './hive.ts';

// Square rods on the three hex axes. A joint is a cube at the cell center;
// each crossing leaves that cube and runs to the shared edge. The camera
// sits on the (+x, -y, +z) side, so the lit faces are the top, the right,
// and the left.

const R = TILE_W / 2;
const APOTHEM = TILE_H / 2;
const REACH = 6;

const H = [
  { x: (R * 0.75) / REACH, y: (APOTHEM * 0.5) / REACH },
  { x: 0, y: APOTHEM / REACH },
  { x: -(R * 0.75) / REACH, y: (APOTHEM * 0.5) / REACH },
];

// Side index for (axis, sign). Sign -1 is the first entry.
const SIDE = [
  [0, 3],
  [1, 4],
  [2, 5],
];

const NEIGHBORS = [
  [-1, 0],
  [0, -1],
  [1, -1],
  [1, 0],
  [0, 1],
  [-1, 1],
];

const CAMERA = [1, -1, 1];

const FILL: Record<string, string> = {
  '0+': '#686868',
  '1-': '#9a9a9a',
  '2+': '#484848',
};

export type Mark = {
  pts: string;
  fill: string;
  stroke: string;
  width: number;
  depth: number;
};

type Coord = [number, number, number];

function sideOf(axis: number, sign: number): number {
  return sign < 0 ? SIDE[axis][0] : SIDE[axis][1];
}

function facing(axis: number, sign: number): boolean {
  const normal = [0, 0, 0];
  normal[axis] = sign;
  return normal[0] * CAMERA[0] + normal[1] * CAMERA[1] + normal[2] * CAMERA[2] > 0;
}

function project(cx: number, cy: number, coord: Coord): { x: number; y: number } {
  return {
    x: cx + coord[0] * H[0].x + coord[1] * H[1].x + coord[2] * H[2].x,
    y: cy + coord[0] * H[0].y + coord[1] * H[1].y + coord[2] * H[2].y,
  };
}

function quad(axis: number, fixed: number, uAxis: number, vAxis: number, u0: number, u1: number, v0: number, v1: number): Coord[] {
  const corners: Coord[] = [];
  for (const [u, v] of [
    [u0, v0],
    [u1, v0],
    [u1, v1],
    [u0, v1],
  ] as const) {
    const coord: Coord = [0, 0, 0];
    coord[axis] = fixed;
    coord[uAxis] = u;
    coord[vAxis] = v;
    corners.push(coord);
  }
  return corners;
}

// Vertex walk is clockwise from the top-left corner. Digit order starts at
// the upper-left edge and continues the other way around the top.
const EDGE_DIGIT = [0, 5, 4, 3, 2, 1];

function hexVertices(cx: number, cy: number): Array<[number, number]> {
  return [
    [cx - R / 2, cy - APOTHEM],
    [cx - R, cy],
    [cx - R / 2, cy + APOTHEM],
    [cx + R / 2, cy + APOTHEM],
    [cx + R, cy],
    [cx + R / 2, cy - APOTHEM],
  ];
}

const STROKE = 1.1;
const OUTER_STROKE = '#2c2c2c';
const OUTWARD_STROKE = '#d9d9d9';

function pointKey(point: { x: number; y: number }): string {
  const snap = (value: number) => (Math.round(value * 10) / 10).toFixed(1);
  return `${snap(point.x)},${snap(point.y)}`;
}

function normalOf(key: string): Coord {
  const normal: Coord = [0, 0, 0];
  normal[Number(key[0])] = key[1] === '+' ? 1 : -1;
  return normal;
}

function dot(a: Coord, b: Coord): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function channel(hex: string): number {
  return Number.parseInt(hex.slice(1, 3), 16);
}

type FaceNote = {
  normal: string;
  cell: string;
  at: Coord;
  edge: Coord;
  depth: number;
};

// A valley is the fold where each face lies outside the other face's plane.
function inward(face: FaceNote, other: FaceNote): boolean {
  return dot(normalOf(face.normal), [
    other.at[0] - face.edge[0],
    other.at[1] - face.edge[1],
    other.at[2] - face.edge[2],
  ]) > 0;
}

export function drawHive(tiles: Tile[]): Mark[] {
  const marks: Mark[] = [];
  const byCell = new Map(tiles.map((tile) => [`${tile.q},${tile.r}`, tile]));
  const seams = new Map<string, { pts: string; faces: FaceNote[]; depth: number }>();

  const noteEdge = (
    a: { x: number; y: number },
    b: { x: number; y: number },
    face: FaceNote,
  ) => {
    const ka = pointKey(a);
    const kb = pointKey(b);
    const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    const seam = seams.get(key);
    if (seam) {
      seam.faces.push(face);
      if (face.depth > seam.depth) seam.depth = face.depth;
      return;
    }
    seams.set(key, {
      pts: `${a.x.toFixed(2)},${a.y.toFixed(2)} ${b.x.toFixed(2)},${b.y.toFixed(2)}`,
      faces: [face],
      depth: face.depth,
    });
  };

  for (const tile of tiles) {
    const cx = tile.x + TILE_W / 2;
    const cy = tile.y + TILE_H / 2;
    const vertices = hexVertices(cx, cy);
    for (let edge = 0; edge < 6; edge++) {
      const digit = EDGE_DIGIT[edge];
      if (tile.name[digit] === '1') continue;
      const [dq, dr] = NEIGHBORS[digit];
      const neighbor = byCell.get(`${tile.q + dq},${tile.r + dr}`);
      if (neighbor?.name[(digit + 3) % 6] === '1') continue;
      if (neighbor && (tile.q > neighbor.q || (tile.q === neighbor.q && tile.r > neighbor.r))) continue;
      const [x0, y0] = vertices[edge];
      const [x1, y1] = vertices[(edge + 1) % 6];
      marks.push({
        pts: `${x0.toFixed(2)},${y0.toFixed(2)} ${x1.toFixed(2)},${y1.toFixed(2)}`,
        fill: 'none',
        stroke: '#404040',
        width: 1,
        depth: -1e6 + cy,
      });
    }

    if (tile.name === '000000') continue;
    const open = [...tile.name].map((digit) => digit === '1');
    const push = (corners: Coord[], axis: number, sign: number) => {
      if (!facing(axis, sign)) return;
      // Larger dot with the view direction is closer to the camera.
      // +y runs down the screen and away from the camera, so a south rod
      // stays behind a southeast rod where the two overlap.
      let depth = cy * 1000;
      const points = corners.map((coord) => {
        depth += coord[0] * CAMERA[0] + coord[1] * CAMERA[1] + coord[2] * CAMERA[2];
        return project(cx, cy, coord);
      });
      const pts = points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
      const key = `${axis}${sign < 0 ? '-' : '+'}` as keyof typeof FILL;
      const fill = FILL[key];
      const at: Coord = [0, 0, 0];
      for (const corner of corners) {
        at[0] += corner[0];
        at[1] += corner[1];
        at[2] += corner[2];
      }
      at[0] /= corners.length;
      at[1] /= corners.length;
      at[2] /= corners.length;
      marks.push({
        pts,
        fill,
        stroke: fill,
        width: 0.4,
        depth,
      });
      for (let i = 0; i < corners.length; i++) {
        const next = (i + 1) % corners.length;
        const edge: Coord = [
          (corners[i][0] + corners[next][0]) / 2,
          (corners[i][1] + corners[next][1]) / 2,
          (corners[i][2] + corners[next][2]) / 2,
        ];
        noteEdge(points[i], points[next], {
          normal: key,
          cell: `${tile.q},${tile.r}`,
          at,
          edge,
          depth,
        });
      }
    };

    for (let axis = 0; axis < 3; axis++) {
      for (const sign of [-1, 1]) {
        if (open[sideOf(axis, sign)]) continue;
        const [u, v] = [0, 1, 2].filter((index) => index !== axis);
        push(quad(axis, sign, u, v, -1, 1, -1, 1), axis, sign);
      }
    }

    for (let axis = 0; axis < 3; axis++) {
      for (const sign of [-1, 1]) {
        if (!open[sideOf(axis, sign)]) continue;
        const [p, q] = [0, 1, 2].filter((index) => index !== axis);
        const inner = sign;
        const outer = sign * REACH;
        for (const cross of [p, q]) {
          const other = cross === p ? q : p;
          for (const side of [-1, 1]) {
            push(quad(cross, side, axis, other, inner, outer, -1, 1), cross, side);
          }
        }
      }
    }
  }

  for (const seam of seams.values()) {
    const normals = new Set(seam.faces.map((face) => face.normal));
    if (normals.size === 1 && seam.faces.length > 1) continue;
    let stroke = OUTER_STROKE;
    if (normals.size > 1) {
      let best: [FaceNote, FaceNote] | null = null;
      let bestScore = -Infinity;
      for (let i = 0; i < seam.faces.length; i++) {
        for (let j = i + 1; j < seam.faces.length; j++) {
          const face = seam.faces[i];
          const other = seam.faces[j];
          if (face.normal === other.normal) continue;
          const score = (face.cell === other.cell ? 1e9 : 0) + face.depth + other.depth;
          if (score <= bestScore) continue;
          bestScore = score;
          best = [face, other];
        }
      }
      if (best) {
        const fillA = FILL[best[0].normal];
        const fillB = FILL[best[1].normal];
        const brighter = channel(fillA) >= channel(fillB) ? fillA : fillB;
        stroke = inward(best[0], best[1]) ? brighter : OUTWARD_STROKE;
      }
    }
    marks.push({
      pts: seam.pts,
      fill: 'none',
      stroke,
      width: STROKE,
      depth: seam.depth + 0.5,
    });
  }

  marks.sort((a, b) => a.depth - b.depth);
  return marks;
}
