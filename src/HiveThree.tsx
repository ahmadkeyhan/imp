import { useLayoutEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { Vector2, WebGLRenderer, SRGBColorSpace } from 'three';
import { ART_H, ART_W, type Tile } from './hive.ts';
import type { Palette } from './style.ts';
import { buildHive } from './solidScene.ts';
import { frameScale } from './solidView.ts';

const MAX_YAW = 1.25;
const MAX_PITCH = 0.85;
const TEASE_AT = 7; // seconds: one small unprompted turn, in place of a hint label

const clamp = (v: number, limit: number) => Math.min(limit, Math.max(-limit, v));
const ease = (u: number) => {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
};

export function HiveThree({ tiles, palette, round = false, width, height, animate = false, style }: {
  tiles: Tile[];
  palette: Palette;
  /** Round the two-arm corners. Joints of three or more stay sharp boxes. */
  round?: boolean;
  width: number;
  height: number;
  /** The live piece: rise, light, comb and orbit. Off for capture. */
  animate?: boolean;
  style?: CSSProperties;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Outlives a resize, so going fullscreen does not replay the build.
  const bornRef = useRef<number | null>(null);
  const duskRef = useRef(new URLSearchParams(location.search).get('dusk') === '1');
  const nightRef = useRef(duskRef.current ? 1 : 0);
  // When the current build began, in ms after `born`. Done: it has finished.
  const buildRef = useRef({ from: 0, done: false });

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

    const scale = frameScale(width, height);
    const hive = buildHive(tiles, palette, width / scale, height / scale, round);
    bornRef.current ??= performance.now();
    const born = bornRef.current;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cursor = new Vector2(1e5, 1e5);

    // Orbit state. Held: follows the hand. Released: a spring brings it home.
    let yaw = 0;
    let pitch = 0;
    let vYaw = 0;
    let vPitch = 0;
    let drag: { x: number; y: number } | null = null;
    let showAt = -1; // start of a scripted reveal, in seconds
    let showSize = 1;
    let teased = calm || performance.now() - born > TEASE_AT * 1000;
    let away = false;
    let snapAt = -10;
    let last = performance.now();
    let frame = 0;

    const draw = (now: number) => {
      const elapsed = now - born;
      const time = elapsed / 1000;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;

      if (animate && !teased && time > TEASE_AT) {
        teased = true;
        showAt = time;
        showSize = 0.13;
      }
      if (showAt >= 0 && !drag) {
        const u = time - showAt;
        const hold = showSize < 0.5 ? 0.15 : 1.8;
        const turn = ease(u / 1.4) * (1 - ease((u - 1.4 - hold) / 1.2)) * showSize;
        yaw = 0.8 * turn;
        pitch = -0.38 * turn;
        if (u > 2.6 + hold) {
          showAt = -1;
          yaw = pitch = 0;
        }
      } else if (!drag && (yaw || pitch)) {
        vYaw += (-70 * yaw - 13 * vYaw) * dt;
        vPitch += (-70 * pitch - 13 * vPitch) * dt;
        yaw += vYaw * dt;
        pitch += vPitch * dt;
        if (Math.hypot(yaw, pitch) < 0.006 && Math.hypot(vYaw, vPitch) < 0.12) yaw = pitch = vYaw = vPitch = 0;
      }
      // The snap: the instant the frame becomes impossible again.
      const angle = Math.hypot(yaw, pitch);
      if (angle > 0.25) away = true;
      else if (away && angle < 0.012) {
        away = false;
        snapAt = time;
      }

      const building = animate && !calm && !buildRef.current.done;
      const buildAt = (elapsed - buildRef.current.from) / 1000;
      // A hand on the piece ends the build at once: the view that opens needs it whole.
      if (building && (drag || yaw || pitch)) {
        hive.assemble(hive.buildTime);
        buildRef.current.done = true;
      }
      const amount = hive.orbit(yaw, pitch);
      if (building && !buildRef.current.done) {
        hive.assemble(buildAt);
        if (buildAt >= hive.buildTime) {
          buildRef.current.done = true;
          snapAt = time; // the last run lands: it closes, and cannot
        }
      }
      if (animate) {
        hive.tick({
          time: calm ? 0 : time,
          field: ease((time - 0.5) / 2.2) * (1 - amount * 0.65),
          night: (nightRef.current += ((duskRef.current ? 1 : 0) - nightRef.current) * Math.min(1, dt * 4)),
          snap: time >= snapAt ? Math.exp(-(time - snapAt) * 4.5) : 0,
          cursor,
        });
      }
      for (let i = 0; i < hive.groups.length; i++) hive.groups[i].group.position.copy(hive.bases[i]);
      renderer.localClippingEnabled = amount === 0;
      renderer.render(hive.scene, hive.camera);
    };

    const aim = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      hive.pointer.set(
        clamp(((event.clientX - rect.left) / rect.width - 0.5) * 2, 1),
        clamp(((event.clientY - rect.top) / rect.height - 0.5) * 2, 1),
      );
      // Pointer in artboard pixels, measured from the middle of the board.
      cursor.set(
        (event.clientX - rect.left - rect.width / 2) / scale,
        (event.clientY - rect.top - rect.height / 2) / scale,
      );
      if (cursor.length() > ART_W + ART_H) cursor.setLength(ART_W + ART_H);
    };
    const onMove = (event: PointerEvent) => {
      aim(event);
      if (!drag) return;
      const k = 3.2 / Math.min(width, height);
      yaw = clamp(yaw - (event.clientX - drag.x) * k, MAX_YAW);
      pitch = clamp(pitch + (event.clientY - drag.y) * k, MAX_PITCH);
      drag = { x: event.clientX, y: event.clientY };
    };
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      aim(event);
      drag = { x: event.clientX, y: event.clientY };
      showAt = -1;
      teased = true;
      vYaw = vPitch = 0;
      host.setPointerCapture(event.pointerId);
      host.style.cursor = 'grabbing';
    };
    const onUp = () => {
      drag = null;
      host.style.cursor = 'grab';
    };
    const onLeave = () => cursor.set(1e5, 1e5);
    const reveal = () => {
      if (drag || showAt >= 0) return;
      teased = true;
      showSize = 1;
      showAt = (performance.now() - born) / 1000;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'r') {
        // Build it again.
        if (!drag && !yaw && !pitch && showAt < 0) {
          teased = true;
          buildRef.current = { from: performance.now() - born, done: false };
        }
      } else if (event.code === 'Space') {
        event.preventDefault();
        reveal();
      } else if (event.key.toLowerCase() === 'd') {
        duskRef.current = !duskRef.current;
      } else if (event.key.toLowerCase() === 'f') {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen?.().catch(() => {});
      }
    };

    draw(performance.now());
    if (animate) {
      host.style.cursor = 'grab';
      host.style.touchAction = 'none';
      host.addEventListener('pointermove', onMove);
      host.addEventListener('pointerdown', onDown);
      host.addEventListener('pointerup', onUp);
      host.addEventListener('pointercancel', onUp);
      host.addEventListener('pointerleave', onLeave);
      host.addEventListener('dblclick', reveal);
      window.addEventListener('keydown', onKey);
      const loop = (now: number) => {
        draw(now);
        frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);
    }

    return () => {
      if (frame) cancelAnimationFrame(frame);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerdown', onDown);
      host.removeEventListener('pointerup', onUp);
      host.removeEventListener('pointercancel', onUp);
      host.removeEventListener('pointerleave', onLeave);
      host.removeEventListener('dblclick', reveal);
      window.removeEventListener('keydown', onKey);
      host.removeChild(renderer.domElement);
      hive.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    };
  }, [tiles, palette, round, width, height, animate]);

  return <div ref={hostRef} style={{ width, height, ...style }} />;
}
