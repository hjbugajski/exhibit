/*
 * One-dimensional separation, shared by every pass that has to keep parallel geometry apart: ports
 * on a side, lanes in a gutter, legs in a rank gap.
 *
 * All three want the same thing — keep the order, honour a minimum gap, move as little as possible —
 * and all three used to sweep once from the low end, which is not that. A sweep pushes the whole set
 * off the first element's ideal: three ports that all want the middle come out at 0, +gap, +2*gap and
 * the clamp at the far end drags them back only far enough to fit, so the group ends up lopsided and
 * an edge whose ends already lined up picks up a jog for nothing.
 */

import type { DiagramMetrics } from '../../metrics.ts';

/** Room two strokes need to read as two: an arrowhead's width, with a stroke of clearance either side. */
export function strokeGap(m: DiagramMetrics): number {
  return m.arrowWidth + m.strokeWidth * 2;
}

/**
 * `ideal` in the order they must stay in, pushed apart until each neighbouring pair is at least
 * `gaps[i]` apart, inside `[min, max]`, at the smallest total squared displacement.
 *
 * Subtracting the running gap turns "at least this far apart" into "non-decreasing", which is
 * isotonic regression: merge any pair that comes out backwards into one block at their mean and
 * repeat. Every block then has to start somewhere in `[min, max - span]`, the window wide enough to
 * hold the whole run of gaps, so each block's mean is clamped into it as it is emitted. Clamping is
 * monotone, so the block order and the gaps between members survive it, and the result is the
 * closest fit that respects the bounds. Only a set too wide for the bounds has to give up its shape,
 * and then evenly spread is the most room there is to hand out.
 *
 * @param held values that must not give way, when anything else in their block can give way for
 * them. Displacement is a fair trade between two values that both merely prefer where they are, and
 * the wrong trade when one of them is already exactly right: an edge whose end is on the line its
 * run arrives on is drawn straight, and a mean splits the difference by bending it. A block with one
 * held member takes that member's target and the rest of the block moves around it; a block with
 * several takes their mean, since they cannot all have what they asked for. This is the limit of
 * weighting held values arbitrarily heavily, so every merged mean still lands between the two it
 * came from and the fit stays isotonic.
 */
export function separate(
  ideal: readonly number[],
  gaps: readonly number[],
  min: number,
  max: number,
  held: readonly boolean[] = [],
): number[] {
  if (ideal.length === 0) {
    return [];
  }

  if (ideal.length === 1) {
    return [Math.min(Math.max(ideal[0] as number, min), max)];
  }

  const offsets = [0];

  for (const [index, gap] of gaps.entries()) {
    offsets.push((offsets[index] as number) + gap);
  }

  const span = offsets.at(-1) as number;

  if (span > max - min) {
    return offsets.map((offset) => min + (span === 0 ? 0 : ((max - min) * offset) / span));
  }

  // Blocks of the isotonic fit: the mean of the members' targets, how many of them there are, and
  // how many of those are held — the mean is over the held ones alone whenever there is one.
  const blocks: { mean: number; count: number; hold: number }[] = [];

  for (const [index, value] of ideal.entries()) {
    let mean = value - (offsets[index] as number);
    let count = 1;
    let hold = held[index] ? 1 : 0;

    while (blocks.length > 0 && (blocks.at(-1) as { mean: number }).mean > mean) {
      const previous = blocks.pop() as { mean: number; count: number; hold: number };
      const holds = previous.hold + hold;

      mean =
        holds > 0
          ? (previous.mean * previous.hold + mean * hold) / holds
          : (previous.mean * previous.count + mean * count) / (previous.count + count);
      count += previous.count;
      hold = holds;
    }

    blocks.push({ mean, count, hold });
  }

  const out: number[] = [];

  for (const block of blocks) {
    const mean = Math.min(Math.max(block.mean, min), max - span);

    for (let i = 0; i < block.count; i += 1) {
      out.push(mean + (offsets[out.length] as number));
    }
  }

  return out;
}
