/*
 * Golden-scene helper. Scenes hold raw floats; snapshots hold them rounded to two decimals, which is
 * the same precision `d` strings are emitted at and enough to survive platform float noise.
 *
 * Unitless 0-1 shares are the exception: a legend prints `fraction` at 0.1%, so two decimals would
 * snapshot 0.5451 and 0.5549 identically while the reader sees "54.5%" and "55.5%". Those keys are
 * rounded a decade finer than they are rendered, so no visible difference can hide in a golden.
 */

import type { Scene } from '@/lib/diagram/types.ts';

const RATIO_KEYS: ReadonlySet<string> = new Set(['fraction']);
const RATIO_DIGITS = 4;

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
      Object.entries(value).map(([key, entry]) => [
        key,
        clone(entry, RATIO_KEYS.has(key) ? Math.max(digits, RATIO_DIGITS) : digits),
      ]),
    );
  }

  return value;
}

/** Snapshot-ready copy of a scene: every number rounded, everything else untouched. */
export function goldenScene(scene: Scene, digits = 2): unknown {
  return clone(scene, digits);
}
