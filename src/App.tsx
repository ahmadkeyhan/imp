import { useEffect, useRef, useState } from 'react';
import { initBoot } from './bootloader.ts';
import type { BootContext } from './bootloader.ts';
import { hiveFeatures } from './features.ts';
import { HiveSvg } from './HiveSvg.tsx';
import { ART_H, ART_W, generateHive } from './hive.ts';
import type { Hive } from './hive.ts';

export default function App() {
  const bootRef = useRef<BootContext | null>(null);
  const hiveRef = useRef<Hive | null>(null);
  if (!bootRef.current) bootRef.current = initBoot();
  if (!hiveRef.current) hiveRef.current = generateHive(bootRef.current.rnd);

  const hive = hiveRef.current;
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
    bootRef.current?.setFeatures(hiveFeatures(hive));
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => bootRef.current?.capture());
    });
    return () => cancelAnimationFrame(frame);
  }, [hive]);

  const pad = 0.06;
  const scale = Math.min(
    (box.width * (1 - pad * 2)) / ART_W,
    (box.height * (1 - pad * 2)) / ART_H,
  );
  const width = ART_W * scale;
  const height = ART_H * scale;

  return (
    <HiveSvg
      tiles={hive.tiles}
      width={width}
      height={height}
      style={{
        position: 'absolute',
        left: (box.width - width) / 2,
        top: (box.height - height) / 2,
      }}
    />
  );
}
