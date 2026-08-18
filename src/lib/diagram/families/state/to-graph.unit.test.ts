import { describe, expect, it } from 'vitest';

import { defaultLimits } from '../../build.ts';
import { Reporter } from '../../core/diagnostics.ts';
import type { GraphModel } from '../../core/graph/model.ts';
import type { StateIR } from './ir.ts';
import { parseState } from './parse.ts';
import { toGraph } from './to-graph.ts';

function graph(source: string): { model: GraphModel; report: Reporter } {
  const report = new Reporter();
  const parsed = parseState(source, { report, limits: defaultLimits });

  return { model: toGraph(parsed.ir as StateIR, report), report };
}

const header = 'stateDiagram-v2';

describe('toGraph', () => {
  it('maps every state type onto its shape', () => {
    const { model } = graph(
      `${header}
  [*] --> Idle
  state Pick <<choice>>
  state F <<fork>>
  state J <<join>>
  Idle --> [*]`,
    );

    expect(Object.fromEntries(model.nodes.map((node) => [node.id, node.shape]))).toEqual({
      '[*]start0': 'state-start',
      Idle: 'round',
      Pick: 'state-choice',
      F: 'state-bar',
      J: 'state-bar',
      '[*]end1': 'state-end',
    });
  });

  it('labels a simple state with its description, falling back to its id', () => {
    const { model } = graph(`${header}\n  A : does work\n  B --> A`);

    expect(model.nodes.find((node) => node.id === 'A')?.label).toEqual(['does work']);
    expect(model.nodes.find((node) => node.id === 'B')?.label).toEqual(['B']);
  });

  it('gives markers no label at all', () => {
    const { model } = graph(`${header}\n  [*] --> A`);

    expect(model.nodes[0]?.label).toEqual([]);
  });

  it('turns a composite state into a cluster and parents its members', () => {
    const { model } = graph(
      `${header}
  state Outer {
    state Inner {
      A --> B
    }
    Inner --> C
  }`,
    );

    expect(model.clusters).toEqual([
      expect.objectContaining({ id: 'Outer', parent: null, label: ['Outer'] }),
      expect.objectContaining({ id: 'Inner', parent: 'Outer', label: ['Inner'] }),
    ]);
    expect(model.nodes.map((node) => [node.id, node.cluster])).toEqual([
      ['A', 'Inner'],
      ['B', 'Inner'],
      ['C', 'Outer'],
    ]);
  });

  it('uses a quoted composite label as the cluster title', () => {
    const { model } = graph(`${header}\n  state "Doing work" as Big {\n    A --> B\n  }`);

    expect(model.clusters[0]?.label).toEqual(['Doing work']);
  });

  it('retargets a transition into a composite state at its start marker', () => {
    const { model } = graph(
      `${header}
  [*] --> Big
  state Big {
    [*] --> Warm
    Warm --> [*]
  }
  Big --> [*]`,
    );

    expect(model.edges.map((edge) => `${edge.source}->${edge.target}`)).toEqual([
      '[*]start0->[*]start1',
      '[*]start1->Warm',
      'Warm->[*]end2',
      '[*]end2->[*]end3',
    ]);
  });

  it('falls back to the first member entering a marker-less composite and the last leaving it', () => {
    const { model } = graph(`${header}\n  A --> Big\n  state Big {\n    B --> C\n  }\n  Big --> D`);

    expect(model.edges[0]).toMatchObject({ source: 'A', target: 'B' });
    expect(model.edges.at(-1)).toMatchObject({ source: 'C', target: 'D' });
  });

  it('drops a transition to an empty composite state with a diagnostic', () => {
    const { model, report } = graph(`${header}\n  A --> Big\n  state Big {\n  }`);

    expect(model.edges).toEqual([]);
    expect(report.diagnostics[0]).toMatchObject({ severity: 'warning', code: 'empty-composite' });
  });

  it('gives a note its own node and a dotted headless edge', () => {
    const { model } = graph(`${header}\n  A --> B\n  note right of A : starts here`);
    const note = model.nodes.find((node) => node.shape === 'state-note');

    expect(note).toMatchObject({ label: ['starts here'], cluster: null });
    expect(model.edges.at(-1)).toMatchObject({
      source: 'A',
      target: note?.id,
      line: 'dotted',
      arrow: 'none',
      startArrow: 'none',
    });
  });

  it('keeps a note beside the state it annotates', () => {
    const { model } = graph(
      `${header}\n  state Big {\n    A --> B\n  }\n  note right of A : inside`,
    );

    expect(model.nodes.find((node) => node.shape === 'state-note')?.cluster).toBe('Big');
  });

  it('declares a note on the side its placement asks for', () => {
    const { model } = graph(
      `${header}\n  A --> B\n  note left of A : before\n  note right of B : after`,
    );
    const ids = model.nodes.map((node) => node.id);

    expect(ids.indexOf('note#0')).toBeLessThan(ids.indexOf('A'));
    expect(ids.indexOf('note#1')).toBeGreaterThan(ids.indexOf('B'));
  });

  it('drops a note on an unknown state', () => {
    const { model, report } = graph(`${header}\n  A --> B\n  note right of Ghost : nope`);

    expect(model.nodes.filter((node) => node.shape === 'state-note')).toEqual([]);
    expect(report.diagnostics[0]).toMatchObject({ code: 'unknown-endpoint' });
  });

  it('carries direction, family and accessibility text', () => {
    const { model } = graph(
      `${header}\n  direction LR\n  accTitle: Publish flow\n  accDescr: Two states\n  A --> B`,
    );

    expect(model).toMatchObject({
      family: 'state',
      direction: 'LR',
      title: 'Publish flow',
      description: 'Two states',
    });
  });

  it('keeps transition labels and defaults every edge to a solid arrow', () => {
    const { model } = graph(`${header}\n  A --> B : go`);

    expect(model.edges[0]).toMatchObject({
      label: ['go'],
      line: 'solid',
      arrow: 'arrow',
      startArrow: 'none',
      minLen: 1,
      weight: 1,
    });
  });
});
