import { useEffect, useRef, useState } from 'react';
import { initBoot } from './bootloader.ts';
import type { BootContext } from './bootloader.ts';
import { drawHive } from './draw.ts';
import { ART_H, ART_W, generateHive } from './hive.ts';
import type { Tile } from './hive.ts';

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

  useEffect(() => {
    const onResize = () => setBox({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => bootRef.current?.capture());
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const pad = 0.06;
  const scale = Math.min(
    (box.width * (1 - pad * 2)) / ART_W,
    (box.height * (1 - pad * 2)) / ART_H,
  );
  const width = ART_W * scale;
  const height = ART_H * scale;
  const marks = drawHive(tiles);

  return (
    <svg
      viewBox={`0 0 ${ART_W} ${ART_H}`}
      width={width}
      height={height}
      style={{
        position: 'absolute',
        left: (box.width - width) / 2,
        top: (box.height - height) / 2,
      }}
    >
      {marks.map((mark, index) => (
        <polygon
          key={index}
          points={mark.pts}
          fill={mark.fill}
          stroke={mark.stroke}
          strokeWidth={mark.width}
          strokeLinejoin="round"
          strokeLinecap="butt"
        />
      ))}
    </svg>
  );
}
