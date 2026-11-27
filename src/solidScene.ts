import {
  BoxGeometry,
  BackSide,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineDashedMaterial,
  LineSegments,
  Mesh,
  Plane,
  Quaternion,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
  SRGBColorSpace,
} from 'three';
import { ART_H, ART_W, TILE_H, TILE_W, measureHive } from './hive.ts';
import type { Tile } from './hive.ts';
import type { Palette } from './style.ts';
import { DOWN, PX, RIGHT, VIEW, makeSolidCamera, screenToWorld } from './solidView.ts';

// The first joint pops this long after the page is ready.
const START_S = 0.3;
const REACH = 6;
const EXT = REACH + 3;
const BLEED = 0.45;

const NEIGHBORS = [
  [-1, 0],
  [0, -1],
  [1, -1],
  [1, 0],
  [0, 1],
  [-1, 1],
];

const EDGE_DIGIT = [0, 5, 4, 3, 2, 1];

const RODS: Array<{ axis: 0 | 1 | 2; sign: number }> = [
  { axis: 0, sign: -1 },
  { axis: 1, sign: -1 },
  { axis: 2, sign: -1 },
  { axis: 0, sign: 1 },
  { axis: 1, sign: 1 },
  { axis: 2, sign: 1 },
];

function hexCorners(): Array<[number, number]> {
  const radius = TILE_W / 2;
  const apothem = TILE_H / 2;
  return [
    [-radius / 2, -apothem],
    [-radius, 0],
    [-radius / 2, apothem],
    [radius / 2, apothem],
    [radius, 0],
    [radius / 2, -apothem],
  ];
}

// Round corner: inner radius is the outer radius minus the beam width.
const BEAM = 3.4;
const OUTER = BEAM + 0.22;
// The dashed hex board under the beams. 0 hides it.
const GRID = 0;
const INNER = OUTER - BEAM;
const BEND = (OUTER + INNER) / 2;
const BEND_STEPS = 8;

const DIR = RODS.map(({ axis, sign }) => {
  const v = new Vector3();
  v.setComponent(axis, sign);
  return v;
});

type ProfilePoint = { a: number; b: number; na: number; nb: number };
type SweepFrame = { p: Vector3; n: Vector3; b: Vector3 };
type Bucket = { pos: number[]; nrm: number[]; idx: number[] };

// Sharp square. Each corner is two vertices so the edge stays a hard crease.
function beamProfile(): ProfilePoint[] {
  const h = BEAM / 2;
  const sides: Array<[number, number, number, number]> = [
    [h, h, 1, 0],
    [h, -h, 1, 0],
    [h, -h, 0, -1],
    [-h, -h, 0, -1],
    [-h, -h, -1, 0],
    [-h, h, -1, 0],
    [-h, h, 0, 1],
    [h, h, 0, 1],
  ];
  return sides.map(([a, b, na, nb]) => ({ a, b, na, nb }));
}

function axesFor(u: Vector3): { n: Vector3; b: Vector3 } {
  const helper = Math.abs(u.y) > 0.5 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const b = new Vector3().crossVectors(u, helper).normalize();
  const n = new Vector3().crossVectors(b, u).normalize();
  return { n, b };
}

function addVert(bucket: Bucket, p: Vector3, normal: Vector3): number {
  const index = bucket.pos.length / 3;
  bucket.pos.push(p.x, p.y, p.z);
  bucket.nrm.push(normal.x, normal.y, normal.z);
  return index;
}

function triOut(bucket: Bucket, ia: number, ib: number, ic: number, out: Vector3) {
  const ax = bucket.pos[ib * 3] - bucket.pos[ia * 3];
  const ay = bucket.pos[ib * 3 + 1] - bucket.pos[ia * 3 + 1];
  const az = bucket.pos[ib * 3 + 2] - bucket.pos[ia * 3 + 2];
  const bx = bucket.pos[ic * 3] - bucket.pos[ia * 3];
  const by = bucket.pos[ic * 3 + 1] - bucket.pos[ia * 3 + 1];
  const bz = bucket.pos[ic * 3 + 2] - bucket.pos[ia * 3 + 2];
  const nx = ay * bz - az * by;
  const ny = az * bx - ax * bz;
  const nz = ax * by - ay * bx;
  if (nx * out.x + ny * out.y + nz * out.z < 0) bucket.idx.push(ia, ic, ib);
  else bucket.idx.push(ia, ib, ic);
}

