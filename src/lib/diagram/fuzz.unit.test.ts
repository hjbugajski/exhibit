/*
 * The whole corpus, damaged, against the whole contract.
 *
 * The per-family fuzz tests each guard one parser against one hard-coded seed source, and they
 * assert only that nothing threw — a scene full of `NaN` passes all of them. This one runs the real
 * `parse -> layout` pipeline over every fixture in the corpus, rotates the mutation seed so CI does
 * not re-explore an identical set forever, and asserts the property that actually matters: either
 * an error diagnostic explains why nothing was drawn, or what was drawn is well formed.
 *
 * Sized for CI at roughly four thousand cases. `DIAGRAM_FUZZ=wide` quadruples the seed rotation for
 * a deliberate local run; that is where a new failure is most likely to be found, and where the
 * repro seed comes from once it is.
 */

import { describe, expect, it } from 'vitest';

import { loadCorpus } from '@testing/diagram/corpus.ts';
import { assertContractHolds, mutations } from '@testing/diagram/fuzz.ts';

import { defaultShapes } from './core/shapes/registry.ts';
import { metricsMeasurer } from './core/text/measurers.ts';
import { defaultMetrics } from './metrics.ts';

const SEEDS =
  process.env.DIAGRAM_FUZZ === 'wide'
    ? [3, 11, 29, 47, 71, 97, 131, 173, 211, 257, 307, 367]
    : [3, 11, 29];
const PER_SEED = 60;

const options = {
  build: { measurer: metricsMeasurer },
  shapes: defaultShapes,
  metrics: defaultMetrics,
};

const corpus = loadCorpus();

describe('the pipeline holds its contract on mutated sources', () => {
  it('has a corpus to mutate', () => {
    expect(corpus.length).toBeGreaterThan(20);
    expect(new Set(corpus.map((fixture) => fixture.family)).size).toBe(4);
  });

  it.each(corpus)('$name', ({ source }) => {
    for (const seed of SEEDS) {
      for (const mutated of mutations(source, PER_SEED, seed)) {
        assertContractHolds(mutated, options);
      }
    }
  });

  // The undamaged fixtures must hold it too, or the mutation runs above are measuring the wrong
  // baseline — and this is the case that fails first when a family changes.
  it.each(corpus)('$name, undamaged', ({ source }) => {
    assertContractHolds(source, options);
  });
});
