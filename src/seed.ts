// Same seed parsing and sfc32 as public/bootloader.js. The contact sheet needs
// many generators on one page; the bootloader only makes one. Keep the two in sync.

export function randomHash(): string {
  return Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

function parseSeed(hex: string): Uint32Array {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(Number.parseInt(hex.substring(i, i + 2), 16));
  const abcd = new Uint32Array(4);
  for (let i = 0; i < 4; i++) {
    abcd[i] = (bytes[i * 4] << 24) | (bytes[i * 4 + 1] << 16) | (bytes[i * 4 + 2] << 8) | bytes[i * 4 + 3];
  }
  for (let i = 16; i < bytes.length; i++) {
    const idx = i - 16;
    abcd[idx % 4] ^= bytes[i] << ((3 - (idx % 4)) * 8);
  }
  if (!(abcd[0] | abcd[1] | abcd[2] | abcd[3])) abcd[3] = 1;
  return abcd;
}

export function seeded(hash: string): () => number {
  let [a, b, c, d] = parseSeed(hash);
  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
