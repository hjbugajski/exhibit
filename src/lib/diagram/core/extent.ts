/*
 * The caps stop the engine from hanging; nothing stops it from emitting a scene that cannot be
 * looked at. A chain of 399 nodes lays out to 77 × 34 362 — legal, finite, and a 1.4px thread once
 * `fit="scale"` has fitted it into a column. A hundred sibling clusters do the same sideways.
 *
 * So the engine says so, and a binding decides. This is deliberately a diagnostic rather than an
 * automatic switch to `fit="scroll"`: the auto-fit behaviour was cut from the contract on purpose,
 * and a library that silently overrides the fit its caller asked for is worse than one that
 * explains itself.
 */

import type { Size } from '../types.ts';
import type { Reporter } from './diagnostics.ts';

/** Width:height (or height:width) past which scaling to fit destroys the drawing. */
const MAX_ASPECT = 12;

/** Longest side, in scene units, past which a fitted drawing is thinner than its own stroke. */
const MAX_EXTENT = 6000;

function round(value: number): number {
  return Math.round(value);
}

/** Warns when the scene is too long, too tall or too thin to read at a fitted size. */
export function reportExtent(report: Reporter, size: Size): void {
  const long = Math.max(size.width, size.height);
  const short = Math.min(size.width, size.height);
  const aspect = short > 0 ? long / short : Number.POSITIVE_INFINITY;

  if (long <= MAX_EXTENT && aspect <= MAX_ASPECT) {
    return;
  }

  report.warn(
    'extreme-extent',
    `This drawing is ${round(size.width)}×${round(size.height)} units (${round(aspect)}:1). Scaling it to fit a column will make it unreadable — scroll it at natural size instead.`,
  );
}
