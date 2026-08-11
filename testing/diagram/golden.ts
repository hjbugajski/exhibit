/*
 * Golden-scene helper. Scenes hold raw floats; snapshots hold them rounded to two decimals, which is
 * the same precision `d` strings are emitted at and enough to survive platform float noise.
 */

import type { Scene } from '@/lib/diagram/types.ts';

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;

  return Object.is(rounded, -0) ? 0 : rounded;
}

function clone(value: unknown, digits: number): unknown {
  if (typeof value === 'number') {
    return round(value, digits);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => clone(entry, digits));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, clone(entry, digits)]),
    );
  }

  return value;
}

/** Snapshot-ready copy of a scene: every number rounded, everything else untouched. */
export function goldenScene(scene: Scene, digits = 2): unknown {
  return clone(scene, digits);
}
