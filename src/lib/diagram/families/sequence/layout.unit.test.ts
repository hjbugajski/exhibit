/*
 * End to end for the sequence family: real sources through `buildDiagram`, so detection, the
 * parser and the layout are all under test at once.
 */

import { describe, expect, it } from 'vitest';

import { loadCorpus } from '@testing/diagram/corpus.ts';
import { goldenScene } from '@testing/diagram/golden.ts';
import { assertDeterministic, assertSequenceInvariants } from '@testing/diagram/invariants.ts';

import { buildDiagram, defaultLimits, resolveLayoutOptions } from '../../build.ts';
import { Reporter } from '../../core/diagnostics.ts';
import { metricsMeasurer } from '../../core/text/measurers.ts';
import { resolveMetrics } from '../../metrics.ts';
import type { BuildOptions, Diagnostic, PlacedLabel, Rect, SequenceScene } from '../../types.ts';
import type { SequenceIR } from './ir.ts';
import { layoutSequence } from './layout.ts';
import { parseSequence } from './parse.ts';

const options: BuildOptions = { measurer: metricsMeasurer };
const metrics = resolveMetrics();
const corpus = loadCorpus('sequence');

function built(source: string): SequenceScene {
  const result = buildDiagram(source, options);

  expect(result.family).toBe('sequence');
  expect(result.scene, JSON.stringify(result.diagnostics)).not.toBeNull();
  expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);

  return result.scene as SequenceScene;
}

function laid(source: string): { scene: SequenceScene | null; diagnostics: readonly Diagnostic[] } {
  const report = new Reporter();
  const parsed = parseSequence(source, { report, limits: defaultLimits });
  const result = layoutSequence(parsed.ir as SequenceIR, resolveLayoutOptions(options));

  return { scene: result.scene, diagnostics: result.diagnostics };
}

const header = 'sequenceDiagram';

describe('sequence layout', () => {
  it('has fixtures to run', () => {
    expect(corpus.length).toBeGreaterThan(3);
  });

  it.each(corpus)('$name holds every layout invariant', ({ source }) => {
    assertSequenceInvariants(built(source));
  });

  it.each(corpus)('$name matches its golden scene', ({ source }) => {
    expect(goldenScene(built(source))).toMatchSnapshot();
  });

  it.each(corpus)('$name lays out identically twice', ({ source }) => {
    assertDeterministic(() => buildDiagram(source, options));
  });
});

describe('sequence participants', () => {
  it('keeps declaration order left to right and hangs a lifeline from each header', () => {
    const scene = built(`${header}\n  participant B\n  participant A\n  A->>B: x`);

    expect(scene.participants.map((participant) => participant.id)).toEqual(['B', 'A']);
    expect(scene.participants[0]?.x).toBeLessThan(scene.participants[1]?.x as number);
    expect(scene.participants[0]?.lifeline.y1).toBe(
      metrics.padding + (scene.participants[0]?.box.height as number),
    );
  });

  it('repeats the header at the foot, at the same width', () => {
    const scene = built(`${header}\n  A->>B: x`);
    const [first] = scene.participants;

    expect(first?.footer.width).toBe(first?.box.width);
    expect(first?.footer.y).toBe(first?.lifeline.y2);
  });

  it('widens a header to fit its alias', () => {
    const short = built(`${header}\n  participant A as A\n  participant B\n  A->>B: x`);
    const long = built(
      `${header}\n  participant A as The whole publishing endpoint\n  participant B\n  A->>B: x`,
    );

    expect(long.participants[0]?.box.width).toBeGreaterThan(
      short.participants[0]?.box.width as number,
    );
  });

  it('flags an actor without changing its geometry', () => {
    const scene = built(`${header}\n  actor A\n  participant B\n  A->>B: x`);

    expect(scene.participants[0]?.actor).toBe(true);
    expect(scene.participants[1]?.actor).toBe(false);
  });

  it('draws an empty diagram as an empty scene rather than nothing', () => {
    const { scene, diagnostics } = laid(header);

    expect(diagnostics[0]).toMatchObject({ severity: 'warning', code: 'empty-diagram' });
    expect(scene).toMatchObject({ kind: 'sequence', participants: [], messages: [] });
  });
});

