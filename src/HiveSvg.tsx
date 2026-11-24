import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { drawHive } from './draw.ts';
import { ART_H, ART_W } from './hive.ts';
import type { Tile } from './hive.ts';

export function HiveSvg({ tiles, width, height, style }: {
  tiles: Tile[];
  width: number;
  height: number;
  style?: CSSProperties;
}) {
  const marks = useMemo(() => drawHive(tiles), [tiles]);
  return (
    <svg viewBox={`0 0 ${ART_W} ${ART_H}`} width={width} height={height} style={style}>
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
