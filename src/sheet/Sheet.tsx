import { useMemo, useState } from 'react';
import { hiveFeatures } from '../features.ts';
import type { Features } from '../features.ts';
import { HiveSvg } from '../HiveSvg.tsx';
import { ART_H, ART_W, generateHive } from '../hive.ts';
import type { Hive } from '../hive.ts';
import { randomHash, seeded } from '../seed.ts';

type Entry = {
  hash: string;
  hive: Hive;
  features: Features;
  ms: number;
};

const SIZES = [48, 96, 192];
const THUMB = 220;

function makeBatch(count: number): Entry[] {
  return Array.from({ length: count }, () => {
    const hash = randomHash();
    const start = performance.now();
    const hive = generateHive(seeded(hash));
    const ms = performance.now() - start;
    return { hash, hive, features: hiveFeatures(hive), ms };
  });
}

function tally(entries: Entry[], key: (entry: Entry) => string | number): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const value = String(key(entry));
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => {
    const na = Number(a[0]);
    const nb = Number(b[0]);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return b[1] - a[1];
  });
}

function Histogram({ title, rows, total, active, onPick }: {
  title: string;
  rows: Array<[string, number]>;
  total: number;
  active: string | null;
  onPick: (value: string | null) => void;
}) {
  const peak = Math.max(1, ...rows.map(([, count]) => count));
  return (
    <section className="stat">
      <h2>{title}</h2>
      {rows.map(([value, count]) => (
        <button
          key={value}
          className={`bar${active === value ? ' active' : ''}`}
          onClick={() => onPick(active === value ? null : value)}
        >
          <span className="label">{value}</span>
          <span className="track">
            <span className="fill" style={{ width: `${(count / peak) * 100}%` }} />
          </span>
          <span className="count">
            {count} <em>{Math.round((count / total) * 100)}%</em>
          </span>
        </button>
      ))}
    </section>
  );
}

export default function Sheet() {
  const [size, setSize] = useState(96);
  const [batch, setBatch] = useState(() => makeBatch(96));
  const [footprint, setFootprint] = useState<string | null>(null);
  const [paradoxes, setParadoxes] = useState<string | null>(null);

  const shown = useMemo(
    () =>
      batch.filter(
        (entry) =>
          (footprint === null || entry.features.Footprint === footprint) &&
          (paradoxes === null || String(entry.features.Paradoxes) === paradoxes),
      ),
    [batch, footprint, paradoxes],
  );

  const regenerate = (count: number) => {
    setSize(count);
    setBatch(makeBatch(count));
  };

  const slowest = Math.max(...batch.map((entry) => entry.ms));
  const average = batch.reduce((sum, entry) => sum + entry.ms, 0) / batch.length;
  const buildable = batch.filter((entry) => entry.features.Buildable === 'Yes').length;

  return (
    <main>
      <header>
        <h1>Imp — contact sheet</h1>
        <div className="controls">
          {SIZES.map((count) => (
            <button key={count} className={count === size ? 'active' : ''} onClick={() => regenerate(count)}>
              {count}
            </button>
          ))}
          <button className="primary" onClick={() => regenerate(size)}>
            New batch
          </button>
        </div>
        <p className="meta">
          {batch.length} seeds · {buildable} buildable · generation avg {average.toFixed(1)} ms, slowest{' '}
          {slowest.toFixed(1)} ms · showing {shown.length}
        </p>
      </header>

      <div className="stats">
        <Histogram
          title="Footprint"
          rows={tally(batch, (entry) => entry.features.Footprint)}
          total={batch.length}
          active={footprint}
          onPick={setFootprint}
        />
        <Histogram
          title="Paradoxes"
          rows={tally(batch, (entry) => entry.features.Paradoxes)}
          total={batch.length}
          active={paradoxes}
          onPick={setParadoxes}
        />
        <Histogram
          title="Loops"
          rows={tally(batch, (entry) => entry.features.Loops)}
          total={batch.length}
          active={null}
          onPick={() => {}}
        />
        <Histogram
          title="Cells"
          rows={tally(batch, (entry) => entry.features.Cells)}
          total={batch.length}
          active={null}
          onPick={() => {}}
        />
      </div>

      <div className="grid">
        {shown.map((entry) => (
          <a key={entry.hash} className="card" href={`./?s=${entry.hash}`} target="_blank" rel="noreferrer">
            <HiveSvg tiles={entry.hive.tiles} width={THUMB} height={(THUMB * ART_H) / ART_W} />
            <span className="caption">
              <strong>{entry.features.Footprint}</strong>
              <span>
                {entry.features.Paradoxes} of {entry.features.Loops} loops break · {entry.features.Cells} cells
              </span>
              <code>{entry.hash.slice(0, 8)}</code>
            </span>
          </a>
        ))}
      </div>
    </main>
  );
}