function appendSweep(bucket: Bucket, prof: ProfilePoint[], frames: SweepFrame[], cap0: boolean, cap1: boolean) {
  const rings: number[][] = [];
  for (const frame of frames) {
    const ring: number[] = [];
    for (const pt of prof) {
      const p = frame.p.clone().addScaledVector(frame.n, pt.a).addScaledVector(frame.b, pt.b);
      const normal = frame.n.clone().multiplyScalar(pt.na).addScaledVector(frame.b, pt.nb).normalize();
      ring.push(addVert(bucket, p, normal));
    }
    rings.push(ring);
  }
  const count = prof.length;
  for (let i = 0; i < frames.length - 1; i++) {
    for (let j = 0; j < count; j++) {
      const j1 = (j + 1) % count;
      const out = new Vector3().fromArray(bucket.nrm, rings[i][j] * 3);
      triOut(bucket, rings[i][j], rings[i][j1], rings[i + 1][j], out);
      triOut(bucket, rings[i][j1], rings[i + 1][j1], rings[i + 1][j], out);
    }
  }
  const cap = (frame: SweepFrame, ring: number[], sign: number) => {
    const outward = new Vector3().crossVectors(frame.n, frame.b).multiplyScalar(sign).normalize();
    const center = addVert(bucket, frame.p, outward);
    const rim = ring.map((vi) => {
      const p = new Vector3().fromArray(bucket.pos, vi * 3);
      return addVert(bucket, p, outward);
    });
    for (let j = 0; j < count; j++) triOut(bucket, center, rim[j], rim[(j + 1) % count], outward);
  };
  if (cap0) cap(frames[0], rings[0], -1);
  if (cap1) cap(frames[frames.length - 1], rings[rings.length - 1], 1);
}

function appendElbow(bucket: Bucket, prof: ProfilePoint[], u: Vector3, v: Vector3) {
  const binormal = new Vector3().crossVectors(u, v).normalize();
  const center = new Vector3().addScaledVector(u, BEND).addScaledVector(v, BEND);
  const frames: SweepFrame[] = [];
  for (let step = 0; step <= BEND_STEPS; step++) {
    const t = (Math.PI / 2) * (step / BEND_STEPS);
    const radial = u.clone().multiplyScalar(-Math.sin(t)).addScaledVector(v, -Math.cos(t));
    const tangent = v.clone().multiplyScalar(Math.sin(t)).addScaledVector(u, -Math.cos(t));
    frames.push({
      p: center.clone().addScaledVector(radial, BEND),
      n: new Vector3().crossVectors(binormal, tangent).normalize(),
      b: binormal.clone(),
    });
  }
  appendSweep(bucket, prof, frames, false, false);
}

// Two perpendicular arms. Straights and joints of three or more stay a sharp miter.
function elbowArms(open: boolean[]): [number, number] | null {
  const arms: number[] = [];
  for (let i = 0; i < 6; i++) if (open[i]) arms.push(i);
  if (arms.length !== 2 || RODS[arms[0]].axis === RODS[arms[1]].axis) return null;
  return [arms[0], arms[1]];
}

function buildElbow(open: boolean[], end = EXT): BufferGeometry {
  const arms = elbowArms(open);
  if (!arms) throw new Error('elbow');
  const prof = beamProfile();
  const bucket: Bucket = { pos: [], nrm: [], idx: [] };
  for (const i of arms) {
    const u = DIR[i];
    const { n, b } = axesFor(u);
    appendSweep(bucket, prof, [
      { p: u.clone().multiplyScalar(BEND), n, b },
      { p: u.clone().multiplyScalar(end), n, b },
    ], false, true);
  }
  appendElbow(bucket, prof, DIR[arms[0]], DIR[arms[1]]);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(bucket.pos, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(bucket.nrm, 3));
  geo.setIndex(bucket.idx);
  geo.computeBoundingSphere();
  return geo;
}

function placeRod(mesh: Mesh, axis: 0 | 1 | 2, sign: number) {
  const center = (sign * (BEAM / 2 + EXT)) / 2;
  mesh.rotation.set(0, 0, 0);
  mesh.position.set(0, 0, 0);
  if (axis === 0) mesh.position.x = center;
  else if (axis === 1) {
    mesh.rotation.z = Math.PI / 2;
    mesh.position.y = center;
  } else {
    mesh.rotation.y = -Math.PI / 2;
    mesh.position.z = center;
  }
}

function clipPlanes(cx: number, cy: number, corners: Array<[number, number]>): Plane[] {
  return corners.map((corner, edge) => {
    const next = corners[(edge + 1) % 6];
    const mx = (corner[0] + next[0]) / 2;
    const my = (corner[1] + next[1]) / 2;
    const len = Math.hypot(mx, my);
    const point = screenToWorld(cx + mx + (mx / len) * BLEED, cy + my + (my / len) * BLEED);
    const normal = screenToWorld(-mx, -my).normalize();
    return new Plane().setFromNormalAndCoplanarPoint(normal, point);
  });
}

