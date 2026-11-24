import { measureHive } from './hive.ts';
import type { Hive } from './hive.ts';

export type Features = {
  Footprint: string;
  Cells: number;
  Loops: number;
  Paradoxes: number;
  Buildable: string;
};

export function hiveFeatures(hive: Hive): Features {
  const measure = measureHive(hive.tiles);
  return {
    Footprint: hive.footprint,
    Cells: measure.cells,
    Loops: measure.loops,
    Paradoxes: measure.paradoxes,
    Buildable: measure.buildable ? 'Yes' : 'No',
  };
}