describe('sequence messages', () => {
  it('runs a message between the two lifelines it names', () => {
    const scene = built(`${header}\n  A->>B: x`);
    const [message] = scene.messages;

    expect(message?.points[0]?.x).toBeCloseTo(scene.participants[0]?.x as number, 6);
    expect(message?.points.at(-1)?.x).toBeCloseTo(scene.participants[1]?.x as number, 6);
    expect(message?.reversed).toBe(false);
  });

  it('marks a right-to-left message reversed', () => {
    const scene = built(`${header}\n  participant A\n  participant B\n  B->>A: x`);

    expect(scene.messages[0]?.reversed).toBe(true);
    expect(scene.messages[0]?.points[0]?.x).toBeGreaterThan(
      scene.messages[0]?.points.at(-1)?.x as number,
    );
  });

  it('steps down the page in source order', () => {
    const scene = built(`${header}\n  A->>B: one\n  B->>A: two\n  A->>B: three`);
    const ys = scene.messages.map((message) => message.points[0]?.y ?? 0);

    expect(ys[1]).toBeGreaterThan(ys[0] as number);
    expect(ys[2]).toBeGreaterThan(ys[1] as number);
  });

  it('draws a self message as a lobe to the right of its own lifeline', () => {
    const scene = built(`${header}\n  A->>A: think\n  participant B`);
    const [message] = scene.messages;
    const lifeline = scene.participants[0]?.x as number;

    expect(message?.self).toBe(true);
    expect(message?.points).toHaveLength(4);
    expect(message?.points[1]?.x).toBeGreaterThan(lifeline);
    expect(message?.points[2]?.y).toBeGreaterThan(message?.points[1]?.y as number);
    expect(message?.label?.x).toBeGreaterThan(message?.points[1]?.x as number);
  });

  it('rounds the corners of that lobe on the shared elbow emitter', () => {
    const scene = built(`${header}\n  A->>A: think\n  participant B`);
    const d = scene.messages[0]?.d as string;

    expect(d.match(/Q/g), d).toHaveLength(2);
    // A U-turn, so the pair of corners stays a pair: an S-curve here would fold the lobe flat.
    expect(d, d).not.toContain('C');
  });

  it('leaves a straight message a straight line', () => {
    const scene = built(`${header}\n  A->>B: x`);

    expect(scene.messages[0]?.d).toMatch(/^M[\d.]+,[\d.]+L[\d.]+,[\d.]+$/);
  });

  it('makes room for a self message on the last participant', () => {
    const scene = built(`${header}\n  A->>B: x\n  B->>B: a long thought about it`);
    const lobe = scene.messages[1]?.points[1]?.x as number;

    expect(Number.isFinite(lobe)).toBe(true);
    expect(scene.size.width).toBeGreaterThan(lobe);
  });

  it('carries the line and head the operator asked for', () => {
    const scene = built(
      `${header}\n  A->>B: a\n  A-->>B: b\n  A-xB: c\n  A-)B: d\n  A->B: e\n  A--)B: f`,
    );

    expect(scene.messages.map((message) => `${message.line}/${message.arrow}`)).toEqual([
      'solid/arrow',
      'dotted/arrow',
      'solid/cross',
      'solid/async',
      'solid/none',
      'dotted/async',
    ]);
    expect(scene.messages[4]?.arrowD).toBeUndefined();
  });

  it('numbers messages before measuring them', () => {
    const plain = built(`${header}\n  A->>B: publish`);
    const numbered = built(`${header}\n  autonumber\n  A->>B: publish\n  A->>B: publish`);

    expect(numbered.messages[0]?.label?.box.lines).toEqual(['1 publish']);
    expect(numbered.messages[1]?.label?.box.lines).toEqual(['2 publish']);
    expect(numbered.messages[0]?.label?.box.width).toBeGreaterThan(
      plain.messages[0]?.label?.box.width as number,
    );
  });

  it('honours an autonumber start and step', () => {
    const scene = built(`${header}\n  autonumber 10 5\n  A->>B: x\n  A->>B: y`);

    expect(scene.messages.map((message) => message.label?.box.lines[0])).toEqual(['10 x', '15 y']);
  });

  it('widens the gap so a long label fits between two lifelines', () => {
    const narrow = built(`${header}\n  A->>B: hi`);
    const wide = built(`${header}\n  A->>B: a considerably longer message label than that one`);

    expect(wide.participants[1]?.x).toBeGreaterThan(narrow.participants[1]?.x as number);
  });
});