const SOLID_VERT = `
  varying vec3 vNormal;
  varying vec3 vWorld;
  #include <clipping_planes_pars_vertex>
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    #include <clipping_planes_vertex>
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const SOLID_FRAG = `
  varying vec3 vNormal;
  varying vec3 vWorld;
  uniform vec3 uOrigin;
  uniform vec3 uRight;
  uniform vec3 uDown;
  uniform float uSpan;
  uniform vec2 uPointer;
  uniform vec3 uTop;
  uniform vec3 uTopMid;
  uniform vec3 uTopLow;
  uniform vec3 uWarm;
  uniform vec3 uBlush;
  uniform vec3 uCool;
  uniform vec3 uLow;
  uniform vec3 uShade;
  uniform vec3 uBg;
  // Which arms this joint has. Where a face looks along another arm, the two
  // make an inner corner: the tops take a soft shadow.
  uniform float uHasNeg[3];
  uniform float uHasPos[3];
  uniform vec3 uCenter;
  uniform float uSnap;
  uniform float uHalf;
  #include <clipping_planes_pars_fragment>

  const float SEAM = 4.2;

  // Only enough grain to keep the long gradients from banding. No sine in the
  // hash: on some graphics chips that draws faint slanted stripes.
  float grit(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 12.0 * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }

  void main() {
    #include <clipping_planes_fragment>
    vec3 n = normalize(vNormal);
    vec3 rel = vWorld - uOrigin;
    float h = clamp(-dot(rel, uDown) / uSpan, -1.0, 1.0);
    float across = clamp(dot(rel, uRight) / uSpan, -1.0, 1.0);

    float topF = smoothstep(0.25, 0.92, abs(n.y));
    float rightF = smoothstep(0.25, 0.92, abs(n.x));
    float leftF = smoothstep(0.25, 0.92, abs(n.z));
    float face = max(topF + rightF + leftF, 0.001);

    // How far from the joint along this arm: 0 at the joint, 1 half way to the next.
    vec3 offset = vWorld - uCenter;
    vec3 a = abs(offset);
    vec3 an = abs(n);
    int facing = (an.x >= an.y && an.x >= an.z) ? 0 : (an.y >= an.z ? 1 : 2);
    if (facing == 0) a.x = -1.0;
    else if (facing == 1) a.y = -1.0;
    else a.z = -1.0;
    float reach = max(a.x, max(a.y, a.z));
    // Neighboring joints meet on a hexagon edge, which crosses a face at a
    // slant, as near as 4.3 along the arm. Everything that depends on dist must
    // have settled by then, or it stops short on that slanted line.
    float dist = clamp((reach - uHalf) / (SEAM - uHalf), 0.0, 1.0);

    float corner;
    if (facing == 0) corner = n.x < 0.0 ? uHasNeg[0] : uHasPos[0];
    else if (facing == 1) corner = n.y < 0.0 ? uHasNeg[1] : uHasPos[1];
    else corner = n.z < 0.0 ? uHasNeg[2] : uHasPos[2];
    corner *= 1.0 - smoothstep(0.0, 1.0, dist);
    // A cut end faces along an arm too, but sits far out along it: no glow there.
    float out_ = facing == 0 ? abs(offset.x) : (facing == 1 ? abs(offset.y) : abs(offset.z));
    corner *= 1.0 - smoothstep(uHalf + 0.4, uHalf + 1.0, out_);

    float lift = -uPointer.y * 0.35;
    float side = clamp(h + lift, -1.0, 1.0);
    vec3 pale = mix(uBg, uTopMid, 0.35);

    // Tops: one long fall of light, cream above, then peach, then a green cast.
    vec3 top = mix(uTopLow, uTopMid, smoothstep(-0.85, -0.2, h));
    top = mix(top, mix(uTopMid, uTop, 0.6), smoothstep(-0.15, 0.3, h));
    top = mix(top, uTop, smoothstep(0.25, 0.85, h));
    top = mix(top, vec3(1.0), max(lift, 0.0) * 0.5);
    top = mix(top, uShade, corner * 0.45);

    // Faces toward the right: rose at the joint, dissolving toward the ground.
    vec3 warm = mix(uBlush, uWarm, smoothstep(-0.35, 0.7, side));
    warm = mix(warm, pale, smoothstep(-0.1, 1.0, dist) * 0.12);
    warm = mix(warm, pale, smoothstep(0.15, -0.75, side) * smoothstep(0.0, 0.9, across) * 0.42);
    warm = mix(warm, uShade, smoothstep(-0.15, -0.85, across) * 0.75);
    warm = mix(warm, mix(uLow, pale, 0.3), smoothstep(-0.3, -0.85, side) * 0.7);

    // Faces toward the left: the gradient runs the other way, rose into lilac and blue.
    vec3 cool = mix(uWarm, uShade, smoothstep(0.45, -0.45, across));
    cool = mix(mix(pale, uBlush, 0.35), cool, 0.8 + 0.2 * smoothstep(-0.1, 1.0, dist));
    cool = mix(cool, mix(pale, uBlush, 0.35), smoothstep(-0.1, 0.8, across) * 0.36);
    cool = mix(cool, uCool, smoothstep(0.05, -0.75, across) * smoothstep(0.75, -0.15, side));
    cool = mix(cool, mix(uLow, pale, (1.0 - dist) * 0.12), smoothstep(-0.15, -0.7, side));
    cool = mix(cool, uTop, smoothstep(0.5, 1.0, side) * 0.45);

    vec3 color = (top * topF + warm * rightF + cool * leftF) / face;

    vec3 key = normalize(vec3(0.45, -1.35, 0.22) + uRight * uPointer.x * 1.15 + uDown * uPointer.y * 1.15);
    float nd = dot(n, key);
    color = mix(color, mix(color, uShade, 0.5), smoothstep(0.25, -0.25, nd) * min(1.0, length(uPointer)));

    vec2 screen = vec2(dot(vWorld, uRight), dot(vWorld, uDown));
    color += (grit(screen) - 0.5) * 0.012;

    color = mix(color, vec3(1.0), uSnap * 0.45);
    gl_FragColor = vec4(color, 1.0);
  }
