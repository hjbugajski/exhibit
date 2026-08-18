// @vitest-environment happy-dom
/*
 * The theming contract, enforced. Two rules:
 *
 *   R1  no paint in the emitted DOM — no `fill` / `stroke` / `color` / `font-*` attribute, no
 *       `<style>` element, no color-valued string anywhere in a `Scene`.
 *   R2  inline `style` carries geometry only — the CSS transform translate on the parts drawn
 *       origin-centred, and the resolved typography custom properties on the figure.
 *
 * This is the test that keeps hex out of the DOM forever: if a renderer ever reaches for a fill,
 * every fixture in the corpus fails at once.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Diagram } from '@/components/diagram/diagram';
import { HouseDiagram } from '@/components/diagram/house-diagram';
import { buildDiagram } from '@/lib/diagram/build';
import { metricsMeasurer } from '@/lib/diagram/core/text/measurers';
import { loadCorpus } from '@testing/diagram/corpus';

afterEach(() => {
  cleanup();
});

/** Sources beyond the corpus, chosen to exercise every renderer branch at once. */
const EXTRA_SOURCES: Readonly<Record<string, string>> = {
  'every-edge-kind': `flowchart LR
    A --> B
    B --- C
    C -.-> D
    D ==> E
    E --o F
    F --x G
    G <--> H
    H ~~~ A`,
  'classes-and-labels': `flowchart TD
    classDef hot fill:#ff0000,stroke:#990000,color:#ffffff
    A[Start]:::hot -->|"go now"| B(Round)
    B --> B`,
  'pie-with-labels': `pie showData title Traffic
    "Direct" : 55
    "Search" : 30
    "Social" : 15`,
  'state-composite': `stateDiagram-v2
    direction LR
    [*] --> Idle
    state Работа {
      Idle --> Busy
      Busy --> Idle
    }
    Работа --> [*]
    note left of Idle: waiting`,
};

const FORBIDDEN_ATTRIBUTE = /^(fill|stroke|color|font|stop-color|flood-color|lighting-color)/;

