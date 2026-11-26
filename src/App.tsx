import { useEffect, useRef, useState } from 'react';
import { initBoot } from './bootloader.ts';
import type { BootContext } from './bootloader.ts';
import { hiveFeatures } from './features.ts';
import { HiveMark } from './HiveMark.tsx';
import { HiveThree } from './HiveThree.tsx';
import { ART_H, ART_W, generateHive } from './hive.ts';
import type { Hive } from './hive.ts';
import { pickStyle } from './style.ts';
import type { Style } from './style.ts';

export default function App() {
  const bootRef = useRef<BootContext | null>(null);
  const hiveRef = useRef<{ hive: Hive; art: Style } | null>(null);
  if (!bootRef.current) bootRef.current = initBoot();
  if (!hiveRef.current) {
    const hive = generateHive(bootRef.current.rnd);
    hiveRef.current = { hive, art: pickStyle(bootRef.current.rnd) };
  }

  const { hive, art } = hiveRef.current;
  const capture = bootRef.current.isCapture;
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
    const background = art.palette.background;
    document.documentElement.style.background = background;
    document.body.style.background = background;
    bootRef.current?.setFeatures(hiveFeatures(hive, art));
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => bootRef.current?.capture());
    });
    return () => cancelAnimationFrame(frame);
  }, [hive, art]);

  const pad = 0.06;
  const scale = Math.min(
    (box.width * (1 - pad * 2)) / ART_W,
    (box.height * (1 - pad * 2)) / ART_H,
  );
  const width = ART_W * scale;
  const height = ART_H * scale;

  const frame = {
    position: 'absolute' as const,
    left: (box.width - width) / 2,
    top: (box.height - height) / 2,
  };

  return (
    <>
      <HiveThree tiles={hive.tiles} palette={art.palette} width={width} height={height} animate={!capture} style={frame} />
      {/* <HiveMark tiles={hive.tiles} art={art} width={width} height={height} style={frame} /> */}
    </>
  );
}
