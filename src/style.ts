export type Palette = {
  name: string;
  weight: number;
  background: string;
  /** Top faces, high in the frame. */
  top: string;
  /** Top faces through the middle, and low in the frame. */
  topMid: string;
  topLow: string;
  /** The soft warm tone beside `right`. */
  blush: string;
  /** Warm side. */
  right: string;
  /** Cool side, toward the top of the frame. */
  left: string;
  /** Cool side, toward the bottom. */
  low: string;
  /** Lower accent. */
  deep: string;
  /** Tint where the face turns from the light. */
  shade: string;
  /** Silhouette against the background. */
  outer: string;
  /** Ridge where two lit faces fold away from each other. */
  outward: string;
  grid: string;
  /** Line drawing under the structure. */
  mark: string;
};

export const PALETTES: Palette[] = [
  {
    name: 'Peach',
    weight: 40,
    background: '#fbbb8b',
    top: '#fff0b3',
    topMid: '#febe97',
    topLow: '#dde597',
    right: '#ec757d',
    blush: '#fc9c8c',
    left: '#4786d9',
    low: '#9bf49e',
    deep: '#24feee',
    shade: '#a184b7',
    outer: '#c48b84',
    outward: '#fff6ee',
    grid: '#e7b396',
    mark: '#b98a86',
  },
  {
    name: 'Rose',
    weight: 24,
    background: '#f3b2b6',
    top: '#fff1db',
    topMid: '#fabfc4',
    topLow: '#d9bfe8',
    right: '#e15a87',
    blush: '#f389a1',
    left: '#4f6bdd',
    low: '#97c2fb',
    deep: '#46d6ff',
    shade: '#a476c6',
    outer: '#c48a98',
    outward: '#fff4f2',
    grid: '#e4b8b4',
    mark: '#b48490',
  },
  {
    name: 'Mist',
    weight: 20,
    background: '#b8d4dc',
    top: '#fcfade',
    topMid: '#d0e6d4',
    topLow: '#acebd4',
    right: '#e37d9d',
    blush: '#eea8ab',
    left: '#3671c5',
    low: '#91f2c1',
    deep: '#18f9eb',
    shade: '#7a8ccd',
    outer: '#7f9eae',
    outward: '#f7fbfb',
    grid: '#b7cdd6',
    mark: '#7f92a0',
  },
  {
    name: 'Sand',
    weight: 16,
    background: '#afafaf',
    top: '#e5e4df',
    topMid: '#cfcac5',
    topLow: '#a0a0a0',
    right: '#dadada',
    blush: '#cecece',
    left: '#b3b3b3',
    low: '#e7e7e7',
    deep: '#e4e4e4',
    shade: '#b3b3b3',
    outer: '#b8b8b8',
    outward: '#ffffff',
    grid: '#a7a7a7',
    mark: '#b09880',
  },
  {
    name: 'Midnight',
    // Not rolled by weight: see MIDNIGHT_SHARE.
    weight: 0,
    background: '#26234a',
    top: '#d3caff',
    topMid: '#ac9bd5',
    topLow: '#87c4d5',
    right: '#9a5cbc',
    blush: '#7a4c9c',
    left: '#3552a0',
    low: '#48bfb2',
    deep: '#48bfb2',
    shade: '#756bb7',
    outer: '#2e3b75',
    outward: '#e9e5ff',
    grid: '#474178',
    mark: '#756bb7',
  },
];

export const CORNERS = [
  { name: 'Sharp' as const, weight: 75 },
  { name: 'Round' as const, weight: 25 },
];

export type Corners = (typeof CORNERS)[number]['name'];

export type Style = {
  palette: Palette;
  /** Elbows only. Joints of three or more stay sharp boxes. */
  corners: Corners;
};

function pick<T extends { weight: number }>(items: T[], rnd: () => number): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = rnd() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll < 0) return item;
  }
  return items[items.length - 1];
}

// Midnight takes this part from the end of each other palette's range, so a seed
// that does not turn Midnight keeps the palette it had before.
const MIDNIGHT_SHARE = 0.12;

function pickPalette(rnd: () => number): Palette {
  const midnight = PALETTES.find((p) => p.name === 'Midnight')!;
  const total = PALETTES.reduce((sum, item) => sum + item.weight, 0);
  let roll = rnd() * total;
  for (const item of PALETTES) {
    if (roll < item.weight) return roll < item.weight * (1 - MIDNIGHT_SHARE) ? item : midnight;
    roll -= item.weight;
  }
  return midnight;
}

// Rolled after the structure, from the same generator.
export function pickStyle(rnd: () => number): Style {
  return { palette: pickPalette(rnd), corners: pick(CORNERS, rnd).name };
}
