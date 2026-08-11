import { describe, expect, it } from 'vitest';

import { cluster, layoutOptions, model } from '@testing/diagram/graph-fixtures.ts';

import { buildDiagram } from './build.ts';
import { layoutGraph } from './core/graph/layout-graph.ts';
import type { GraphModel } from './core/graph/model.ts';
import { metricsMeasurer } from './core/text/measurers.ts';
import { describeScene } from './describe.ts';
import type { GraphScene, PieScene, Scene } from './types.ts';

function graph(built: GraphModel): GraphScene {
  return layoutGraph(built, layoutOptions()).scene as GraphScene;
}

function scene(source: string): Scene {
  const result = buildDiagram(source, { measurer: metricsMeasurer });

  expect(result.scene, JSON.stringify(result.diagnostics)).not.toBeNull();

  return result.scene as Scene;
}

describe('describeScene for a graph', () => {
  it('counts nodes and connections', () => {
    const description = describeScene(
      graph(
        model({
          nodes: ['a', 'b', 'c'],
          edges: [
            { from: 'a', to: 'b' },
            { from: 'b', to: 'c' },
          ],
        }),
      ),
    );

    expect(description.summary).toBe('Flowchart: 3 nodes, 2 connections.');
    expect(description.details).toEqual(['a leads to b.', 'b leads to c.']);
  });

  it('uses the singular for one of a thing', () => {
    expect(
      describeScene(graph(model({ nodes: ['a', 'b'], edges: [{ from: 'a', to: 'b' }] }))).summary,
    ).toBe('Flowchart: 2 nodes, 1 connection.');
  });

  it('names the family and the title', () => {
    const built: GraphModel = { ...model({ nodes: ['a'] }), family: 'state', title: 'Publish' };

    expect(describeScene(graph(built)).summary).toBe(
      'State diagram "Publish": 1 node, 0 connections.',
    );
  });

  it('reads labels rather than ids, and names markers by what they are', () => {
    const description = describeScene(
      scene('stateDiagram-v2\n  [*] --> Idle : boot\n  Idle --> [*]'),
    );

    expect(description.details).toEqual([
      'start leads to Idle, labelled boot.',
      'Idle leads to end.',
    ]);
  });

  it('phrases headless and double-ended edges differently', () => {
    const description = describeScene(
      graph(
        model({
          nodes: ['a', 'b', 'c'],
          edges: [
            { from: 'a', to: 'b', arrow: 'none' },
            { from: 'b', to: 'c', startArrow: 'arrow' },
          ],
        }),
      ),
    );

    expect(description.details).toEqual([
      'a is connected to b.',
      'b is connected both ways with c.',
    ]);
  });

  it('phrases a self loop', () => {
    const description = describeScene(
      graph(model({ nodes: ['a'], edges: [{ from: 'a', to: 'a', label: 'retry' }] })),
    );

    expect(description.details).toEqual(['a leads back to itself, labelled retry.']);
  });

  it('counts groups when the diagram has clusters', () => {
    const description = describeScene(
      graph(
        model({
          nodes: [{ id: 'a', cluster: 'g' }, 'b'],
          edges: [{ from: 'a', to: 'b' }],
          clusters: [cluster('g', null, 'Group')],
        }),
      ),
    );

    expect(description.summary).toBe('Flowchart: 2 nodes, 1 connection, 1 group.');
  });

  it('counts nested groups too — the count is of what is drawn', () => {
    const description = describeScene(
      graph(
        model({
          nodes: [{ id: 'a', cluster: 'inner' }, 'b'],
          edges: [{ from: 'a', to: 'b' }],
          clusters: [cluster('outer', null, 'Outer'), cluster('inner', 'outer', 'Inner')],
        }),
      ),
    );

    expect(description.summary).toBe('Flowchart: 2 nodes, 1 connection, 2 groups.');
  });

  it('names a composite state rather than the pseudo-state a transition landed on', () => {
    const description = describeScene(
      scene(`stateDiagram-v2
  [*] --> Draft
  Draft --> Review : submit
  state Review {
    [*] --> Automated
    Automated --> [*]
  }
  state Verdict <<choice>>
  Review --> Verdict
  Verdict --> Draft`),
    );

    expect(description.details).toEqual([
      'start leads to Draft.',
      'Draft leads to Review, labelled submit.',
      'Review leads to Automated.',
      'Automated leads to Review.',
      'Review leads to Verdict.',
      'Verdict leads to Draft.',
    ]);
  });

  it('names a fork and a join by what the author called them', () => {
    const description = describeScene(
      scene(`stateDiagram-v2
  state Fanout <<fork>>
  state Rejoin <<join>>
  Ready --> Fanout
  Fanout --> Indexed
  Indexed --> Rejoin`),
    );

    expect(description.details).toEqual([
      'Ready leads to Fanout.',
      'Fanout leads to Indexed.',
      'Indexed leads to Rejoin.',
    ]);
  });

  it('reads a state note as a note rather than a relationship', () => {
    const description = describeScene(
      scene(
        'stateDiagram-v2\n  [*] --> Draft\n  Draft --> Review : submit\n  note right of Draft : the author can still edit',
      ),
    );

    expect(description.details).toContain('Note on Draft: the author can still edit.');
    expect(description.details.some((line) => line.includes('is connected to'))).toBe(false);
  });

  it('does not strand a note-only state as an unconnected node', () => {
    const description = describeScene(scene('stateDiagram-v2\n  A\n  note right of A : hi'));

    expect(description.details).toEqual(['Note on A: hi.']);
  });

  it('lists nodes that nothing connects to', () => {
    const description = describeScene(
      graph(model({ nodes: ['a', 'b', 'lonely'], edges: [{ from: 'a', to: 'b' }] })),
    );

    expect(description.details.at(-1)).toBe('Not connected: lonely.');
  });

  it('lists every node when there are no connections at all', () => {
    const description = describeScene(graph(model({ nodes: ['a', 'b'] })));

    expect(description.details).toEqual(['a.', 'b.']);
  });

  it('describes an empty diagram', () => {
    expect(describeScene(graph(model({ nodes: [] })))).toEqual({
      summary: 'Flowchart: empty.',
      details: [],
    });
  });

  it('caps the detail lines and counts the rest', () => {
    const nodes = Array.from({ length: 60 }, (_, index) => `n${index}`);
    const description = describeScene(
      graph(
        model({
          nodes,
          edges: nodes.slice(1).map((to, index) => ({ from: nodes[index] as string, to })),
        }),
      ),
    );

    // 59 connections, 40 of them spelled out.
    expect(description.details).toHaveLength(41);
    expect(description.details.at(-1)).toBe('…and 19 more connections.');
    expect(description.details.at(0)).toBe('n0 leads to n1.');
  });

  it('moves the shape the truncated tail carried into the summary', () => {
    const nodes = Array.from({ length: 60 }, (_, index) => `n${index}`);
    const edges = nodes.slice(1).map((to, index) => ({ from: nodes[index] as string, to }));

    for (let index = 2; index < 8; index += 1) {
      edges.push({ from: 'n0', to: nodes[index] as string });
    }

    const description = describeScene(graph(model({ nodes: [...nodes, 'island'], edges })));

    // `island` is neither a start nor an end — it is the second part, which the count already says.

    expect(description.summary).toBe(
      'Flowchart: 61 nodes, 65 connections. Structure: 2 separate parts; starts at n0; ends at n59; busiest is n0 with 7 connections.',
    );
  });

  it('says nothing about structure while every connection is listed', () => {
    expect(
      describeScene(graph(model({ nodes: ['a', 'b'], edges: [{ from: 'a', to: 'b' }] }))).summary,
    ).not.toContain('Structure');
  });
});

