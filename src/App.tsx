import { useEffect, useRef, useState } from 'react';
import { initBoot } from './bootloader.ts';
import type { BootContext } from './bootloader.ts';
import { ART_H, ART_W, generateHive, TILE_H, TILE_W } from './hive.ts';
import type { Tile } from './hive.ts';

type Placed = {
  key: string;
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

function place(width: number, height: number, tiles: Tile[]): Placed[] {
  const pad = 0.06;
  const scale = Math.min(
    (width * (1 - pad * 2)) / ART_W,
    (height * (1 - pad * 2)) / ART_H,
  );
  const ox = (width - ART_W * scale) / 2;
  const oy = (height - ART_H * scale) / 2;
  return tiles.flatMap((tile) =>
    (tile.layers ?? [tile.name]).map((name, layer) => ({
      key: `${tile.q},${tile.r},${layer}`,
      name,
      left: ox + tile.x * scale,
      top: oy + tile.y * scale,
      width: TILE_W * scale,
      height: TILE_H * scale,
    })),
  );
}

// Each file's <style> uses the same class names. A shadow root keeps those
// rules on that tile. Width and height are 100% so the viewBox scales as vectors.
function fitSvg(text: string): string {
  const body = text.replace(/<\?xml[^?]*\?>/, '');
  return body.replace(/<svg\b([^>]*)>/, (_match, attrs: string) => {
    const cleaned = String(attrs)
      .replace(/\swidth="[^"]*"/g, '')
      .replace(/\sheight="[^"]*"/g, '')
      .replace(/\spreserveAspectRatio="[^"]*"/g, '');
    return `<svg${cleaned} width="100%" height="100%" preserveAspectRatio="none">`;
  });
}

function TileView({ markup, tile }: { markup: string; tile: Placed }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    root.innerHTML = markup;
  }, [markup]);

  return (
    <div
      ref={hostRef}
      style={{
        position: 'absolute',
        left: tile.left,
        top: tile.top,
        width: tile.width,
        height: tile.height,
      }}
    />
  );
}

export default function App() {
  const bootRef = useRef<BootContext | null>(null);
  const hiveRef = useRef<Tile[] | null>(null);
  if (!bootRef.current) bootRef.current = initBoot();
  if (!hiveRef.current) hiveRef.current = generateHive(bootRef.current.rnd);

  const tiles = hiveRef.current;
  const [box, setBox] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const [marks, setMarks] = useState<Map<string, string> | null>(null);

  useEffect(() => {
    const onResize = () => setBox({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    let alive = true;
    const names = [...new Set(tiles.flatMap((tile) => tile.layers ?? [tile.name]))];
    Promise.all(
      names.map(async (name) => {
        const text = await fetch(`${import.meta.env.BASE_URL}assets/${name}.svg`).then((response) => response.text());
        return [name, fitSvg(text)] as const;
      }),
    ).then((entries) => {
      if (alive) setMarks(new Map(entries));
    });
    return () => {
      alive = false;
    };
  }, [tiles]);

  useEffect(() => {
    if (!marks) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => bootRef.current?.capture());
    });
    return () => cancelAnimationFrame(frame);
  }, [marks]);

  const placed = place(box.width, box.height, tiles);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {marks && placed.map((tile) => {
        const markup = marks.get(tile.name);
        if (!markup) return null;
        return <TileView key={tile.key} markup={markup} tile={tile} />;
      })}
    </div>
  );
}
