export type Palette = {
  name: string;
  weight: number;
  background: string;
  /** Top of the pale wash. */
  top: string;
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
    background: '#ffcda8',
    top: '#f6dfb5',
    right: '#f09a9c',
    left: '#7ca3ce',
    low: '#b6eeb8',
    deep: '#74e3d5',
    shade: '#a9a3c0',
    outer: '#c48b84',
    outward: '#fff6ee',
    grid: '#e7b396',
    mark: '#b98a86',
  },
  {
    name: 'Rose',
    weight: 24,
    background: '#f6d5d2',
    top: '#f8e6df',
    right: '#e9899a',
    left: '#c7b0d4',
    low: '#f0c3c8',
    deep: '#e7b4c8',
    shade: '#c4a4b4',
    outer: '#c48a98',
    outward: '#fff4f2',
    grid: '#e4b8b4',
    mark: '#b48490',
  },
  {
    name: 'Mist',
    weight: 20,
    background: '#d5e4ea',
    top: '#f4f7f2',
    right: '#f0c9c2',
    left: '#8eb4d4',
    low: '#b7e3d8',
    deep: '#9fd4e4',
    shade: '#b7c0d4',
    outer: '#7f9eae',
    outward: '#f7fbfb',
    grid: '#b7cdd6',
    mark: '#7f92a0',
  },
  {
    name: 'Sand',
    weight: 16,
    background: '#f0e2cc',
    top: '#f8efd8',
    right: '#e7b89a',
    left: '#c9c4b0',
    low: '#d5e0c4',
    deep: '#c9d6c0',
    shade: '#cbb8a4',
    outer: '#b89a78',
    outward: '#fff8ee',
    grid: '#e0cbb0',
    mark: '#b09880',
  },
];

export type Style = {
  palette: Palette;
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

// Rolled after the structure, from the same generator.
export function pickStyle(rnd: () => number): Style {
  return { palette: pick(PALETTES, rnd) };
}
