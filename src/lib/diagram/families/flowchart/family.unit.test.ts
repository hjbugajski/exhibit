/*
 * End-to-end: source in, `Scene` out, through the real `buildDiagram`. The golden scenes are the
 * layout contract for this family — if measurement, metrics or shapes change they will need `-u`,
 * and the diff is the thing to review. The invariant run covers what a snapshot cannot: that the
 * geometry is actually well formed for every fixture in the corpus.
 */

import { describe, expect, it } from 'vitest';

import { loadCorpus } from '@testing/diagram/corpus.ts';
import { goldenScene } from '@testing/diagram/golden.ts';
import {
  assertDeterministic,
  assertElbowRoutes,
  assertLayoutInvariants,
} from '@testing/diagram/invariants.ts';

import { buildDiagram } from '../../build.ts';
import { ELBOW_MIN_RUN } from '../../core/graph/elbow.ts';
import type { Direction } from '../../core/graph/model.ts';
import { defaultShapes } from '../../core/shapes/registry.ts';
import { metricsMeasurer } from '../../core/text/measurers.ts';
import { defaultMetrics } from '../../metrics.ts';
import type { BuildOptions, GraphScene } from '../../types.ts';
import { flowchartFamily } from './family.ts';

const options: BuildOptions = { measurer: metricsMeasurer };
const invariantContext = { shapes: defaultShapes, metrics: defaultMetrics };

function build(source: string): GraphScene {
  const result = buildDiagram(source, options);

  expect(result.family).toBe('flowchart');
  expect(result.scene, JSON.stringify(result.diagnostics)).not.toBeNull();

  return result.scene as GraphScene;
}

interface Fixture {
  name: string;
  direction: Direction;
  source: string;
}

const fixtures: Fixture[] = [
  {
    name: 'decision TB',
    direction: 'TB',
    source: [
      'flowchart TD',
      '  A([Start]) --> B{Ready?}',
      '  B -->|yes| C[Publish]',
      '  B -->|no| D[Fix]',
      '  D --> B',
      '  C --> E([Done])',
    ].join('\n'),
  },
  {
    name: 'pipeline LR',
    direction: 'LR',
    source: [
      'flowchart LR',
      '  A[Draft] -- review --> B[Approved]',
      '  A -. reject .-> C[Archived]',
      '  B ==> D[Published]',
    ].join('\n'),
  },
  {
    name: 'bottom up BT',
    direction: 'BT',
    source: 'flowchart BT\n  A --> B\n  B --> C\n  A --> C',
  },
  {
    name: 'right to left RL',
    direction: 'RL',
    source: 'flowchart RL\n  A --> B\n  B --> C',
  },
  {
    name: 'nested subgraphs',
    direction: 'TB',
    source: [
      'flowchart TB',
      '  A[Author] --> B',
      '  subgraph pipeline [Pipeline]',
      '    B[Build] --> C[Test]',
      '    subgraph deploy [Deploy]',
      '      C --> D[Stage]',
      '      D --> E[Prod]',
      '    end',
      '  end',
      '  E --> F[Done]',
    ].join('\n'),
  },
  {
    name: 'every shape',
    direction: 'TB',
    source: [
      'flowchart TD',
      '  A[Rect] --> B(Round) --> C([Stadium]) --> D[[Sub]]',
      '  D --> E[(Store)] --> F((Circle)) --> G(((Double)))',
      '  G --> H{Choice} --> I{{Hex}} --> J[/In/]',
      '  J --> K[\\Out\\] --> L[/Trap\\] --> M[\\Alt/] --> N>Flag]',
    ].join('\n'),
  },
  {
    name: 'cycles and self loops',
    direction: 'TB',
    source: 'flowchart TD\n  A --> B\n  B --> C\n  C --> A\n  B --> B\n  A --> C',
  },
  {
    name: 'fan groups and classes',
    direction: 'LR',
    source: [
      'flowchart LR',
      '  classDef danger fill:#f00',
      '  A & B --> C & D',
      '  C:::danger --> E',
      '  class D danger',
    ].join('\n'),
  },
  {
    name: 'disconnected components',
    direction: 'TB',
    source: 'flowchart TD\n  A --> B\n  C --> D\n  E',
  },
  {
    name: 'long labels wrap',
    direction: 'TB',
    source: [
      'flowchart TD',
      '  A["A label long enough that the greedy wrapper has to break it across lines"] --> B',
      '  B -->|"a somewhat long edge label as well"| C',
    ].join('\n'),
  },
  {
    name: 'accessible titles',
    direction: 'TB',
    source: 'flowchart TD\n  accTitle: Publish flow\n  accDescr: How a draft ships\n  A --> B',
  },
  { name: 'single node', direction: 'TB', source: 'flowchart TD\n  A[Only]' },
];

