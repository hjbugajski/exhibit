import { useMemo } from 'react';

/** 32-bit FNV-1a — cheap, stable hash of the seed string. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

/** mulberry32 PRNG: a deterministic bit source seeded from the hash. */
function mulberry32(seed: number): () => number {
  let state = seed;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const GRID = 5;

function generate(seed: string) {
  const next = mulberry32(fnv1a(seed));
  const hue = Math.floor(next() * 360);
  const cells: { x: number; y: number }[] = [];

  // Fill the left three columns from the bit stream and mirror them for the classic symmetric
  // identicon look; each cell is either fully on or off.
  for (let x = 0; x < Math.ceil(GRID / 2); x++) {
    for (let y = 0; y < GRID; y++) {
      const on = next() >= 0.45;

      if (!on) {
        continue;
      }

      cells.push({ x, y });

      const mirror = GRID - 1 - x;

      if (mirror !== x) {
        cells.push({ x: mirror, y });
      }
    }
  }

  // Guard against a fully-empty sprite.
  if (cells.length === 0) {
    cells.push({ x: 2, y: 2 });
  }

  const xs = cells.map((cell) => cell.x);
  const ys = cells.map((cell) => cell.y);
  const xMin = Math.min(...xs);
  const yMin = Math.min(...ys);
  const viewBox = `${xMin} ${yMin} ${Math.max(...xs) - xMin + 1} ${Math.max(...ys) - yMin + 1}`;

  return { cells, color: `oklch(0.8 0.2 ${hue})`, viewBox };
}

/**
 * Deterministic "space invader" identicon: the same seed always draws the same mirrored 5×5 grid of
 * square, full-opacity pixels with no background — the svg is transparent so the sprite sits
 * directly in whatever container it's placed in. The viewBox is the exact bounding box of the lit
 * cells, so `preserveAspectRatio="xMidYMid meet"` (the svg default) centers the sprite and fits it
 * tightly regardless of the pattern's shape. Only the sprite's hue is seed-derived (hash → oklch),
 * fixed at arcade-neon lightness/chroma — the same category as chart series colors, so theme tokens
 * don't apply here.
 */
export function Identicon({ seed, className }: { seed: string; className?: string }) {
  const { cells, color, viewBox } = useMemo(() => generate(seed), [seed]);

  return (
    <svg aria-hidden className={className} shapeRendering="crispEdges" viewBox={viewBox}>
      {cells.map(({ x, y }) => (
        <rect fill={color} height="1" key={`${x}-${y}`} width="1" x={x} y={y} />
      ))}
    </svg>
  );
}