describe('sequence activations', () => {
  it('opens a bar on the receiver and closes it on the sender', () => {
    const scene = built(`${header}\n  A->>+B: work\n  B-->>-A: done`);
    const [bar] = scene.activations;

    expect(scene.activations).toHaveLength(1);
    expect(bar?.participant).toBe('B');
    expect(bar?.box.y).toBeCloseTo(scene.messages[0]?.points[0]?.y as number, 6);
    expect((bar?.box.y as number) + (bar?.box.height as number)).toBeCloseTo(
      scene.messages[1]?.points[0]?.y as number,
      6,
    );
  });

  it('lands a message on the bar edge rather than the lifeline', () => {
    const scene = built(`${header}\n  A->>+B: work\n  B-->>-A: done`);
    const bar = scene.activations[0]?.box as { x: number; width: number };

    expect(scene.messages[0]?.points.at(-1)?.x).toBeCloseTo(bar.x, 6);
    expect(scene.messages[1]?.points[0]?.x).toBeCloseTo(bar.x, 6);
  });

  it('steps a nested bar half a width to the right', () => {
    const scene = built(
      `${header}\n  activate B\n  A->>B: one\n  activate B\n  A->>B: two\n  deactivate B\n  deactivate B`,
    );
    const [outer, inner] = scene.activations;

    expect(outer?.depth).toBe(0);
    expect(inner?.depth).toBe(1);
    expect(inner?.box.x).toBeGreaterThan(outer?.box.x as number);
  });

  it('reserves scene width for the outermost bar of a deep stack', () => {
    const scene = built(
      `${header}\n  A->>B: 1\n${'  activate B\n'.repeat(7)}${'  deactivate B\n'.repeat(7)}`,
    );

    for (const bar of scene.activations) {
      expect(bar.box.x + bar.box.width, `${bar.id} runs past the scene`).toBeLessThanOrEqual(
        scene.size.width,
      );
    }
  });

  it('reserves scene width for a bar a message opened', () => {
    const scene = built(`${header}\n  participant A\n  participant B\n  A->>+B: work`);
    const bar = scene.activations[0]?.box as Rect;

    expect(bar.x + bar.width).toBeLessThanOrEqual(scene.size.width);
  });

  it('runs an unclosed bar to the foot of the lifeline and says so', () => {
    const result = buildDiagram(`${header}\n  A->>+B: work`, options);
    const scene = result.scene as SequenceScene;

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'unclosed-activation',
    );
    expect(
      (scene.activations[0]?.box.y as number) + (scene.activations[0]?.box.height as number),
    ).toBeCloseTo(scene.participants[0]?.lifeline.y2 as number, 6);
  });

  it('reports a deactivate with nothing open', () => {
    const { diagnostics } = laid(`${header}\n  A->>B: x\n  deactivate B`);

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['unexpected-deactivate']);
  });
});

describe('sequence notes', () => {
  it('places a note to the side it was asked for', () => {
    const scene = built(
      `${header}\n  participant A\n  participant B\n  Note left of B: left\n  Note right of B: right`,
    );
    const lifeline = scene.participants[1]?.x as number;
    const [left, right] = scene.notes;

    expect((left?.box.x as number) + (left?.box.width as number)).toBeLessThanOrEqual(lifeline);
    expect(right?.box.x).toBeGreaterThanOrEqual(lifeline);
  });

  it('spans an over note across both participants', () => {
    const scene = built(`${header}\n  A->>B: x\n  Note over A,B: both`);
    const [note] = scene.notes;

    expect(note?.placement).toBe('over');
    expect(note?.box.x).toBeLessThanOrEqual(scene.participants[0]?.x as number);
    expect((note?.box.x as number) + (note?.box.width as number)).toBeGreaterThanOrEqual(
      scene.participants[1]?.x as number,
    );
  });

  it('gives a note its own band, below the message before it', () => {
    const scene = built(`${header}\n  A->>B: x\n  Note over A: after\n  A->>B: y`);

    expect(scene.notes[0]?.box.y).toBeGreaterThan(scene.messages[0]?.points[0]?.y as number);
    expect(scene.messages[1]?.points[0]?.y).toBeGreaterThan(
      (scene.notes[0]?.box.y as number) + (scene.notes[0]?.box.height as number),
    );
  });

  it('keeps a note left of the first participant inside the scene', () => {
    const scene = built(`${header}\n  participant A\n  Note left of A: outside`);

    expect(scene.notes[0]?.box.x).toBeGreaterThanOrEqual(0);
    expect(scene.participants[0]?.x).toBeGreaterThan(scene.notes[0]?.box.x as number);
  });
});