`;

const GROUND_VERT = `
  varying vec3 vWorld;
  // The resting camera. The ground ignores the orbit, so it never shows an edge.
  uniform mat4 uRest;
  void main() {
    vWorld = position;
    gl_Position = uRest * vec4(position, 1.0);
  }
`;

const GROUND_FRAG = `
  varying vec3 vWorld;
  uniform vec3 uOrigin;
  uniform vec3 uRight;
  uniform vec3 uDown;
  uniform float uSpan;
  uniform vec2 uPointer;
  uniform vec3 uBg;
  uniform vec3 uTop;
  uniform vec3 uWarm;
  uniform vec3 uCool;
  uniform vec3 uLow;
  uniform vec3 uGrid;
  uniform vec3 uShade;
  uniform float uField;
  uniform float uTime;
  uniform float uPx;
  uniform vec2 uArtCenter;
  uniform vec2 uCursor;
  uniform float uSnap;
  uniform float uNight;

  // The board does not stop at the hive: the same flat-top hexes, to every edge.
  vec3 comb(vec3 color) {
    vec2 art = vec2(dot(vWorld, uRight), dot(vWorld, uDown)) * uPx - uArtCenter;
    float tileH = 160.0 * 0.8660254;
    float fq = art.x / 120.0;
    float fr = art.y / tileH - fq * 0.5;
    vec3 cube = vec3(fq, fr, -fq - fr);
    vec3 round3 = floor(cube + 0.5);
    vec3 diff = abs(round3 - cube);
    if (diff.x > diff.y && diff.x > diff.z) round3.x = -round3.y - round3.z;
    else if (diff.y > diff.z) round3.y = -round3.x - round3.z;
    else round3.z = -round3.x - round3.y;
    vec2 d = art - vec2(round3.x * 120.0, (round3.y + round3.x * 0.5) * tileH);
    float reach = max(abs(d.y), max(abs(d.y * 0.5 + d.x * 0.8660254), abs(d.y * 0.5 - d.x * 0.8660254)));
    float edge = tileH * 0.5 - reach;
    float aa = max(fwidth(art.x), 0.001);
    float line = 1.0 - smoothstep(aa * 0.4, aa * 1.6, edge);

    float ring = max(abs(round3.x), max(abs(round3.y), abs(round3.z)));
    float outside = smoothstep(2.0, 3.0, ring);
    float far = length(art) / 1000.0;
    float fade = 1.0 - smoothstep(0.25, 1.05, far);
    float front = mod(uTime * 0.6, 22.0);
    float swell = exp(-pow(ring - front, 2.0) * 1.6) * outside;
    float near = exp(-dot(art - uCursor, art - uCursor) / (150.0 * 150.0));

    color = mix(color, color * mix(vec3(1.0), uShade, 0.55), smoothstep(0.3, 1.35, far) * mix(0.1, 0.55, uNight));
    color = mix(color, uTop, exp(-dot(art, art) / (330.0 * 330.0)) * mix(0.0, 0.34, uNight));
    color = mix(color, vec3(1.0), swell * fade * (0.13 + uSnap * 0.2));
    vec3 ink = mix(uGrid * 0.86, uTop, uNight);
    color = mix(color, ink, line * outside * (fade * mix(0.1, 0.14, uNight) + swell * 0.45));
    color = mix(color, vec3(1.0), line * near * 0.75);
    return color;
  }

  void main() {
    vec3 rel = vWorld - uOrigin;
    float height = clamp(-dot(rel, uDown) / uSpan, -1.0, 1.0);
    float across = clamp(dot(rel, uRight) / uSpan, -1.0, 1.0);
    float h = clamp(height + uPointer.y * 0.7, -1.0, 1.0);
    // A flat field, as in the reference. Only the pointer adds a little air.
    vec3 color = uBg;
    float glow = uPointer.x * across;
    color = mix(color, vec3(1.0), clamp(glow, 0.0, 1.0) * 0.05);
    if (uNight > 0.0) {
      // Dusk: only the ground goes dark. The beams keep their colors and glow against it.
      float halo = exp(-dot(rel, rel) / (uSpan * uSpan * 0.45));
      vec3 dusk = mix(vec3(0.075, 0.066, 0.13), vec3(0.19, 0.15, 0.25), halo);
      color = mix(color, dusk + (color - uBg) * 0.12, uNight);
    }
    if (uField > 0.0) {
      vec3 lit = comb(color);
      // The same comb, with its light and shade turned down after dusk.
      color = mix(color, lit, uField * mix(1.0, 0.3, uNight));
    }
    gl_FragColor = vec4(color, 1.0);
  }