describe('flowchartFamily', () => {
  it('detects its own headers and nothing else', () => {
    expect(flowchartFamily.detect('flowchart TD')).toBe(true);
    expect(flowchartFamily.detect('graph LR')).toBe(true);
    expect(flowchartFamily.detect('stateDiagram-v2')).toBe(false);
    expect(flowchartFamily.detect('pie')).toBe(false);
  });

  it.each(fixtures)('$name lays out to a golden scene', ({ source }) => {
    expect(goldenScene(build(source))).toMatchSnapshot();
  });

  it.each(fixtures)('$name holds every layout invariant', ({ source, direction }) => {
    assertLayoutInvariants(build(source), { ...invariantContext, direction });
  });

  it.each(fixtures)('$name lays out identically twice', ({ source }) => {
    assertDeterministic(() => goldenScene(build(source)));
  });

  it.each(loadCorpus('flowchart'))('corpus fixture $name is well formed', ({ source }) => {
    const scene = build(source);
    const direction = /^\s*(?:flowchart|graph)\s+(\w+)/.exec(source)?.[1] ?? 'TB';
    const resolved = (direction === 'TD' ? 'TB' : direction) as Direction;

    assertLayoutInvariants(scene, { ...invariantContext, direction: resolved });
  });

  it('carries accTitle and accDescr onto the scene', () => {
    const scene = build('flowchart TD\n accTitle: Publish\n accDescr: How it ships\n A --> B');

    expect(scene).toMatchObject({
      family: 'flowchart',
      kind: 'graph',
      title: 'Publish',
      description: 'How it ships',
    });
  });

  it('emits classes as author intent and never as paint', () => {
    const scene = build('flowchart TD\n classDef danger fill:#f00\n A:::danger --> B');

    expect(scene.nodes[0]?.classes).toEqual(['danger']);
    expect(JSON.stringify(scene)).not.toContain('#f00');
  });

  it('builds a cluster tree with depth and title', () => {
    const scene = build(
      'flowchart TD\n subgraph outer [Outer]\n  subgraph inner [Inner]\n   A --> B\n  end\n end',
    );

    expect(scene.clusters).toHaveLength(1);
    expect(scene.clusters[0]).toMatchObject({ id: 'outer', depth: 0 });
    expect(scene.clusters[0]?.title?.box.lines).toEqual(['Outer']);
    expect(scene.clusters[0]?.children[0]).toMatchObject({ id: 'inner', depth: 1 });
  });

  it('places a label on every labelled edge', () => {
    const scene = build('flowchart TD\n A -->|yes| B\n A -->|no| C');

    for (const edge of scene.edges) {
      expect(edge.label?.box.lines.length).toBeGreaterThan(0);
      expect(Number.isFinite(edge.label?.x)).toBe(true);
    }
  });

  it('reaches into a subgraph an edge names instead of drawing a phantom beside it', () => {
    const result = buildDiagram(
      'flowchart TD\n Start --> server\n subgraph server [Server]\n  A --> B\n end',
      options,
    );
    const scene = result.scene as GraphScene;

    expect(scene.nodes.map((node) => node.id)).toEqual(['Start', 'A', 'B']);
    expect(scene.edges[0]).toMatchObject({ source: 'Start', target: 'A' });
    expect(result.diagnostics.map((entry) => entry.code)).toContain('subgraph-endpoint');
  });

  it('routes an edge crossing a cluster border clear of what the cluster holds', () => {
    const scene = build(
      'flowchart TD\n Kick --> Build\n Kick --> Ship\n subgraph release\n  Build --> Ship\n end',
    );

    assertLayoutInvariants(scene, { ...invariantContext, direction: 'TB' });

    const crossing = scene.edges.find((edge) => edge.id.startsWith('Kick->Ship'));
    const box = scene.clusters[0]?.box as { x: number; width: number };

    // It gets there down a cluster gutter, so it leaves the straight line between the two nodes.
    expect(crossing?.points.length).toBeGreaterThan(3);
    expect(crossing?.points.some((point) => point.x < box.x + 16)).toBe(true);
  });

  it('draws an edge whose ends already share a lane as one straight run', () => {
    // `Card` takes two ports on one side: the edge down from `Version`, which sits on the lane both
    // nodes are already centred on, and the return edge to `Claude`, which leaves the same side for
    // a node far above and turns whatever port it is given. Splitting the room between them evenly
    // moved the straight one off that lane, and the run picked up a jog a few pixels short of its
    // own arrowhead.
    const scene = build(
      [
        'flowchart TD',
        '  Claude[Claude] --> Store',
        '  subgraph publish [Publish path]',
        '    Store[(SQLite)] --> Version[Version row]',
        '    Version --> Card([Gallery card])',
        '  end',
        '  Card -->|artifact url| Claude',
      ].join('\n'),
    );
    const straight = scene.edges.find((edge) => edge.id.startsWith('Version->Card'));
    const xs = straight?.points.map((point) => point.x) ?? [];

    assertLayoutInvariants(scene, { ...invariantContext, direction: 'TB' });
    expect(straight?.points).toHaveLength(2);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.01);
  });

  it('draws one lobe per self-loop rather than stacking them', () => {
    const scene = build('flowchart TD\n A --> A\n A -->|retry| A\n A --> B');
    const loops = scene.edges.filter((edge) => edge.source === edge.target);

    expect(loops).toHaveLength(2);
    expect(new Set(loops.map((edge) => edge.d)).size).toBe(2);
  });

  it('routes a target off its source lane as an L rather than a dogleg', () => {
    // The only end-to-end witness that L routing happens at all: no corpus fixture qualifies, so
    // without this the feature could be deleted and only a golden snapshot would notice.
    const scene = build('flowchart TD\n  A --> B\n  B --> C\n  C --> A\n  B --> B\n  A --> C');
    const elbow = scene.edges.find((edge) => edge.points.length === 3);
    const [start, corner, end] = elbow?.points ?? [];

    expect(elbow, 'no edge routed as an L').toBeDefined();

    // The arrival leg is what makes it read as an L rather than a jog, and it is also what
    // `assertElbowRoutes` qualifies on — under the bar and the assertion below inspects nothing.
    const arrive = Math.abs((corner?.x as number) - (start?.x as number)) < 0.01 ? 'x' : 'y';

    expect(
      Math.abs((end?.[arrive] as number) - (corner?.[arrive] as number)),
    ).toBeGreaterThanOrEqual(ELBOW_MIN_RUN);
    assertElbowRoutes(scene, invariantContext);
  });

  it('stacks the labels of two self-loops instead of running them together', () => {
    const scene = build('flowchart TD\n A -->|first| A\n A -->|retry| A\n A --> B');
    const labels = scene.edges
      .filter((edge) => edge.source === edge.target)
      .map((edge) => edge.label as NonNullable<(typeof scene.edges)[number]['label']>);
    const [first, second] = labels;

    expect(labels).toHaveLength(2);
    expect(first?.box.lines).toEqual(['first']);
    expect(second?.box.lines).toEqual(['retry']);

    for (const label of labels) {
      // Outside the widest lobe, so no label crosses the arc drawn around its own.
      const lobes = scene.edges
        .filter((edge) => edge.source === edge.target)
        .flatMap((edge) => edge.points.map((point) => point.x));

      expect(label.x - label.box.width / 2).toBeGreaterThanOrEqual(Math.max(...lobes));
    }

    expect(Math.abs((first?.y as number) - (second?.y as number))).toBeGreaterThanOrEqual(
      (first?.box.height as number) / 2 + (second?.box.height as number) / 2,
    );
  });

  it('reports a limit breach as an error and no scene', () => {
    const source = `flowchart TD\n${Array.from({ length: 20 }, (_, i) => `n${i} --> n${i + 1}`).join('\n')}`;
    const result = buildDiagram(source, { ...options, limits: { nodes: 5 } });

    expect(result.scene).toBeNull();
    expect(result.diagnostics.map((entry) => entry.code)).toContain('too-many-nodes');
  });

  it('lays out with clusters ignored', () => {
    const source = 'flowchart TD\n subgraph sg\n  A --> B\n end\n B --> C';
    const result = buildDiagram(source, { ...options, clusters: 'ignore' });

    expect((result.scene as GraphScene).clusters).toEqual([]);
    expect(result.diagnostics.map((entry) => entry.code)).toContain('clusters-ignored');
  });

  it('lays out degenerate sources without a scene of NaN', () => {
    const sources = [
      'flowchart TD',
      'flowchart TD\n A',
      'flowchart TD\n A --> A',
      'flowchart TD\n A["   "] --> B',
      'flowchart TD\n subgraph empty\n end\n A',
      'flowchart TD\n A --> B\n A --> B\n A --> B',
      'flowchart TD\n subgraph A\n  B\n end\n A --> B',
      'flowchart TD\n subgraph A [Group]\n  A --> B\n end',
    ];

    for (const source of sources) {
      const scene = build(source);

      assertLayoutInvariants(scene, { ...invariantContext, direction: 'TB' });
      expect(scene.size.width).toBeGreaterThan(0);
    }
  });

  it('never throws and always terminates on mutated sources', async () => {
    const { mutations } = await import('@testing/diagram/fuzz.ts');
    const seed = fixtures[0]?.source as string;

    for (const mutated of mutations(seed, 300, 5)) {
      expect(() => buildDiagram(mutated, options)).not.toThrow();
    }
  });
});
