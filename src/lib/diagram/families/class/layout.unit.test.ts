/*
 * End to end for the class family: real sources through the parser, `to-graph.ts` and the shared
 * layered engine. The family is not in `builtinFamilies` yet, so this drives `classFamily` directly
 * with the options `buildDiagram` would have resolved rather than going through it.
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
import type { BuildOptions, GraphScene } from '../../types.ts';
import { classFamily } from './family.ts';
import type { ClassIR } from './ir.ts';
import { parseClass } from './parse.ts';

const options: BuildOptions = { measurer: metricsMeasurer };
const metrics = resolveMetrics();
const corpus = loadCorpus('class');

function parsed(source: string): ClassIR {
  const report = new Reporter();
  const result = parseClass(source, { report, limits: defaultLimits });

  expect(result.ir, JSON.stringify(result.diagnostics)).not.toBeNull();
  expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);

  return result.ir as ClassIR;
}

function built(source: string): GraphScene {
  const laid = classFamily.layout(parsed(source), resolveLayoutOptions(options));

  expect(laid.scene, JSON.stringify(laid.diagnostics)).not.toBeNull();
  expect(laid.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);

  return laid.scene as GraphScene;
}

describe('class layout', () => {
  it('has fixtures to run', () => {
    expect(corpus.length).toBeGreaterThan(3);
  });

  it.each(corpus)('$name holds every layout invariant', ({ source }) => {
    assertLayoutInvariants(built(source), {
      direction: parsed(source).direction,
      shapes: defaultShapes,
      metrics,
    });
  });

  it.each(corpus)('$name matches its golden scene', ({ source }) => {
    expect(goldenScene(built(source))).toMatchSnapshot();
  });

  it.each(corpus)('$name lays out identically twice', ({ source }) => {
    assertDeterministic(() => built(source));
  });
});

describe('class scenes', () => {
  it('draws the compartments as the lines of one label', () => {
    const scene = built(
      `classDiagram
  class Shape {
    <<interface>>
    +int sides
    +area() float
  }`,
    );

    expect(scene.nodes[0]?.label.lines).toEqual([
      '«interface»',
      'Shape',
      '+int sides',
      '+area() float',
    ]);
  });

  it('grows the box for the widest member line', () => {
    const plain = built('classDiagram\n  class Shape');
    const full = built('classDiagram\n  class Shape {\n    +circumferenceInMetres() float\n  }');

    expect(full.nodes[0]?.width).toBeGreaterThan(plain.nodes[0]?.width as number);
    expect(full.nodes[0]?.height).toBeGreaterThan(plain.nodes[0]?.height as number);
  });

  it('puts the marker on the end it was written at', () => {
    const scene = built('classDiagram\n  Animal <|-- Duck\n  Duck --|> Bird');
    const [up, down] = scene.edges;

    expect(up).toMatchObject({ startArrow: 'arrow', arrow: 'none' });
    expect(up?.startArrowD).toBeTruthy();
    expect(down).toMatchObject({ startArrow: 'none', arrow: 'arrow' });
  });

  it('names each relation in `classes` so the two diamonds stay distinguishable', () => {
    const scene = built(
      `classDiagram
  Order *-- Line
  Order o-- Coupon
  Order ..> Ledger
  Payment <|.. Card
  Region -- Zone`,
    );

    expect(scene.edges.map((edge) => edge.classes)).toEqual([
      ['composition'],
      ['aggregation'],
      ['dependency'],
      ['realization'],
      ['link'],
    ]);
    expect(scene.edges.map((edge) => edge.line)).toEqual([
      'solid',
      'solid',
      'dotted',
      'dotted',
      'solid',
    ]);
  });

  it('carries cardinalities onto the edge label beside the relation text', () => {
    const scene = built('classDiagram\n  Customer "1" --> "many" Order : places');

    expect(scene.edges[0]?.label?.box.lines).toEqual(['places', '1 .. many']);
  });

  it('keeps the dots on the side a missing cardinality would have been', () => {
    const scene = built('classDiagram\n  Customer "1" --> Order\n  Cart --> "many" Item');

    expect(scene.edges[0]?.label?.box.lines).toEqual(['1 ..']);
    expect(scene.edges[1]?.label?.box.lines).toEqual(['.. many']);
  });

  it('draws a namespace as a cluster around its classes', () => {
    const scene = built(
      `classDiagram
  namespace billing {
    class Invoice
    class Money
  }
  class Loose
  Invoice --> Loose`,
    );
    const cluster = scene.clusters[0];
    const inner = scene.nodes.find((node) => node.id === 'Invoice');

    expect(scene.clusters).toHaveLength(1);
    expect(cluster?.title?.box.lines).toEqual(['billing']);
    expect(inner?.x).toBeGreaterThan(cluster?.box.x as number);
    expect(inner?.x).toBeLessThan((cluster?.box.x as number) + (cluster?.box.width as number));
  });

  it('lays a class diagram out left to right when asked', () => {
    const scene = built('classDiagram\n  direction LR\n  A --> B');
    const [a, b] = scene.nodes;

    expect((b?.x as number) - (a?.x as number)).toBeGreaterThan(0);
    expect(Math.abs((b?.y as number) - (a?.y as number))).toBeLessThan(1);
  });

  it('produces an empty scene for a header with nothing in it', () => {
    const scene = built('classDiagram');

    expect(scene).toMatchObject({ kind: 'graph', family: 'class', nodes: [], edges: [] });
  });

  it('carries accessibility text onto the scene', () => {
    const scene = built(
      'classDiagram\n  accTitle: Domain model\n  accDescr: Orders and invoices\n  A --> B',
    );

    expect(scene).toMatchObject({ title: 'Domain model', description: 'Orders and invoices' });
  });

  it('carries no colour-valued string into the scene', () => {
    const scene = built('classDiagram\n  class Foo:::highlight\n  Foo --> Bar');

    expect(JSON.stringify(scene)).not.toMatch(/#[\da-f]{3,8}\b|rgb\(|oklch\(/i);
  });
});
