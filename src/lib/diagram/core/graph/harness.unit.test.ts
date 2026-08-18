/*
 * Guards on the shared diagram test harness itself. A corpus loader that silently returns nothing,
 * or a fuzzer that is not actually deterministic, would make every suite built on them pass
 * vacuously.
 */

import { describe, expect, it } from 'vitest';

import { loadCorpus } from '@testing/diagram/corpus.ts';
import { createRandom, mutations } from '@testing/diagram/fuzz.ts';
import { goldenScene } from '@testing/diagram/golden.ts';
import { layoutOptions, model } from '@testing/diagram/graph-fixtures.ts';
import { assertNoEdgeThroughNode, assertPathQuality } from '@testing/diagram/invariants.ts';

import type { GraphScene, LabelBox, Point, SceneNode } from '../../types.ts';
import { defaultShapes } from '../shapes/registry.ts';
import { layoutGraph } from './layout-graph.ts';

describe('corpus loader', () => {
  it('finds fixtures and tags each with its family', () => {
    const corpus = loadCorpus();

    expect(corpus.length).toBeGreaterThan(4);
    expect(new Set(corpus.map((fixture) => fixture.family))).toContain('flowchart');

    for (const fixture of corpus) {
      expect(fixture.source.trim().length).toBeGreaterThan(0);
    }
  });

  it('filters by family', () => {
    const pie = loadCorpus('pie');

    expect(pie.length).toBeGreaterThan(0);

    for (const fixture of pie) {
      expect(fixture.family).toBe('pie');
    }
  });
});

describe('fuzz helper', () => {
  const source = 'flowchart TD\n  A[Start] --> B{Ready?}\n  B --> C[Done]\n';

  it('is deterministic for a seed and different across seeds', () => {
    expect(mutations(source, 20, 7)).toEqual(mutations(source, 20, 7));
    expect(mutations(source, 20, 7)).not.toEqual(mutations(source, 20, 8));
  });

  it('actually changes the source most of the time', () => {
    const changed = mutations(source, 50, 3).filter((entry) => entry !== source);

    expect(changed.length).toBeGreaterThan(40);
  });

  it('draws a stable, bounded sequence', () => {
    const random = createRandom(1);
    const draws = Array.from({ length: 100 }, () => random());

    for (const draw of draws) {
      expect(draw).toBeGreaterThanOrEqual(0);
      expect(draw).toBeLessThan(1);
    }

    expect(draws).toEqual(Array.from({ length: 100 }, createRandom(1)));
  });
});

describe('path quality assert', () => {
  const scene = (d: string): GraphScene => ({
    kind: 'graph',
    family: 'flowchart',
    size: { width: 100, height: 100 },
    nodes: [],
    clusters: [],
    edges: [
      {
        id: 'e',
        source: 'a',
        target: 'b',
        points: [],
        d,
        line: 'solid',
        arrow: 'arrow',
        startArrow: 'none',
        reversed: false,
        classes: [],
      },
    ],
  });

  it('passes a rounded elbow, an S-curve and a knocked-out label gap', () => {
    expect(() =>
      assertPathQuality(scene('M0,0L0,34Q0,40 6,40L40,40M60,40L94,40C100,40 100,60 100,66L100,90')),
    ).not.toThrow();
  });

  it.each([
    { name: 'a number past two decimals', d: 'M0,0L0,40.125' },
    { name: 'a number that is not one', d: 'M0,0L0,NaN' },
    { name: 'a line that draws nothing', d: 'M0,0L0,40L0,40L20,40' },
    { name: 'a vertex on a straight line', d: 'M0,0L0,20L0,40' },
    { name: 'a curve whose tangent breaks', d: 'M0,0L0,40Q20,20 40,40' },
  ])('fails on $name', ({ d }) => {
    expect(() => assertPathQuality(scene(d))).toThrow();
  });
});

/*
 * The probe box this assert measures a node by is the largest one its outline contains, and finding
 * it takes a sweep: the 45-degree hit is one point on the outline, and on a node far wider than it
 * is tall it corners a square barely a quarter of the node's area — which is most of a flowchart,
 * since `rect` is the default shape.
 */
describe('edge-through-node assert', () => {
  const m = layoutOptions().metrics;
  const label: LabelBox = { lines: [], width: 0, height: 0, lineHeight: 0, baseline: 0 };
  const node = (over: Partial<SceneNode>): SceneNode => ({
    id: 'n',
    x: 100,
    y: 100,
    width: 152,
    height: 38,
    shape: 'rect',
    outline: '',
    label,
    classes: [],
    ...over,
  });
  const scene = (over: Partial<SceneNode>, points: Point[]): GraphScene => ({
    kind: 'graph',
    family: 'flowchart',
    size: { width: 200, height: 200 },
    nodes: [node(over)],
    clusters: [],
    edges: [
      {
        id: 'e',
        source: 'a',
        target: 'b',
        points,
        d: '',
        line: 'solid',
        arrow: 'arrow',
        startArrow: 'none',
        reversed: false,
        classes: [],
      },
    ],
  });
  const check = (over: Partial<SceneNode>, points: Point[]): void => {
    assertNoEdgeThroughNode(scene(over, points), { shapes: defaultShapes, metrics: m });
  };

  it('catches a stroke through the wide half of a rect', () => {
    // 40px inside the left half of the node — well beyond the square a 45-degree probe would cover.
    expect(() =>
      check({}, [
        { x: 60, y: 60 },
        { x: 60, y: 140 },
      ]),
    ).toThrow();
  });

  it('passes a stroke that clears the node', () => {
    expect(() =>
      check({}, [
        { x: 10, y: 60 },
        { x: 10, y: 140 },
      ]),
    ).not.toThrow();
  });

  it('passes a stroke through a diamond corner it never enters', () => {
    // Well inside the extent, and clear of the outline the whole way: the shrink is what makes a
    // stroke rounding a diamond's point correct, and a bounding box would call this a hit.
    expect(() =>
      check({ shape: 'diamond' }, [
        { x: 155, y: 112 },
        { x: 172, y: 115 },
      ]),
    ).not.toThrow();
  });
});

describe('golden helper', () => {
  it('rounds every number to two decimals and leaves the rest alone', () => {
    const scene = layoutGraph(
      model({ nodes: ['a', 'b'], edges: [{ from: 'a', to: 'b' }] }),
      layoutOptions(),
    ).scene;
    const golden = goldenScene(scene as never) as { nodes: { x: number; id: string }[] };

    expect(golden.nodes[0]?.id).toBe('a');
    expect(golden.nodes[0]?.x).toBe(
      Math.round((scene?.kind === 'graph' ? (scene.nodes[0]?.x ?? 0) : 0) * 100) / 100,
    );
  });
});