`;

function srgb(hex: string): Vector3 {
  const tone = Number.parseInt(hex.slice(1), 16);
  return new Vector3(((tone >> 16) & 255) / 255, ((tone >> 8) & 255) / 255, (tone & 255) / 255);
}

function walkJoints(tiles: Tile[], order: number[]) {
  const index = new Map(tiles.map((tile, i) => [`${tile.q},${tile.r}`, i]));
  const neighbor = (i: number, side: number): number => {
    if (tiles[i].name[side] !== '1') return -1;
    const [dq, dr] = NEIGHBORS[side];
    return index.get(`${tiles[i].q + dq},${tiles[i].r + dr}`) ?? -1;
  };
  const flat = tiles.map((tile) => screenToWorld(tile.x + TILE_W / 2, tile.y + TILE_H / 2));
  const real: Array<Vector3 | null> = tiles.map(() => null);
  const depth = tiles.map(() => 0);
  const start = order.indexOf(0);
  const queue = start < 0 ? [] : [start];
  if (start >= 0) real[start] = flat[start].clone();
  while (queue.length) {
    const i = queue.shift() as number;
    for (let side = 0; side < 6; side++) {
      const j = neighbor(i, side);
      if (j < 0 || real[j]) continue;
      real[j] = (real[i] as Vector3).clone().addScaledVector(DIR[side], REACH * 2);
      depth[j] = depth[i] + 1;
      queue.push(j);
    }
  }
  const along = tiles.map((_, i) => (real[i] ? (real[i] as Vector3).clone().sub(flat[i]).dot(VIEW) : 0));
  const used = along.filter((_, i) => real[i]);
  const mean = used.reduce((sum, v) => sum + v, 0) / Math.max(1, used.length);
  return {
    depth,
    neighbor,
    lift: tiles.map((_, i) => VIEW.clone().multiplyScalar(real[i] ? along[i] - mean : 0)),
  };
}

export type SolidHive = {
  scene: Scene;
  camera: ReturnType<typeof makeSolidCamera>;
  pointer: Vector2;
  groups: Array<{ group: Group }>;
  bases: Vector3[];
  dispose: () => void;
  /** Draw the build as it stands this many seconds in. At buildTime or later
   *  the piece is whole. Never called for stills. */
  assemble: (seconds: number) => void;
  buildTime: number;
  /** Turn the camera off the one view where the frame closes. 0, 0 is that view. */
  orbit: (yaw: number, pitch: number) => number;
  /** Move the comb and the snap flash. Never called for stills. */
  tick: (live: { time: number; field: number; snap: number; night: number; cursor: Vector2 }) => void;
};

export function buildHive(tiles: Tile[], palette: Palette, viewW = ART_W, viewH = ART_H, round = false): SolidHive {
  const scene = new Scene();
  const camera = makeSolidCamera(viewW, viewH);
  const pointer = new Vector2();
  const origin = screenToWorld(ART_W / 2, ART_H / 2);
  const corners = hexCorners();
  const jointGeo = new BoxGeometry(BEAM, BEAM, BEAM);
  const rodGeo = new BoxGeometry(EXT - BEAM / 2, BEAM, BEAM);
  const elbows = new Map<string, BufferGeometry>();
  const materials: ShaderMaterial[] = [];
  const groups: Array<{ group: Group }> = [];
  const cuts: ShaderMaterial[] = [];
  const measure = measureHive(tiles);

  // Where each joint really is. Walking the beams from the first joint, every
  // step is 12 units along one world axis. The flat position differs from this
  // only along VIEW, until a loop closes: that last beam cannot meet.
  const walk = walkJoints(tiles, measure.order);
  const parts: Array<{ group: Group; lift: Vector3; rods: Array<{ mesh: Mesh; axis: 0 | 1 | 2; sign: number; side: number }>; elbow: Mesh | null; hub: Mesh | null; index: number; mask: string }> = [];
  const shortElbows = new Map<string, BufferGeometry>();
  const shared = {
    uSnap: { value: 0 },
  };

  for (let index = 0; index < tiles.length; index++) {
    const tile = tiles[index];
    if (tile.name === '000000') continue;
    const cx = tile.x + TILE_W / 2;
    const cy = tile.y + TILE_H / 2;
    const material = new ShaderMaterial({
      uniforms: {
        uOrigin: { value: origin },
        uRight: { value: RIGHT },
        uDown: { value: DOWN },
        uSpan: { value: 20 },
        uHalf: { value: BEAM / 2 },
        uTopMid: { value: srgb(palette.topMid) },
        uTopLow: { value: srgb(palette.topLow) },
        uBlush: { value: srgb(palette.blush) },
        uHasNeg: { value: [0, 1, 2].map((side) => (tile.name[side] === '1' ? 1 : 0)) },
        uHasPos: { value: [3, 4, 5].map((side) => (tile.name[side] === '1' ? 1 : 0)) },
        uPointer: { value: pointer },
        uTop: { value: srgb(palette.top) },
        uWarm: { value: srgb(palette.right) },
        uCool: { value: srgb(palette.left) },
        uLow: { value: srgb(palette.low) },
        uShade: { value: srgb(palette.shade) },
        uBg: { value: srgb(palette.background) },
        uCenter: { value: new Vector3() },
        ...shared,
      },
      vertexShader: SOLID_VERT,
      fragmentShader: SOLID_FRAG,
      clipping: true,
      clippingPlanes: clipPlanes(cx, cy, corners),
      // The camera's flipped frustum reverses winding. BackSide keeps the
      // outward faces, the ones the orthographic view actually sees.
      side: BackSide,
    });
    materials.push(material);
    const planes = material.clippingPlanes as Plane[];
    // Same uniforms, its own clipping.
    const cutAt = (sides: number[]): ShaderMaterial => {
      const cut = new ShaderMaterial({
        uniforms: material.uniforms,
        vertexShader: SOLID_VERT,
        fragmentShader: SOLID_FRAG,
        clipping: true,
        clippingPlanes: sides.map((side) => planes[EDGE_DIGIT.indexOf(side)]),
        side: BackSide,
      });
      cuts.push(cut);
      return cut;
    };
    const group = new Group();
    group.position.copy(screenToWorld(cx, cy));
    material.uniforms.uCenter.value = group.position;
    const open = [...tile.name].map((digit) => digit === '1');
    const part: (typeof parts)[number] = { group, lift: new Vector3(), rods: [], elbow: null, hub: null, index, mask: '' };
    if (round && elbowArms(open)) {
      const mask = open.map((bit) => (bit ? '1' : '0')).join('');
      let elbow = elbows.get(mask);
      if (!elbow) {
        elbow = buildElbow(open);
        elbows.set(mask, elbow);
      }
      part.elbow = new Mesh(elbow, cutAt(elbowArms(open) as [number, number]));
      part.mask = mask;
      group.add(part.elbow);
    } else {
      part.hub = new Mesh(jointGeo, cutAt([]));
      group.add(part.hub);
      for (let side = 0; side < 6; side++) {
        if (!open[side]) continue;
        const rod = new Mesh(rodGeo, cutAt([side]));
        placeRod(rod, RODS[side].axis, RODS[side].sign);
        group.add(rod);
        part.rods.push({ mesh: rod, axis: RODS[side].axis, sign: RODS[side].sign, side });
      }
    }
    part.lift.copy(walk.lift[index]);
    parts.push(part);
    scene.add(group);
    groups.push({ group });
  }

  const byCell = new Map(tiles.map((tile) => [`${tile.q},${tile.r}`, tile]));
  const gridPts: number[] = [];
  for (const tile of tiles) {
    const cx = tile.x + TILE_W / 2;
    const cy = tile.y + TILE_H / 2;
    for (let edge = 0; edge < 6; edge++) {
      const digit = EDGE_DIGIT[edge];
      const [dq, dr] = NEIGHBORS[digit];
      const neighbor = byCell.get(`${tile.q + dq},${tile.r + dr}`);
      if (neighbor && (tile.q > neighbor.q || (tile.q === neighbor.q && tile.r > neighbor.r))) continue;
      const [x0, y0] = corners[edge];
      const [x1, y1] = corners[(edge + 1) % 6];
      // Behind every beam. A shallow offset leaves the dashes on the receding faces.
      const p0 = screenToWorld(cx + x0, cy + y0).addScaledVector(VIEW, -7);
      const p1 = screenToWorld(cx + x1, cy + y1).addScaledVector(VIEW, -7);
      gridPts.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
    }
  }
  const gridGeo = new BufferGeometry();
  gridGeo.setAttribute('position', new Float32BufferAttribute(gridPts, 3));
  const gridMat = new LineDashedMaterial({
    color: new Color(palette.grid),
    transparent: true,
    opacity: GRID,
    dashSize: 7 / PX,
    gapSize: 6 / PX,
  });
  const grid = new LineSegments(gridGeo, gridMat);
  grid.computeLineDistances();
  // Hidden outright: even transparent dashes would still write depth.
  grid.visible = GRID > 0;
  scene.add(grid);

  const camRight = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const camDown = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const camBack = new Vector3().setFromMatrixColumn(camera.matrixWorld, 2);
  const groundCenter = camera.position.clone().addScaledVector(camBack, -40);
  const halfW = (viewW / PX) * 0.51;
  const halfH = (viewH / PX) * 0.51;
  const groundPts: number[] = [];
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const point = groundCenter.clone().addScaledVector(camRight, sx * halfW).addScaledVector(camDown, sy * halfH);
    groundPts.push(point.x, point.y, point.z);
  }
  const groundGeo = new BufferGeometry();
  groundGeo.setAttribute('position', new Float32BufferAttribute(groundPts, 3));
  groundGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const groundMat = new ShaderMaterial({
    uniforms: {
      uOrigin: { value: origin },
      uRight: { value: RIGHT },
      uDown: { value: DOWN },
      uSpan: { value: viewH / PX / 2 },
      uPointer: { value: pointer },
      uBg: { value: srgb(palette.background) },
      uTop: { value: srgb(palette.top) },
      uWarm: { value: srgb(palette.right) },
      uCool: { value: srgb(palette.left) },
      uLow: { value: srgb(palette.low) },
      uRest: { value: camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse) },
      uGrid: { value: srgb(palette.grid) },
      uShade: { value: srgb(palette.shade) },
      uField: { value: 0 },
      uTime: { value: 0 },
      uPx: { value: PX },
      uArtCenter: { value: new Vector2(ART_W / 2, ART_H / 2) },
      uCursor: { value: new Vector2(1e5, 1e5) },
      uSnap: shared.uSnap,
      uNight: { value: 0 },
    },
    vertexShader: GROUND_VERT,
    fragmentShader: GROUND_FRAG,
    side: DoubleSide,
    depthWrite: false,
  });
  const ground = new Mesh(groundGeo, groundMat);
  ground.frustumCulled = false;
  ground.renderOrder = -1;
  scene.add(ground);

  // The orbit turns about the middle of the real object and backs off to fit it.
  const rest = { position: camera.position.clone(), up: camera.up.clone() };
  const flat = groups.map((entry) => entry.group.position.clone());
  const bases = flat.map((p) => p.clone());
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = min.clone().negate();
  parts.forEach((part, i) => {
    const p = flat[i].clone().add(part.lift);
    min.min(p);
    max.max(p);
  });
  const middle = parts.length ? min.clone().add(max).multiplyScalar(0.5) : origin.clone();
  const span = Math.max(8, ...parts.map((part, i) => flat[i].clone().add(part.lift).distanceTo(middle) + EXT));
  const fit = Math.min(1, (Math.min(viewW, viewH) / PX / 2 / span) * 0.96);
  let wasOpen = false;
  camera.far = 400;

  // The reveal: the piece is sketched one beam at a time, as if by one hand. The
  // walk goes depth first, so the line runs on as far as it can before it goes
  // back to start the next branch. Every beam is drawn once.
  const partAt = new Map(parts.map((part) => [part.index, part]));
  const joined = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const links = new Map<number, number[]>(parts.map((part) => [part.index, []]));
  for (const part of parts) {
    for (let side = 0; side < 6; side++) {
      const other = walk.neighbor(part.index, side);
      if (!partAt.has(other)) continue;
      for (const [from, to] of [[part.index, other], [other, part.index]]) {
        if (!links.get(from)!.includes(to)) links.get(from)!.push(to);
      }
    }
  }
  /** Each beam, by its two joints: its turn, and the joint the line leaves from. */
  const strokes = new Map<string, { turn: number; from: number }>();
  const reached = new Set<number>();
  /** The stroke that first brings the line to each joint, 0 for where it starts. */
  const landing = new Map<number, number>();
  const sketch = (from: number) => {
    reached.add(from);
    for (const to of links.get(from)!) {
      if (strokes.has(joined(from, to))) continue;
      const turn = strokes.size;
      strokes.set(joined(from, to), { turn, from });
      if (!landing.has(to)) landing.set(to, turn + 1);
      if (!reached.has(to)) sketch(to);
    }
  };
  for (const part of [...parts].sort((a, b) => measure.order[a.index] - measure.order[b.index])) {
    if (reached.has(part.index)) continue;
    if (!landing.has(part.index)) landing.set(part.index, 0);
    sketch(part.index);
  }

  const STROKE_S = Math.min(0.26, 3.2 / Math.max(1, strokes.size));
  // The last term lets the last joint finish its bounce, or it stays swollen.
  const buildTime = START_S + strokes.size * STROKE_S + 0.45;
  const HUB = BEAM / 2;
  // Past this, the whole arm is outside its cell and already clipped away.
  const GROWN = 7.9;
  const span01 = (t: number, from: number, length: number) => Math.min(1, Math.max(0, (t - from) / length));
  // From small, past full size, and back.
  const pop = (u: number) => 1 + 3.2 * (u - 1) ** 3 + 2.2 * (u - 1) ** 2;
  const setRod = (rod: { mesh: Mesh; axis: 0 | 1 | 2; sign: number }, from: number, to: number) => {
    rod.mesh.visible = to - from > 0.02;
    rod.mesh.scale.x = Math.max(0.001, (to - from) / (EXT - HUB));
    rod.mesh.position.setComponent(rod.axis, (rod.sign * (from + to)) / 2);
  };

  const assemble = (seconds: number) => {
    const done = seconds >= buildTime;
    for (const part of parts) {
      const here = START_S + (landing.get(part.index) ?? 0) * STROKE_S;
      // A rounded corner is one piece, so it starts earlier and pops whole.
      const block = part.elbow ?? part.hub;
      if (block) {
        const u = done ? 1 : span01(seconds, part.elbow ? here - STROKE_S * 0.5 : here - 0.02, 0.4);
        block.visible = u > 0;
        block.scale.setScalar(u >= 1 ? 1 : Math.max(0.001, 0.35 + 0.65 * pop(u)));
      }
      for (const rod of part.rods) {
        const stroke = strokes.get(joined(part.index, walk.neighbor(part.index, rod.side)));
        // An arm either leads the line out from its joint, or carries it in from
        // the edge of the cell. An arm that leads nowhere just grows.
        const leaving = !stroke || stroke.from === part.index;
        const start = stroke ? START_S + (stroke.turn + (leaving ? 0 : 0.5)) * STROKE_S : here;
        const p = done ? 1 : span01(seconds, start, STROKE_S / 2);
        if (p >= 1) setRod(rod, HUB, EXT);
        else if (leaving) setRod(rod, HUB, HUB + (GROWN - HUB) * p);
        else if (p > 0) setRod(rod, GROWN + (HUB - GROWN) * p, GROWN + 1.1);
        else setRod(rod, GROWN, GROWN);
      }
    }
  };

  const orbit = (yaw: number, pitch: number): number => {
    const angle = Math.hypot(yaw, pitch);
    const t = Math.min(1, angle / 0.22);
    const amount = t * t * (3 - 2 * t);
    const open = angle > 1e-4;
    // On the resting view the beams are clipped to their cells, as before. Off
    // it, each arm is cut to half a step so the true gaps can be seen.
    if (open !== wasOpen) {
      wasOpen = open;
      const end = open ? REACH + 0.02 : EXT;
      for (const part of parts) {
        for (const rod of part.rods) {
          rod.mesh.scale.x = (end - BEAM / 2) / (EXT - BEAM / 2);
          const center = (rod.sign * (BEAM / 2 + end)) / 2;
          rod.mesh.position.setComponent(rod.axis, center);
        }
        if (part.elbow) {
          const cache = open ? shortElbows : elbows;
          let geo = cache.get(part.mask);
          if (!geo) {
            geo = buildElbow([...part.mask].map((d) => d === '1'), end);
            cache.set(part.mask, geo);
          }
          part.elbow.geometry = geo;
        }
      }
    }
    parts.forEach((part, i) => {
      // Sliding along VIEW is invisible from the resting camera, so the whole
      // real depth goes in at once. A partial depth would split every joint;
      // the full one splits only the joints that truly cannot meet.
      bases[i].copy(flat[i]).addScaledVector(part.lift, open ? 1 : 0);
    });
    const turnBy = new Quaternion()
      .setFromAxisAngle(DOWN, yaw)
      .multiply(new Quaternion().setFromAxisAngle(RIGHT, pitch));
    const pivot = origin.clone().lerp(middle, amount);
    const offset = rest.position.clone().sub(origin).setLength(80 + 100 * amount).applyQuaternion(turnBy);
    camera.position.copy(pivot).add(offset);
    camera.up.copy(rest.up).applyQuaternion(turnBy);
    camera.lookAt(pivot);
    camera.zoom = 1 + (fit - 1) * amount;
    camera.updateProjectionMatrix();
    gridMat.opacity = GRID * (1 - amount);
    return amount;
  };

  const tick: SolidHive['tick'] = (live) => {
    shared.uSnap.value = live.snap;
    groundMat.uniforms.uNight.value = live.night;
    groundMat.uniforms.uField.value = live.field;
    groundMat.uniforms.uTime.value = live.time;
    groundMat.uniforms.uCursor.value.copy(live.cursor);
  };

  return {
    orbit,
    tick,
    assemble,
    buildTime,
    scene,
    camera,
    pointer,
    groups,
    bases,
    dispose: () => {
      jointGeo.dispose();
      rodGeo.dispose();
      for (const elbow of elbows.values()) elbow.dispose();
      for (const elbow of shortElbows.values()) elbow.dispose();
      gridGeo.dispose();
      gridMat.dispose();
      groundGeo.dispose();
      groundMat.dispose();
      for (const material of [...materials, ...cuts]) material.dispose();
    },
  };
}

// One context for the whole contact sheet. A card per hive would exhaust the
// browser's WebGL context limit.
let shared: WebGLRenderer | null = null;
const queue: Array<() => void> = [];
let pumping = false;

function pump() {
  const job = queue.shift();
  if (!job) {
    pumping = false;
    return;
  }
  pumping = true;
  job();
  requestAnimationFrame(pump);
}

export function paintHiveStill(
  tiles: Tile[],
  palette: Palette,
  target: HTMLCanvasElement,
  width: number,
  height: number,
  token: { ok: boolean },
  round = false,
) {
  queue.push(() => {
    if (!token.ok) return;
    shared ??= new WebGLRenderer({ antialias: true, alpha: true });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    shared.setPixelRatio(dpr);
    shared.setSize(width, height, false);
    shared.setClearColor(0x000000, 0);
    shared.outputColorSpace = SRGBColorSpace;
    shared.localClippingEnabled = true;
    const hive = buildHive(tiles, palette, ART_W, ART_H, round);
    shared.render(hive.scene, hive.camera);
    if (token.ok) {
      target.width = Math.round(width * dpr);
      target.height = Math.round(height * dpr);
      target.getContext('2d')?.drawImage(shared.domElement, 0, 0);
    }
    hive.dispose();
  });
  if (!pumping) pump();
}
