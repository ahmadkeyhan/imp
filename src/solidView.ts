import { OrthographicCamera, Vector3 } from 'three';
import { ART_H, ART_W, TILE_W } from './hive.ts';

// The rods are an orthographic view along (1, -1, 1). That vector is the
// kernel of the projection, so an impossible loop disagrees only in depth.
// These axes are the screen right and screen down of that same view.
// One world unit covers PX artboard pixels.

const REACH = 6;
const HX = (TILE_W / 2) * 0.75 / REACH;

export const PX = HX * Math.SQRT2;

export const VIEW = new Vector3(1, -1, 1).normalize();
export const RIGHT = new Vector3(1, 0, -1).normalize();
export const DOWN = new Vector3(1, 2, 1).normalize();

export function screenToWorld(px: number, py: number): Vector3 {
  return new Vector3().addScaledVector(RIGHT, px / PX).addScaledVector(DOWN, py / PX);
}

// top is below bottom so camera-up, which points down the artboard, lands at
// the bottom of the screen. The negative scale reverses triangle winding;
// the solid material renders its back side to compensate.
export function makeSolidCamera(): OrthographicCamera {
  const halfW = ART_W / PX / 2;
  const halfH = ART_H / PX / 2;
  const camera = new OrthographicCamera(-halfW, halfW, -halfH, halfH, 0.1, 200);
  const target = screenToWorld(ART_W / 2, ART_H / 2);
  camera.up.set(1, 0, 1);
  camera.position.copy(target).addScaledVector(VIEW, 80);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}
