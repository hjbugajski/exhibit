import { describe, expect, it } from 'vitest';

import { defaultLimits } from '../../build.ts';
import { Reporter } from '../../core/diagnostics.ts';
import type { GraphModel } from '../../core/graph/model.ts';
import type { Diagnostic } from '../../types.ts';
import { parseFlowchart } from './parse.ts';
import { toGraphModel } from './to-graph.ts';

function build(source: string): { model: GraphModel; diagnostics: readonly Diagnostic[] } {
  const report = new Reporter();
  const { ir } = parseFlowchart(source, { report, limits: defaultLimits });

  expect(ir, JSON.stringify(report.diagnostics)).not.toBeNull();

  const sink = new Reporter();

  return { model: toGraphModel(ir as NonNullable<typeof ir>, sink), diagnostics: sink.diagnostics };
}

function graph(source: string): GraphModel {
  return build(source).model;
}

describe('toGraphModel', () => {
  it('tags the model with the family and direction', () => {
    const model = graph('flowchart LR\n A --> B');

    expect(model.family).toBe('flowchart');
    expect(model.direction).toBe('LR');
  });

  it('carries labels through as already-split lines', () => {
    const model = graph('flowchart TD\n A["one<br/>two"] -->|"go<br/>now"| B');

    expect(model.nodes[0]?.label).toEqual(['one', 'two']);
    expect(model.edges[0]?.label).toEqual(['go', 'now']);
  });

  it('omits the label key entirely when an edge has none', () => {
    const model = graph('flowchart TD\n A --> B');

    expect(model.edges[0]).not.toHaveProperty('label');
  });

  it('gives every node a shape, classes and a span', () => {
    const model = graph('flowchart TD\n A{Q}:::danger --> B');
    const node = model.nodes[0];

    expect(node).toMatchObject({ id: 'A', shape: 'diamond', classes: ['danger'] });
    expect(node?.span?.line).toBe(2);
  });

  it('keeps edge ids unique and in declaration order', () => {
    const model = graph('flowchart TD\n A --> B\n A --> B\n B --> A');

    expect(model.edges.map((edge) => edge.id)).toEqual(['A->B#0', 'A->B#1', 'B->A#2']);
    expect(new Set(model.edges.map((edge) => edge.id)).size).toBe(3);
  });

  it('gives every edge a weight the engine can use', () => {
    const model = graph('flowchart TD\n A --> B');

    expect(model.edges[0]?.weight).toBe(1);
  });

  it('carries link length through as minLen', () => {
    const model = graph('flowchart TD\n A ----> B');

    expect(model.edges[0]?.minLen).toBe(3);
  });

  it('marks an invisible link as its own line kind, not an author class', () => {
    const model = graph('flowchart TD\n A ~~~ B\n B --> C');

    expect(model.edges[0]?.line).toBe('invisible');
    expect(model.edges[0]?.classes).toEqual([]);
    expect(model.edges[1]?.line).toBe('solid');
  });

  it('projects subgraphs onto the cluster tree', () => {
    const model = graph(
      'flowchart TD\n subgraph outer [Outer]\n  subgraph inner\n   A --> B\n  end\n end',
    );

    expect(model.clusters).toEqual([
      expect.objectContaining({ id: 'outer', parent: null, label: ['Outer'] }),
      expect.objectContaining({ id: 'inner', parent: 'outer', label: ['inner'] }),
    ]);
    expect(model.nodes.every((node) => node.cluster === 'inner')).toBe(true);
  });

  it('leaves a cluster without a title unlabelled', () => {
    const model = graph('flowchart TD\n subgraph\n  A\n end');

    expect(model.clusters[0]).not.toHaveProperty('label');
  });

  it('maps accTitle and accDescr onto the scene title and description', () => {
    const model = graph('flowchart TD\n accTitle: Publish\n accDescr: How it ships\n A --> B');

    expect(model.title).toBe('Publish');
    expect(model.description).toBe('How it ships');
  });

  it('omits title and description when the source has neither', () => {
    const model = graph('flowchart TD\n A --> B');

    expect(model).not.toHaveProperty('title');
    expect(model).not.toHaveProperty('description');
  });

  it('attaches an edge naming a subgraph to a member of it, and says so', () => {
    const { model, diagnostics } = build(
      'flowchart TD\n Start --> server\n subgraph server\n  A --> B\n end',
    );

    expect(model.nodes.map((node) => node.id)).toEqual(['Start', 'A', 'B']);
    expect(model.edges[0]).toMatchObject({ source: 'Start', target: 'A' });
    expect(diagnostics).toEqual([
      expect.objectContaining({ severity: 'info', code: 'subgraph-endpoint' }),
    ]);
  });

  it('leaves a subgraph an edge leaves from on its last member', () => {
    const { model } = build('flowchart TD\n subgraph g\n  A --> B\n end\n g --> C');

    expect(model.edges[1]).toMatchObject({ source: 'B', target: 'C' });
  });

  it('drops an edge into an empty subgraph rather than leaving its phantom behind', () => {
    const { model, diagnostics } = build('flowchart TD\n subgraph g\n end\n Start --> g');

    expect(model.nodes.map((node) => node.id)).toEqual(['Start']);
    expect(model.edges).toEqual([]);
    expect(diagnostics).toEqual([
      expect.objectContaining({ severity: 'warning', code: 'empty-subgraph' }),
    ]);
  });

  it('never gives a cluster and a node the same id', () => {
    const model = graph('flowchart TD\n subgraph g\n end\n A --> g\n B --> g');
    const ids = new Set(model.nodes.map((node) => node.id));

    expect(model.clusters.map((cluster) => cluster.id)).toEqual(['g']);
    expect(model.clusters.some((cluster) => ids.has(cluster.id))).toBe(false);
  });

  it('leaves every endpoint resolvable to a declared node', () => {
    const model = graph('flowchart TD\n A --> B & C\n D --> A');
    const ids = new Set(model.nodes.map((node) => node.id));

    for (const edge of model.edges) {
      expect(ids.has(edge.source)).toBe(true);
      expect(ids.has(edge.target)).toBe(true);
    }
  });
});
