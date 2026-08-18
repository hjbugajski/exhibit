/*
 * End to end for the state family: real sources through `buildDiagram`, so the family registration,
 * the parser, `to-graph.ts` and the shared layered engine are all under test at once.
 */

import { describe, expect, it } from 'vitest';

import { loadCorpus } from '@testing/diagram/corpus.ts';
import { goldenScene } from '@testing/diagram/golden.ts';
import { assertDeterministic, assertLayoutInvariants } from '@testing/diagram/invariants.ts';

import { buildDiagram, defaultLimits } from '../../build.ts';
import { Reporter } from '../../core/diagnostics.ts';
import { defaultShapes } from '../../core/shapes/registry.ts';
import { metricsMeasurer } from '../../core/text/measurers.ts';
import { resolveMetrics } from '../../metrics.ts';
import type { BuildOptions, GraphScene } from '../../types.ts';
import type { StateIR } from './ir.ts';
import { parseState } from './parse.ts';

const options: BuildOptions = { measurer: metricsMeasurer };
const metrics = resolveMetrics();
const corpus = loadCorpus('state');

function built(source: string): GraphScene {
  const result = buildDiagram(source, options);

  expect(result.family).toBe('state');
  expect(result.scene, JSON.stringify(result.diagnostics)).not.toBeNull();
  expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);

  return result.scene as GraphScene;
}

function directionOf(source: string): StateIR['direction'] {
  const parsed = parseState(source, { report: new Reporter(), limits: defaultLimits });

  return (parsed.ir as StateIR).direction;
}

describe('state layout', () => {
  it('has fixtures to run', () => {
    expect(corpus.length).toBeGreaterThan(3);
  });

  it.each(corpus)('$name holds every layout invariant', ({ source }) => {
    assertLayoutInvariants(built(source), {
      direction: directionOf(source),
      shapes: defaultShapes,
      metrics,
    });
  });

  it.each(corpus)('$name matches its golden scene', ({ source }) => {
    expect(goldenScene(built(source))).toMatchSnapshot();
  });

  it.each(corpus)('$name lays out identically twice', ({ source }) => {
    assertDeterministic(() => buildDiagram(source, options));
  });
});

describe('state scenes', () => {
  it('draws composite states as clusters around their members', () => {
    const scene = built(
      `stateDiagram-v2
  [*] --> Active
  state Active {
    [*] --> Warming
    Warming --> Ready
  }
  Active --> [*]`,
    );
    const cluster = scene.clusters[0];
    const inner = scene.nodes.find((node) => node.id === 'Warming');

    expect(scene.clusters).toHaveLength(1);
    expect(cluster?.title?.box.lines).toEqual(['Active']);
    expect(inner?.x).toBeGreaterThan(cluster?.box.x as number);
    expect(inner?.x).toBeLessThan((cluster?.box.x as number) + (cluster?.box.width as number));
  });

  it('nests a cluster inside its parent box', () => {
    const scene = built(
      `stateDiagram-v2
  state Outer {
    state Inner {
      A --> B
    }
    Inner --> C
  }`,
    );
    const outer = scene.clusters[0];
    const inner = outer?.children[0];

    expect(inner?.id).toBe('Inner');
    expect(inner?.box.x).toBeGreaterThanOrEqual(outer?.box.x as number);
    expect((inner?.box.x as number) + (inner?.box.width as number)).toBeLessThanOrEqual(
      (outer?.box.x as number) + (outer?.box.width as number),
    );
  });

  it('sizes markers from their shape, not from a label', () => {
    const scene = built('stateDiagram-v2\n  [*] --> A\n  A --> [*]');
    const start = scene.nodes.find((node) => node.shape === 'state-start');
    const end = scene.nodes.find((node) => node.shape === 'state-end');

    expect(start).toMatchObject({ width: 14, height: 14 });
    expect(end).toMatchObject({ width: 18, height: 18 });
    expect(start?.label.lines).toEqual([]);
  });

  it('draws a note as a dotted headless edge to its own node', () => {
    const scene = built('stateDiagram-v2\n  A --> B\n  note right of A : careful');
    const note = scene.nodes.find((node) => node.shape === 'state-note');
    const edge = scene.edges.find((entry) => entry.target === note?.id);

    expect(note?.label.lines).toEqual(['careful']);
    expect(edge).toMatchObject({ line: 'dotted', arrow: 'none' });
    expect(edge?.arrowD).toBeUndefined();
  });

  it("spreads a fork bar's edges along it instead of pinching them at its centre", () => {
    const scene = built(
      'stateDiagram-v2\n  [*] --> F\n  state F <<fork>>\n  F --> Indexed\n  F --> Notified',
    );
    const bar = scene.nodes.find((node) => node.shape === 'state-bar');
    const exits = scene.edges
      .filter((edge) => edge.source === 'F')
      .map((edge) => edge.points[0]?.x as number);

    expect(exits).toHaveLength(2);
    expect(Math.abs((exits[0] as number) - (exits[1] as number))).toBeCloseTo(
      (bar?.width as number) / 3,
      6,
    );
  });

  it('centres a join bar between its branches, the way the fork above them is', () => {
    const scene = built(
      `stateDiagram-v2
  [*] --> F
  state F <<fork>>
  F --> A
  F --> B
  A --> J
  B --> J
  state J <<join>>
  J --> [*]`,
    );
    const at = (id: string): number => scene.nodes.find((node) => node.id === id)?.x as number;
    const middle = (at('A') + at('B')) / 2;

    expect(at('F')).toBeCloseTo(middle, 6);
    expect(at('J')).toBeCloseTo(middle, 6);
  });

  it('turns the fork bar across the flow when the diagram runs left to right', () => {
    const scene = built(
      'stateDiagram-v2\n  direction LR\n  [*] --> F\n  state F <<fork>>\n  F --> A\n  F --> B',
    );
    const bar = scene.nodes.find((node) => node.shape === 'state-bar');

    expect(bar?.height).toBeGreaterThan(bar?.width as number);
  });

  it('puts a note on the side its placement asks for', () => {
    const scene = built(
      'stateDiagram-v2\n  A --> B\n  note left of A : before\n  note right of A : after',
    );
    const anchor = scene.nodes.find((node) => node.id === 'A');
    const notes = scene.nodes.filter((node) => node.shape === 'state-note');

    expect(notes).toHaveLength(2);
    expect(notes[0]?.x).toBeLessThan(anchor?.x as number);
    expect(notes[1]?.x).toBeGreaterThan(anchor?.x as number);
  });

  it('lays a state diagram out left to right when asked', () => {
    const scene = built('stateDiagram-v2\n  direction LR\n  A --> B');
    const [a, b] = scene.nodes;

    expect((b?.x as number) - (a?.x as number)).toBeGreaterThan(0);
    expect(Math.abs((b?.y as number) - (a?.y as number))).toBeLessThan(1);
  });

  it('produces an empty scene for a header with nothing in it', () => {
    const scene = built('stateDiagram-v2');

    expect(scene).toMatchObject({ kind: 'graph', family: 'state', nodes: [], edges: [] });
  });

  it('carries accessibility text onto the scene', () => {
    const scene = built(
      'stateDiagram-v2\n  accTitle: Publish flow\n  accDescr: Draft then published\n  A --> B',
    );

    expect(scene).toMatchObject({ title: 'Publish flow', description: 'Draft then published' });
  });
});
