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

const STEP_MS = 110;
const REACH = 6;
const EXT = REACH + 1.5;
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
const BEAM = 2;
const OUTER = 2.22;
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

function buildElbow(open: boolean[]): BufferGeometry {
  const arms = elbowArms(open);
  if (!arms) throw new Error('elbow');
  const prof = beamProfile();
  const bucket: Bucket = { pos: [], nrm: [], idx: [] };
  for (const i of arms) {
    const u = DIR[i];
    const { n, b } = axesFor(u);
    appendSweep(bucket, prof, [
      { p: u.clone().multiplyScalar(BEND), n, b },
      { p: u.clone().multiplyScalar(EXT), n, b },
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
  uniform vec3 uWarm;
  uniform vec3 uCool;
  uniform vec3 uLow;
  uniform vec3 uDeep;
  uniform vec3 uShade;
  uniform vec3 uBg;
  #include <clipping_planes_pars_fragment>

  float grit(vec2 p) {
    return fract(sin(dot(p * 12.0, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    #include <clipping_planes_fragment>
    vec3 n = normalize(vNormal);
    vec3 rel = vWorld - uOrigin;
    float height = clamp(-dot(rel, uDown) / uSpan, -1.0, 1.0);
    float across = clamp(dot(rel, uRight) / uSpan, -1.0, 1.0);

    float topF = smoothstep(0.25, 0.92, clamp(-n.y, 0.0, 1.0));
    float rightF = smoothstep(0.25, 0.92, clamp(n.x, 0.0, 1.0));
    float leftF = smoothstep(0.25, 0.92, clamp(n.z, 0.0, 1.0));

    vec2 screen = vec2(dot(vWorld, uRight), dot(vWorld, uDown));
    vec2 leftUV = vec2(-0.5 * screen.x - 0.8660254 * screen.y, 0.8660254 * screen.x - 0.5 * screen.y);
    vec2 topUV = vec2(-0.5 * screen.x + 0.8660254 * screen.y, -0.8660254 * screen.x - 0.5 * screen.y);
    float gR = grit(screen);
    float gL = grit(leftUV);
    float gT = grit(topUV);
    float face = rightF + leftF + topF;
    float dither = (gR * rightF + gL * leftF + gT * topF) / max(face, 0.001);
    float kick = (dither - 0.5) * 0.05;

    float sideH0 = clamp(height + uPointer.y * 0.7, -1.0, 1.0);
    float h0 = mix(height, sideH0, clamp(rightF + leftF, 0.0, 1.0));
    float h = clamp(h0 + kick, -1.0, 1.0);
    float sideH = clamp(sideH0 + kick, -1.0, 1.0);
    float acrossD = clamp(across + kick, -1.0, 1.0);

    float rise = smoothstep(-0.75, 0.65, h);
    vec3 wash = mix(uLow, mix(uWarm, uTop, smoothstep(-0.15, 0.55, h)), rise);
    wash = mix(wash, uCool, smoothstep(0.15, -0.75, acrossD) * mix(0.15, 0.55, smoothstep(0.3, -0.6, h)));
    wash = mix(wash, uDeep, smoothstep(0.05, -0.85, h) * smoothstep(-0.15, 0.75, acrossD) * 0.45);

    vec3 coolSide = mix(uCool, uLow, smoothstep(0.35, -0.45, sideH));
    float lifted = 1.0 - smoothstep(-1.0, 0.0, uPointer.y);
    float sunk = smoothstep(0.0, 1.0, uPointer.y);
    vec3 topTone = mix(uTop, vec3(1.0), lifted * 0.62);
    topTone = mix(topTone, uBg, sunk * 0.82);

    vec3 color = wash;
    color = mix(color, topTone, topF * mix(0.78, 1.0, sunk));
    color = mix(color, uWarm, rightF * 0.62);
    color = mix(color, coolSide, leftF * 0.62);

    vec3 base = vec3(0.45, -1.35, 0.22);
    vec3 key = normalize(base + uRight * uPointer.x * 1.15 + uDown * uPointer.y * 1.15);
    float nd = dot(n, key);
    color = mix(color, mix(color, uShade, 0.55), smoothstep(0.35, -0.15, nd));
    color = mix(color, vec3(1.0), 0.05 * (1.0 - topF * sunk));
    color += (dither - 0.5) * 0.055 * clamp(face, 0.0, 1.0);
    gl_FragColor = vec4(color, 1.0);
  }
`;

const GROUND_VERT = `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
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
  void main() {
    vec3 rel = vWorld - uOrigin;
    float height = clamp(-dot(rel, uDown) / uSpan, -1.0, 1.0);
    float across = clamp(dot(rel, uRight) / uSpan, -1.0, 1.0);
    float h = clamp(height + uPointer.y * 0.7, -1.0, 1.0);
    vec3 color = uBg;
    color = mix(color, uTop, smoothstep(0.0, 1.0, h) * 0.42);
    color = mix(color, uLow, (1.0 - smoothstep(-1.0, 0.0, h)) * 0.28);
    color = mix(color, uCool, (1.0 - smoothstep(-1.0, 0.2, across)) * 0.16);
    color = mix(color, uWarm, smoothstep(-0.1, 1.0, across) * 0.1);
    float glow = uPointer.x * across;
    color = mix(color, vec3(1.0), clamp(glow, 0.0, 1.0) * 0.06);
    gl_FragColor = vec4(color, 1.0);
  }
`;

function srgb(hex: string): Vector3 {
  const tone = Number.parseInt(hex.slice(1), 16);
  return new Vector3(((tone >> 16) & 255) / 255, ((tone >> 8) & 255) / 255, (tone & 255) / 255);
}

export type SolidHive = {
  scene: Scene;
  camera: ReturnType<typeof makeSolidCamera>;
  pointer: Vector2;
  groups: Array<{ group: Group; delay: number }>;
  bases: Vector3[];
  settled: number;
  dispose: () => void;
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
  const groups: Array<{ group: Group; delay: number }> = [];
  const measure = measureHive(tiles);

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
        uSpan: { value: 14 },
        uPointer: { value: pointer },
        uTop: { value: srgb(palette.top) },
        uWarm: { value: srgb(palette.right) },
        uCool: { value: srgb(palette.left) },
        uLow: { value: srgb(palette.low) },
        uDeep: { value: srgb(palette.deep) },
        uShade: { value: srgb(palette.shade) },
        uBg: { value: srgb(palette.background) },
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
    const group = new Group();
    group.position.copy(screenToWorld(cx, cy));
    const open = [...tile.name].map((digit) => digit === '1');
    if (round && elbowArms(open)) {
      const mask = open.map((bit) => (bit ? '1' : '0')).join('');
      let elbow = elbows.get(mask);
      if (!elbow) {
        elbow = buildElbow(open);
        elbows.set(mask, elbow);
      }
      group.add(new Mesh(elbow, material));
    } else {
      group.add(new Mesh(jointGeo, material));
      for (let side = 0; side < 6; side++) {
        if (!open[side]) continue;
        const rod = new Mesh(rodGeo, material);
        placeRod(rod, RODS[side].axis, RODS[side].sign);
        group.add(rod);
      }
    }
    scene.add(group);
    groups.push({ group, delay: Math.max(0, measure.order[index]) * STEP_MS });
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
    opacity: 0.45,
    dashSize: 7 / PX,
    gapSize: 6 / PX,
  });
  const grid = new LineSegments(gridGeo, gridMat);
  grid.computeLineDistances();
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

  return {
    scene,
    camera,
    pointer,
    groups,
    bases: groups.map((entry) => entry.group.position.clone()),
    settled: Math.max(0, ...groups.map((entry) => entry.delay)),
    dispose: () => {
      jointGeo.dispose();
      rodGeo.dispose();
      for (const elbow of elbows.values()) elbow.dispose();
      gridGeo.dispose();
      gridMat.dispose();
      groundGeo.dispose();
      groundMat.dispose();
      for (const material of materials) material.dispose();
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
