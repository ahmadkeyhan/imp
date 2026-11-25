import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { drawHive } from './draw.ts';
import { ART_H, ART_W, measureHive } from './hive.ts';
import type { Tile } from './hive.ts';
import type { Style } from './style.ts';

// One build step per joint, in breadth-first order.
const STEP_MS = 110;
const RISE_MS = 700;

export function HiveSvg({ tiles, art, width, height, animate = false, style }: {
  tiles: Tile[];
  art: Style;
  width: number;
  height: number;
  /** Build in, then drift. Off for thumbnails and capture. */
  animate?: boolean;
  style?: CSSProperties;
}) {
  const marks = useMemo(() => drawHive(tiles, art), [tiles, art]);
  const measure = useMemo(() => measureHive(tiles), [tiles]);
  const built = Math.max(0, ...measure.order) * STEP_MS + RISE_MS;

  return (
    <svg viewBox={`0 0 ${ART_W} ${ART_H}`} width={width} height={height} style={style}>
      <g
        className={animate ? 'imp-drift' : undefined}
        style={animate ? { animationDelay: `${built}ms` } : undefined}
      >
        {marks.map((mark, index) => (
          <polygon
            key={index}
            points={mark.pts}
            fill={mark.fill}
            stroke={mark.stroke}
            strokeWidth={mark.width}
            strokeDasharray={mark.dash}
            strokeLinejoin="round"
            strokeLinecap="butt"
            className={animate && mark.cell >= 0 ? 'imp-build' : undefined}
            style={
              animate && mark.cell >= 0
                ? { animationDelay: `${measure.order[mark.cell] * STEP_MS}ms` }
                : undefined
            }
          />
        ))}
      </g>
    </svg>
  );
}
