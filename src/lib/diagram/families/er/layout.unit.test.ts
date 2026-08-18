/*
 * End to end for the ER family: real sources through the parser, `to-graph.ts` and the shared
 * layered engine. The family is not registered yet, so the pipeline is driven directly rather than
 * through `buildDiagram` — `resolveLayoutOptions` is the same option resolution a build would do.
 */

import { describe, expect, it } from 'vitest';

import { loadCorpus } from '@testing/diagram/corpus.ts';
import { goldenScene } from '@testing/diagram/golden.ts';
import { assertDeterministic, assertLayoutInvariants } from '@testing/diagram/invariants.ts';

import { defaultLimits, resolveLayoutOptions } from '../../build.ts';
import { Reporter } from '../../core/diagnostics.ts';
import { defaultShapes } from '../../core/shapes/registry.ts';
import { metricsMeasurer } from '../../core/text/measurers.ts';
import { resolveMetrics } from '../../metrics.ts';
import type { GraphScene } from '../../types.ts';
import { erFamily } from './family.ts';
import type { ErIR } from './ir.ts';

const options = resolveLayoutOptions({ measurer: metricsMeasurer });
const metrics = resolveMetrics();
const corpus = loadCorpus('er');

function built(source: string): GraphScene {
  const report = new Reporter();
  const parsed = erFamily.parse(source, { report, limits: defaultLimits });

  expect(parsed.ir, JSON.stringify(parsed.diagnostics)).not.toBeNull();
  expect(parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);

  const laid = erFamily.layout(parsed.ir as ErIR, options);

  expect(laid.scene, JSON.stringify(laid.diagnostics)).not.toBeNull();

  return laid.scene as GraphScene;
}

describe('er layout', () => {
  it('has fixtures to run', () => {
    expect(corpus.length).toBeGreaterThan(3);
  });

  it.each(corpus)('$name holds every layout invariant', ({ source }) => {
    assertLayoutInvariants(built(source), { direction: 'TB', shapes: defaultShapes, metrics });
  });

  it.each(corpus)('$name matches its golden scene', ({ source }) => {
    expect(goldenScene(built(source))).toMatchSnapshot();
  });

  it.each(corpus)('$name lays out identically twice', ({ source }) => {
    assertDeterministic(() => goldenScene(built(source)));
  });
});

describe('er scenes', () => {
  it('detects only its own header', () => {
    expect(erFamily.detect('erDiagram')).toBe(true);
    expect(erFamily.detect('stateDiagram-v2')).toBe(false);
  });

  it('sizes an entity box around its attribute rows', () => {
    const plain = built('erDiagram\n  CUSTOMER');
    const filled = built('erDiagram\n  CUSTOMER {\n    string name PK\n    int age\n  }');

    expect(filled.nodes[0]?.height).toBeGreaterThan(plain.nodes[0]?.height as number);
    expect(filled.nodes[0]?.label.lines).toEqual(['CUSTOMER', 'string name PK', 'int age']);
  });

  it('lays related entities out along the rank axis', () => {
    const scene = built('erDiagram\n  CUSTOMER ||--o{ ORDER : places');
    const [customer, order] = scene.nodes;

    expect(order?.y).toBeGreaterThan(customer?.y as number);
  });

  it('draws a relationship with no arrowhead at either end', () => {
    const scene = built('erDiagram\n  A ||--o{ B : has');

    expect(scene.edges[0]).toMatchObject({ arrow: 'none', startArrow: 'none' });
    expect(scene.edges[0]?.arrowD).toBeUndefined();
    expect(scene.edges[0]?.startArrowD).toBeUndefined();
  });

  it('carries the cardinality of each end onto the scene edge', () => {
    const scene = built('erDiagram\n  A |o..|{ B : has');

    expect(scene.edges[0]?.classes).toEqual(['er-source-zero-or-one', 'er-target-one-or-more']);
    expect(scene.edges[0]?.line).toBe('dotted');
  });

  it('produces an empty scene for a header with nothing in it', () => {
    expect(built('erDiagram')).toMatchObject({ kind: 'graph', family: 'er', nodes: [], edges: [] });
  });

  it('carries accessibility text onto the scene', () => {
    const scene = built(
      'erDiagram\n  accTitle: Orders\n  accDescr: Who buys what\n  A ||--|| B : x',
    );

    expect(scene).toMatchObject({ title: 'Orders', description: 'Who buys what' });
  });
});
