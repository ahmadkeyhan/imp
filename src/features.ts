import { measureHive } from './hive.ts';
import type { Hive } from './hive.ts';
import type { Style } from './style.ts';

export type Features = {
  Footprint: string;
  Topology: string;
  Symmetry: string;
  Density: string;
  Palette: string;
  Corners: string;
  Cells: number;
  Loops: number;
  Paradoxes: number;
};

export function hiveFeatures(hive: Hive, style: Style): Features {
  const measure = measureHive(hive.tiles);
  return {
    Footprint: hive.footprint,
    Topology: measure.topology,
    Symmetry: measure.symmetry,
    Density: hive.density,
    Palette: style.palette.name,
    Corners: style.corners,
    Cells: measure.cells,
    Loops: measure.loops,
    Paradoxes: measure.paradoxes,
  };
}
