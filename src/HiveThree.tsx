import { useLayoutEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { WebGLRenderer, SRGBColorSpace } from 'three';
import type { Tile } from './hive.ts';
import type { Palette } from './style.ts';
import { buildHive } from './solidScene.ts';

const RISE_MS = 700;

export function HiveThree({ tiles, palette, width, height, animate = false, style }: {
  tiles: Tile[];
  palette: Palette;
  width: number;
  height: number;
  /** Grow each joint. The pointer steers the light. Off for capture. */
  animate?: boolean;
  style?: CSSProperties;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.localClippingEnabled = true;
    host.appendChild(renderer.domElement);

    const hive = buildHive(tiles, palette);
    const started = performance.now();
    const settled = hive.settled + RISE_MS;
    let frame = 0;

    const draw = (now: number) => {
      const elapsed = now - started;
      for (let i = 0; i < hive.groups.length; i++) {
        const u = animate ? Math.min(1, Math.max(0, (elapsed - hive.groups[i].delay) / RISE_MS)) : 1;
        const eased = 1 - (1 - u) ** 3;
        hive.groups[i].group.position.copy(hive.bases[i]);
        hive.groups[i].group.scale.setScalar(0.45 + 0.55 * eased);
      }
      renderer.render(hive.scene, hive.camera);
      return animate && elapsed < settled;
    };

    const onPointer = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      hive.pointer.set(
        Math.min(1, Math.max(-1, ((event.clientX - rect.left) / rect.width - 0.5) * 2)),
        Math.min(1, Math.max(-1, ((event.clientY - rect.top) / rect.height - 0.5) * 2)),
      );
      if (!frame) draw(performance.now());
    };

    draw(started);
    if (animate) {
      window.addEventListener('pointermove', onPointer);
      const loop = (now: number) => {
        frame = draw(now) ? requestAnimationFrame(loop) : 0;
      };
      frame = requestAnimationFrame(loop);
    }

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onPointer);
      host.removeChild(renderer.domElement);
      hive.dispose();
      renderer.dispose();
    };
  }, [tiles, palette, width, height, animate]);

  return <div ref={hostRef} style={{ width, height, ...style }} />;
}
