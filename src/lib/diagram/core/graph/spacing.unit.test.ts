import { describe, expect, it } from 'vitest';

import { defaultMetrics } from '../../metrics.ts';
import { separate, strokeGap } from './spacing.ts';

const m = defaultMetrics;

/** Every neighbouring pair at least its gap apart, in the order they were handed over. */
function gapsOf(values: readonly number[]): number[] {
  return values.slice(1).map((value, index) => value - (values[index] as number));
}

describe('separate', () => {
  it('leaves a set that already fits exactly where it is', () => {
    expect(separate([-20, 0, 20], [9, 9], -60, 60)).toEqual([-20, 0, 20]);
  });

  it('opens a crowd symmetrically about what it asked for', () => {
    // The whole point: a one-directional sweep answers 0, 9, 18 here and puts the middle of the
    // group a full gap off the middle of the side.
    expect(separate([0, 0, 0], [9, 9], -60, 60)).toEqual([-9, 0, 9]);
  });

  it('moves nobody when one of a pair is already clear', () => {
    expect(separate([0, 40], [9], -60, 60)).toEqual([0, 40]);
  });

  it('shifts the block rather than reshaping it when it runs off an end', () => {
    expect(separate([55, 58], [9], -60, 60)).toEqual([51, 60]);
  });

  it('keeps a block inside the bounds when the gaps fit but the fit does not', () => {
    // Six edges crowding one face: the gaps alone (18) fit the window (32), so the even-spread
    // escape hatch never fires, but the isotonic fit spans further than that and the two ends run
    // off in opposite directions. A single rigid shift cancels itself out and leaves the last value
    // past `max` — a port off the side it was asked for.
    expect(separate([-16, -16, 16], [9, 9], -16, 16)).toEqual([-16, -7, 16]);
  });

  it('spreads evenly when the bounds cannot hold the gaps', () => {
    expect(separate([0, 0, 0], [9, 9], -5, 5)).toEqual([-5, 0, 5]);
  });

  it('respects a gap of its own for each pair', () => {
    const out = separate([0, 0, 0], [0, 9], -60, 60);

    expect(out[0]).toBe(out[1]);
    expect(gapsOf(out)).toEqual([0, 9]);
  });

  it('opens a crowd around a held value rather than splitting the difference', () => {
    // The held one is already where it has to be to draw straight; the other is bent either way,
    // so it is the one that moves. Unheld, the pair comes out at -5.5 and 3.5 and both are bent.
    expect(separate([-2, 0], [9], -46, 46, [false, true])).toEqual([-9, 0]);
  });

  it('splits the move between two held values that cannot both have what they asked for', () => {
    expect(separate([0, 0], [9], -46, 46, [true, true])).toEqual([-4.5, 4.5]);
  });

  it('clamps a lone value into the bounds', () => {
    expect(separate([80], [], -60, 60)).toEqual([60]);
    expect(separate([], [], -60, 60)).toEqual([]);
  });

  it('keeps the order it was given even when the ideals cross', () => {
    expect(separate([10, 0], [9], -60, 60)).toEqual([0.5, 9.5]);
  });

  it('measures a slot as an arrowhead with a stroke either side of it', () => {
    expect(strokeGap(m)).toBe(m.arrowWidth + m.strokeWidth * 2);
  });
});