/** Any literal color notation, plus the paint properties themselves. */
const COLOR_IN_TEXT =
  /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color-mix)\s*\(|(?:^|[;\s])(?:fill|stroke|color|background|background-color)\s*:/i;

function sources(): [string, string][] {
  return [
    ...loadCorpus().map((fixture): [string, string] => [fixture.name, fixture.source]),
    ...Object.entries(EXTRA_SOURCES),
  ];
}

function figureOf(container: HTMLElement): HTMLElement {
  const figure = container.querySelector<HTMLElement>('[data-slot="diagram"]');

  if (!figure) {
    throw new Error('no diagram figure was rendered');
  }

  return figure;
}

describe('theming contract', () => {
  it.each(sources())('%s emits no paint attribute and no <style>', (_name, source) => {
    const { container } = render(<HouseDiagram source={source} title="Contract" />);
    const figure = figureOf(container);

    expect(figure.querySelectorAll('style')).toHaveLength(0);

    for (const element of [figure, ...figure.querySelectorAll('*')]) {
      for (const attribute of element.attributes) {
        expect(
          FORBIDDEN_ATTRIBUTE.test(attribute.name),
          `${element.tagName} carries the paint attribute "${attribute.name}"`,
        ).toBe(false);
      }
    }
  });

  it.each(sources())('%s keeps color out of every inline style', (_name, source) => {
    const { container } = render(<HouseDiagram source={source} title="Contract" />);
    const figure = figureOf(container);

    for (const element of [figure, ...figure.querySelectorAll('*')]) {
      const style = element.getAttribute('style');

      if (style) {
        expect(COLOR_IN_TEXT.test(style), `${element.tagName} style paints: ${style}`).toBe(false);
      }
    }
  });

  it.each(sources())('%s produces a scene with no color-valued string', (_name, source) => {
    const built = buildDiagram(source, { measurer: metricsMeasurer });

    expect(COLOR_IN_TEXT.test(JSON.stringify(built.scene ?? null))).toBe(false);
  });

  it('keeps declared classDef paint out of the DOM entirely', () => {
    const { container } = render(
      <HouseDiagram source={EXTRA_SOURCES['classes-and-labels'] as string} />,
    );

    expect(container.innerHTML).not.toContain('ff0000');
    expect(container.innerHTML).not.toContain('990000');
    expect(container.querySelector('[data-class~="hot"]')).not.toBeNull();
  });

  it('places geometry, and only geometry, in inline styles', () => {
    const { container } = render(
      <Diagram.Root source={'flowchart TD\n  A -->|label| B'}>
        <Diagram.Svg />
      </Diagram.Root>,
    );
    const figure = figureOf(container);

    for (const element of figure.querySelectorAll<SVGElement>('[data-part] [style]')) {
      expect(element.getAttribute('style')).toMatch(/^transform: translate\(/);
    }

    const declarations = (figure.getAttribute('style') ?? '')
      .split(';')
      .map((entry) => entry.split(':')[0]?.trim() ?? '')
      .filter(Boolean);

    expect(declarations.length).toBeGreaterThan(0);
    expect(declarations.every((property) => property.startsWith('--diagram-'))).toBe(true);
  });

  it('adds no paint and no transform attribute in canvas mode', () => {
    const { container } = render(
      <Diagram.Root source={'flowchart TD\n  A -->|label| B'}>
        <Diagram.Canvas>
          <Diagram.Svg />
        </Diagram.Canvas>
      </Diagram.Root>,
    );
    const figure = figureOf(container);
    const canvas = figure.querySelector<HTMLElement>('[data-part="canvas"]');

    for (const element of [figure, ...figure.querySelectorAll('*')]) {
      for (const attribute of element.attributes) {
        expect(
          FORBIDDEN_ATTRIBUTE.test(attribute.name),
          `${element.tagName} carries the paint attribute "${attribute.name}"`,
        ).toBe(false);
      }
    }

    // The view lives entirely in custom properties: the stylesheet composes the transform, so the
    // scene wrapper carries no inline style at all.
    const declarations = (canvas?.getAttribute('style') ?? '')
      .split(';')
      .map((entry) => entry.split(':')[0]?.trim() ?? '')
      .filter(Boolean);

    expect(declarations.length).toBeGreaterThan(0);
    expect(declarations.every((property) => property.startsWith('--diagram-canvas-'))).toBe(true);
    expect(figure.querySelector('[data-part="canvas-scene"]')?.getAttribute('style')).toBeNull();
  });

  it('leaves user-select alone and takes labels out of hit-testing only in CSS', () => {
    const { container } = render(
      <Diagram.Root source={'flowchart TD\n  A[Selectable] --> B'}>
        <Diagram.Svg />
      </Diagram.Root>,
    );

    for (const label of container.querySelectorAll<SVGElement>('[data-part="node-label"]')) {
      expect(label.style.userSelect).toBe('');
      expect(label.style.pointerEvents).toBe('');
    }
  });

  it('emits exactly one generated id per diagram and no <defs>', () => {
    const { container } = render(<HouseDiagram source={'flowchart TD\n  A --> B\n  B --> C'} />);
    const figure = figureOf(container);
    const ids = [figure, ...figure.querySelectorAll('*')]
      .map((element) => element.getAttribute('id'))
      .filter((id): id is string => id !== null);
    const roots = new Set(ids.map((id) => id.replace(/-(title|description)$/, '')));

    // Exactly one, not "at most one": zero would mean the aria-labelledby/-describedby wiring the
    // `-title`/`-description` suffixes above strip has vanished, which this test is the only guard for.
    expect(roots.size).toBe(1);
    expect(figure.querySelectorAll('defs')).toHaveLength(0);
    expect(figure.querySelectorAll('marker')).toHaveLength(0);
  });
});

/*
 * R3, the security half of the same contract: a diagram source is untrusted text, and every string
 * that comes out of it has to reach the DOM as a text node or an escaped attribute value — never as
 * markup, a link or a handler. React escapes by default, so this is a rule about what the renderers
 * are allowed to reach for: `dangerouslySetInnerHTML`, an `<a>` around a clicked node, an
 * `xlink:href`. `click` bindings are parsed and dropped today; the day a link part lands, this
 * fails.
 */
const HOSTILE: readonly (readonly [string, string, string])[] = [
  [
    'flowchart-label',
    'flowchart TD\n  A["</text><script>alert(1)</script>"] --> B["<img src=x onerror=alert(1)>"]',
    'script',
  ],
  [
    'sequence-participant',
    'sequenceDiagram\n  participant P as </text><script>a</script>\n  P->>P: <a xlink:href="javascript:alert(1)">go</a>',
    'xlink',
  ],
  ['pie-slice', 'pie showData\n  "<script>alert(1)</script>" : 10', 'script'],
];

const FORBIDDEN_SINK = /^(href|xlink:href|src|srcdoc|on[a-z]+)$/i;

describe('untrusted source strings', () => {
  it.each(HOSTILE)('%s stays text, with no markup and no link', (_name, source, expected) => {
    const { container } = render(<HouseDiagram source={source} />);
    const figure = figureOf(container);

    expect(figure.querySelector('[data-part="svg"]')).not.toBeNull();
    expect(figure.querySelectorAll('script, iframe, foreignObject, a')).toHaveLength(0);

    for (const element of [figure, ...figure.querySelectorAll('*')]) {
      for (const attribute of element.attributes) {
        expect(
          FORBIDDEN_SINK.test(attribute.name),
          `${element.tagName} carries the sink "${attribute.name}"`,
        ).toBe(false);
      }
    }

    // The hostile string survived as text, which is what proves it was escaped rather than parsed.
    expect(figure.textContent).toContain(expected);
  });
});

/*
 * Every `data-part` the renderers emit, against every one the stylesheet selects. A part with no
 * rule ships unstyled and nothing notices — the drawing looks right because its neighbours carry
 * the paint, until a consumer targets it or a scheme flips.
 *
 * The allowlist is for parts that are containers: a `<g>` grouping the nodes has nothing to paint,
 * and giving it a rule to satisfy this test would be worse than the gap. Anything else added to it
 * is a decision, which is the point of it being a list.
 */
describe('part coverage', () => {
  /*
   * Parts with nothing of their own to paint: groups that only position their children, and the
   * leaves whose ink comes from the part above them by inheritance. Each entry is a decision that a
   * rule would make worse, not an exemption of convenience.
   */
  const INHERITS = new Set([
    // Groups.
    'activations',
    'canvas-scene',
    'canvas-zoom',
    'cluster-label',
    'clusters',
    'edge',
    'edge-label',
    'edges',
    'frame',
    'frames',
    'frame-labels',
    'gantt-axis',
    'gantt-bars',
    'gantt-grid',
    'gantt-labels',
    'gantt-section',
    'gantt-sections',
    'gantt-task',
    'lifelines',
    'message-label',
    'messages',
    'nodes',
    'note',
    'notes',
    'participant',
    'participant-slot',
    'participants',
    'slice-labels',
    'slices',
    // Leaves that inherit: the legend name takes its color from `legend-item`, the title and the
    // sr-only description are house-classed text.
    'description',
    'legend-label',
    'title',
  ]);

  function emittedParts(): Set<string> {
    const parts = new Set<string>();

    for (const [, source] of sources()) {
      const { container } = render(<HouseDiagram source={source} title="Coverage" />);

      for (const element of container.querySelectorAll('[data-part]')) {
        parts.add(element.getAttribute('data-part') as string);
      }

      cleanup();
    }

    // Canvas parts only exist inside a viewport, which the house binding does not use.
    const { container } = render(
      <Diagram.Root source={'flowchart TD\n  A --> B'}>
        <Diagram.Canvas>
          <Diagram.Svg />
        </Diagram.Canvas>
      </Diagram.Root>,
    );

    for (const element of container.querySelectorAll('[data-part]')) {
      parts.add(element.getAttribute('data-part') as string);
    }

    return parts;
  }

  const styled = new Set(
    [
      ...readFileSync(join(import.meta.dirname, 'diagram.css'), 'utf8').matchAll(
        /data-part=['"]([a-z-]+)['"]/g,
      ),
    ].map((match) => match[1] as string),
  );

  it('reads the stylesheet and the corpus', () => {
    expect(styled.size).toBeGreaterThan(20);
    expect(emittedParts().size).toBeGreaterThan(20);
  });

  it('styles every part the renderers emit', () => {
    const unstyled = [...emittedParts()]
      .filter((part) => !styled.has(part) && !INHERITS.has(part))
      .sort();

    expect(unstyled, 'add a rule in diagram.css, or record it as inheriting').toEqual([]);
  });

  it('selects no part that nothing emits', () => {
    const emitted = emittedParts();
    const orphans = [...styled].filter((part) => !emitted.has(part)).sort();

    expect(orphans, 'a rule for a part no renderer produces is dead paint').toEqual([]);
  });
});