describe('sequence frames', () => {
  it('spans the participants its events touch and names its kind', () => {
    const scene = built(
      `${header}\n  participant A\n  participant B\n  participant C\n  loop retry\n    A->>B: x\n  end`,
    );
    const [frame] = scene.frames;

    expect(frame?.kind).toBe('loop');
    expect(frame?.title.box.lines).toEqual(['loop']);
    expect(frame?.label?.box.lines).toEqual(['retry']);
    expect(frame?.box.x).toBeLessThan(scene.participants[0]?.x as number);
    expect((frame?.box.x as number) + (frame?.box.width as number)).toBeLessThan(
      scene.participants[2]?.x as number,
    );
  });

  it('opens below the message before it rather than on top of it', () => {
    // The cursor sits on the line of the message it just placed, so a frame that opened at it drew
    // its top border through that arrow — visible on the flagship publish diagram as the `alt`
    // border crossing `publish_markdown`.
    const scene = built(
      `${header}\n  participant A\n  participant B\n  A->>B: first\n  alt valid\n    A->>B: second\n  end`,
    );
    const first = scene.messages[0]?.points[0]?.y as number;
    const [frame] = scene.frames;

    expect(frame?.box.y).toBeGreaterThan(first);
    expect(scene.messages[1]?.points[0]?.y as number).toBeGreaterThan(
      (frame?.box.y as number) + (frame?.tab.height as number),
    );
  });

  it('records a divider per section, in order, with its label', () => {
    const scene = built(
      `${header}\n  alt valid\n    A->>B: ok\n  else expired\n    A->>B: no\n  end`,
    );
    const [frame] = scene.frames;

    expect(frame?.sections).toHaveLength(1);
    expect(frame?.sections[0]?.label?.box.lines).toEqual(['expired']);
    expect(frame?.sections[0]?.y).toBeGreaterThan(scene.messages[0]?.points[0]?.y as number);
    expect(frame?.sections[0]?.y).toBeLessThan(scene.messages[1]?.points[0]?.y as number);
  });

  it('insets a nested frame inside its parent', () => {
    const scene = built(`${header}\n  loop outer\n    alt inner\n      A->>B: x\n    end\n  end`);
    const [outer, inner] = scene.frames;

    expect(outer?.depth).toBe(0);
    expect(inner?.depth).toBe(1);
    expect(inner?.box.x).toBeGreaterThan(outer?.box.x as number);
    expect(inner?.box.y).toBeGreaterThan(outer?.box.y as number);
    expect((inner?.box.y as number) + (inner?.box.height as number)).toBeLessThan(
      (outer?.box.y as number) + (outer?.box.height as number),
    );
  });

  it('keeps a long label inside the scene when the frame touches one participant', () => {
    const scene = built(
      `${header}\n  participant A\n  participant B\n  A->>B: hi\n  loop while the queue is not empty\n    Note over B: work\n  end`,
    );
    const [frame] = scene.frames;
    const label = frame?.label as PlacedLabel;

    expect(label.x + label.box.width / 2).toBeLessThanOrEqual(scene.size.width);
    expect(label.x - label.box.width / 2).toBeGreaterThanOrEqual(0);
    expect(label.x + label.box.width / 2).toBeLessThanOrEqual(
      (frame?.box.x as number) + (frame?.box.width as number),
    );
  });

  it('keeps a long label inside the scene on a single-participant diagram', () => {
    const scene = built(
      `${header}\n  loop retry until the publish endpoint answers\n    activate A\n    deactivate A\n  end`,
    );
    const label = scene.frames[0]?.label as PlacedLabel;

    expect(label.x + label.box.width / 2).toBeLessThanOrEqual(scene.size.width);
  });

  it('encloses a note drawn inside it', () => {
    const scene = built(`${header}\n  opt maybe\n    Note over A: inside\n  end`);
    const [frame] = scene.frames;
    const [note] = scene.notes;

    expect(note?.box.x).toBeGreaterThanOrEqual(frame?.box.x as number);
    expect((note?.box.x as number) + (note?.box.width as number)).toBeLessThanOrEqual(
      (frame?.box.x as number) + (frame?.box.width as number),
    );
  });
});

describe('sequence scene', () => {
  it('sizes the scene to its content plus padding', () => {
    const scene = built(`${header}\n  A->>B: x`);

    expect(scene.size.height).toBeCloseTo(
      (scene.participants[0]?.footer.y as number) +
        (scene.participants[0]?.footer.height as number) +
        metrics.padding,
      6,
    );
    expect(scene.participants[0]?.box.x).toBeCloseTo(metrics.padding, 6);
  });

  it('carries the title and accessibility text onto the scene', () => {
    const scene = built(
      `${header}\n  title Publishing\n  accTitle: Ignored\n  accDescr: Two participants\n  A->>B: x`,
    );

    expect(scene).toMatchObject({ title: 'Publishing', description: 'Two participants' });
  });

  it('refuses a diagram past the participant limit', () => {
    const result = buildDiagram(`${header}\n  A->>B: x\n  B->>C: y`, {
      ...options,
      limits: { nodes: 2 },
    });

    expect(result.scene).toBeNull();
    expect(result.diagnostics.at(-1)).toMatchObject({ code: 'too-many-nodes' });
  });

  it('refuses a diagram past the message limit', () => {
    const result = buildDiagram(`${header}\n  A->>B: x\n  B->>A: y`, {
      ...options,
      limits: { edges: 1 },
    });

    expect(result.scene).toBeNull();
    expect(result.diagnostics.at(-1)).toMatchObject({ code: 'too-many-edges' });
  });
});
