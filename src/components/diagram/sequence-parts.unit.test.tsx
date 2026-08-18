// @vitest-environment happy-dom
/*
 * The sequence view. Kept apart from `diagram.unit.test.tsx` because what matters here is the part
 * vocabulary and the draw order — a message label painted before the lifelines is struck through by
 * every one of them.
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Diagram } from '@/components/diagram/diagram';
import { HouseDiagram } from '@/components/diagram/house-diagram';

afterEach(() => {
  cleanup();
});

const SEQUENCE = `sequenceDiagram
  autonumber
  participant C as Claude
  actor Owner
  C->>+Owner: publish_spec
  Owner-->>-C: artifact url
  C->>C: retry
  Note right of Owner: reviewed by hand
  alt accepted
    C->>Owner: publish
  else rejected
    C--xOwner: give up
  end`;

function draw(source = SEQUENCE) {
  return render(
    <Diagram.Root source={source}>
      <Diagram.Svg />
    </Diagram.Root>,
  );
}

function parts(container: HTMLElement, part: string): Element[] {
  return [...container.querySelectorAll(`[data-part="${part}"]`)];
}

describe('sequence parts', () => {
  it('draws one group per scene collection', () => {
    const { container } = draw();
    const svg = container.querySelector('[data-part="svg"]') as Element;

    expect([...svg.children].map((child) => child.getAttribute('data-part'))).toEqual([
      'frames',
      'lifelines',
      'activations',
      'notes',
      'messages',
      'participants',
      'labels',
    ]);
  });

  it('draws a header, a footer and a lifeline for every participant', () => {
    const { container } = draw();

    expect(parts(container, 'participant')).toHaveLength(2);
    expect(parts(container, 'participant-box')).toHaveLength(4);
    expect(parts(container, 'lifeline')).toHaveLength(2);
    expect(
      parts(container, 'participant-slot').map((slot) => slot.getAttribute('data-position')),
    ).toEqual(['header', 'footer', 'header', 'footer']);
  });

  it('flags an actor and never an ordinary participant', () => {
    const { container } = draw();
    const flagged = parts(container, 'participant').map((participant) =>
      participant.hasAttribute('data-actor'),
    );

    expect(flagged).toEqual([false, true]);
  });

  it('carries the author intent onto every message', () => {
    const { container } = draw();
    const messages = parts(container, 'message');

    expect(messages).toHaveLength(5);
    expect(messages[0]?.getAttribute('data-line')).toBe('solid');
    expect(messages[1]?.getAttribute('data-line')).toBe('dotted');
    expect(messages[1]?.getAttribute('data-reversed')).toBe('');
    expect(messages[2]?.getAttribute('data-self')).toBe('');
    expect(messages.at(-1)?.getAttribute('data-arrow')).toBe('cross');
    expect(parts(container, 'message-arrow')).toHaveLength(5);
  });

  it('draws no arrow path for a headless message', () => {
    const { container } = draw('sequenceDiagram\n  A->B: no head');

    expect(parts(container, 'message-path')).toHaveLength(1);
    expect(parts(container, 'message-arrow')).toHaveLength(0);
  });

  it('puts every label in the overlay layer, on a plate', () => {
    const { container } = draw();
    const labels = container.querySelector('[data-part="labels"]') as Element;

    expect(parts(container, 'message-label')).toHaveLength(5);
    expect(labels.querySelectorAll('[data-part="message-label-bg"]')).toHaveLength(5);
    expect(labels.querySelectorAll('[data-part="frame-title"]')).toHaveLength(1);
    expect(labels.querySelectorAll('[data-part="frame-label"]')).toHaveLength(1);
    expect(labels.querySelectorAll('[data-part="frame-section-label"]')).toHaveLength(1);
  });

  it('prefixes autonumbered labels', () => {
    const { container } = draw();
    const first = parts(container, 'message-label')[0];

    expect(first?.textContent).toBe('1 publish_spec');
  });

  it('draws an activation bar per activation, tagged with its depth', () => {
    const { container } = draw();
    const bars = parts(container, 'activation');

    expect(bars).toHaveLength(1);
    expect(bars[0]?.getAttribute('data-participant')).toBe('Owner');
    expect(bars[0]?.getAttribute('data-depth')).toBe('0');
  });

  it('draws a note as a box and a label, tagged with its placement', () => {
    const { container } = draw();

    expect(parts(container, 'note')).toHaveLength(1);
    expect(parts(container, 'note')[0]?.getAttribute('data-placement')).toBe('right');
    expect(parts(container, 'note-label')[0]?.textContent).toBe('reviewed by hand');
  });

  it('draws a frame as a box, a tab and one divider per section', () => {
    const { container } = draw();
    const frame = parts(container, 'frame')[0];

    expect(frame?.getAttribute('data-kind')).toBe('alt');
    expect(frame?.getAttribute('data-depth')).toBe('0');
    expect(frame?.querySelectorAll('[data-part="frame-box"]')).toHaveLength(1);
    expect(frame?.querySelectorAll('[data-part="frame-tab"]')).toHaveLength(1);
    expect(frame?.querySelectorAll('[data-part="frame-section"]')).toHaveLength(1);
  });

  it('nests frames as separate boxes, deepest last', () => {
    const { container } = draw(
      'sequenceDiagram\n  loop outer\n    opt inner\n      A->>B: x\n    end\n  end',
    );

    expect(parts(container, 'frame').map((frame) => frame.getAttribute('data-depth'))).toEqual([
      '0',
      '1',
    ]);
  });

  it('names the diagram from the generated summary and lists it for screen readers', () => {
    const { container } = render(<HouseDiagram source={SEQUENCE} />);
    const svg = container.querySelector('[data-part="svg"]');
    const description = container.querySelector('[data-part="description"]');

    expect(svg?.getAttribute('aria-label')).toContain('Sequence diagram: 2 participants');
    expect(description?.textContent).toContain('Claude tells Owner');
  });

  it('renders nothing at all for a header with no participants', () => {
    const { container } = draw('sequenceDiagram');

    expect(container.querySelector('[data-part="svg"]')?.children).toHaveLength(0);
  });
});