describe('describeScene for a pie chart', () => {
  it('lists every slice with its share', () => {
    const description = describeScene(
      scene('pie title Artifact types\n  "Markdown" : 42\n  "HTML" : 31\n  "Spec" : 27'),
    );

    expect(description.summary).toBe('Pie chart "Artifact types": 3 slices, totalling 100.');
    expect(description.details).toEqual([
      'Markdown: 42 (42%).',
      'HTML: 31 (31%).',
      'Spec: 27 (27%).',
    ]);
  });

  it('rounds shares and values for reading aloud', () => {
    const description = describeScene(scene('pie\n  "A" : 1\n  "B" : 2'));

    expect(description.details).toEqual(['A: 1 (33.3%).', 'B: 2 (66.7%).']);
  });

  it('describes a chart whose values are all zero', () => {
    const description = describeScene(scene('pie\n  "None" : 0'));

    expect(description.summary).toBe('Pie chart: 1 slice, totalling 0.');
    expect(description.details).toEqual(['None: 0 (0%).']);
  });

  it('describes an empty chart', () => {
    const empty = scene('pie') as PieScene;

    expect(describeScene(empty)).toEqual({ summary: 'Pie chart: empty.', details: [] });
  });
});

describe('describeScene for a sequence diagram', () => {
  it('names the participants, then everything that happens in order', () => {
    const description = describeScene(
      scene(
        'sequenceDiagram\n  participant C as Claude\n  participant M as MCP endpoint\n  C->>M: publish_spec\n  M-->>C: artifact url',
      ),
    );

    expect(description.summary).toBe('Sequence diagram: 2 participants, 2 messages.');
    expect(description.details).toEqual([
      'Participants: Claude, MCP endpoint.',
      'Claude tells MCP endpoint: publish_spec.',
      'MCP endpoint tells Claude: artifact url.',
    ]);
  });

  it('merges notes into the reading order rather than listing them apart', () => {
    const description = describeScene(
      scene('sequenceDiagram\n  A->>B: one\n  Note over A,B: between\n  B->>A: two'),
    );

    expect(description.details).toEqual([
      'Participants: A, B.',
      'A tells B: one.',
      'Note on A and B: between.',
      'B tells A: two.',
    ]);
  });

  it('names a self message as itself and a message with no text without a colon', () => {
    const description = describeScene(scene('sequenceDiagram\n  A->>A: think\n  A->>B:'));

    expect(description.details).toEqual([
      'Participants: A, B.',
      'A tells itself: think.',
      'A tells B.',
    ]);
  });

  it('announces a frame and its branches instead of running them together', () => {
    const description = describeScene(
      scene(
        'sequenceDiagram\n  alt valid\n    A->>B: ok\n  else expired\n    A->>B: no\n  end\n  B->>A: done',
      ),
    );

    expect(description.details).toEqual([
      'Participants: A, B.',
      'Alternative: valid.',
      'A tells B: ok.',
      'Otherwise: expired.',
      'A tells B: no.',
      'End of alternative.',
      'B tells A: done.',
    ]);
  });

  it('nests a frame inside a frame in the order they close', () => {
    const description = describeScene(
      scene(
        'sequenceDiagram\n  loop every hour\n    alt fresh\n      A->>B: use\n    else stale\n      A->>B: fetch\n    end\n  end',
      ),
    );

    expect(description.details).toEqual([
      'Participants: A, B.',
      'Loop: every hour.',
      'Alternative: fresh.',
      'A tells B: use.',
      'Otherwise: stale.',
      'A tells B: fetch.',
      'End of alternative.',
      'End of loop.',
    ]);
  });

  it('reads a frame with no condition text without a trailing colon', () => {
    const description = describeScene(scene('sequenceDiagram\n  loop\n    A->>B: poll\n  end'));

    expect(description.details).toEqual([
      'Participants: A, B.',
      'Loop.',
      'A tells B: poll.',
      'End of loop.',
    ]);
  });

  it('uses the title in the summary and describes an empty diagram', () => {
    expect(describeScene(scene('sequenceDiagram\n  title Publishing\n  A->>B: x')).summary).toBe(
      'Sequence diagram "Publishing": 2 participants, 1 message.',
    );
    expect(describeScene(scene('sequenceDiagram'))).toEqual({
      summary: 'Sequence diagram: empty.',
      details: [],
    });
  });
});
