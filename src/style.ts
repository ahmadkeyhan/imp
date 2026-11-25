export type Palette = {
  name: string;
  weight: number;
  background: string;
  top: string;
  right: string;
  left: string;
  /** Silhouette against the background. */
  outer: string;
  /** Ridge where two lit faces fold away from each other. */
  outward: string;
  grid: string;
};

export const PALETTES: Palette[] = [
  {
    name: 'Graphite',
    weight: 55,
    background: '#2c2c2c',
    top: '#9a9a9a',
    right: '#686868',
    left: '#484848',
    outer: '#2c2c2c',
    outward: '#d9d9d9',
    grid: '#404040',
  },
  {
    name: 'Bone',
    weight: 18,
    background: '#e8e2d6',
    top: '#fbf8f1',
    right: '#cfc6b5',
    left: '#a99f8c',
    outer: '#5a5245',
    outward: '#ffffff',
    grid: '#d6cebf',
  },
  {
    name: 'Blueprint',
    weight: 17,
    background: '#173a5e',
    top: '#8fb4d9',
    right: '#4f7fae',
    left: '#2f5c8a',
    outer: '#0e2741',
    outward: '#d6e6f5',
    grid: '#24496f',
  },
  {
    name: 'Rust',
    weight: 10,
    background: '#2a211d',
    top: '#d08a5a',
    right: '#9c5a36',
    left: '#6e3b22',
    outer: '#1c1512',
    outward: '#f0d2b8',
    grid: '#3d302a',
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
