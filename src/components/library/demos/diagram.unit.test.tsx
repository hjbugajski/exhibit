// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { diagramDemo } from '@/components/library/demos/diagram';

afterEach(() => {
  cleanup();
});

function compare(a: string | null, b: string | null): number {
  return String(a).localeCompare(String(b));
}

function figures(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[data-slot="diagram"]')];
}

describe('diagram demo page', () => {
  it('draws every story, one figure per specimen', () => {
    const { container } = render(diagramDemo.render());
    const drawn = figures(container).filter((figure) => figure.querySelector('[data-part="svg"]'));

    // Flowchart (5), sequence, state, pie, composability (3), theming (3), recovery,
    // unsupported, audit.
    expect(drawn.length).toBe(17);
    expect(container.querySelectorAll('[data-part="cluster"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-part="slice"]').length).toBe(4);
  });

  it('keeps every shape and link variant on the page', () => {
    const { container } = render(diagramDemo.render());
    const shapes = new Set(
      [...container.querySelectorAll('[data-part="node"]')].map((node) =>
        node.getAttribute('data-shape'),
      ),
    );
    const lines = new Set(
      [...container.querySelectorAll('[data-part="edge"]')].map((edge) =>
        edge.getAttribute('data-line'),
      ),
    );
    const arrows = new Set(
      [...container.querySelectorAll('[data-part="edge"]')].map((edge) =>
        edge.getAttribute('data-arrow'),
      ),
    );

    for (const shape of [
      'rect',
      'round',
      'stadium',
      'subroutine',
      'cylinder',
      'circle',
      'double-circle',
      'diamond',
      'hexagon',
      'parallelogram',
      'parallelogram-alt',
      'trapezoid',
      'trapezoid-alt',
      'asymmetric',
      'state-start',
      'state-end',
      'state-choice',
      'state-bar',
      'state-note',
    ]) {
      expect(shapes).toContain(shape);
    }

    expect([...lines].sort(compare)).toEqual(['dotted', 'invisible', 'solid', 'thick']);
    expect([...arrows].sort(compare)).toEqual(['arrow', 'circle', 'cross', 'none']);
  });

  it('recovers from a broken statement and still lists the issue', () => {
    const { container } = render(diagramDemo.render());
    const issues = [...container.querySelectorAll('[data-part="issue"]')];

    expect(issues.some((issue) => issue.getAttribute('data-code') === 'expected-node')).toBe(true);
    expect(
      issues.some((issue) => issue.getAttribute('data-code') === 'unsupported-construct'),
    ).toBe(true);
  });

  it('falls back to the source for a deferred family, once, naming the family', () => {
    render(diagramDemo.render());

    // The fallback is the source block, so the panel must not print it a second time.
    expect(screen.getAllByText(/gantt/).length).toBe(1);
    expect(screen.getAllByText(/Gantt charts aren’t supported yet/).length).toBe(1);
    expect(screen.queryByText(/No diagram type recognized/)).toBeNull();
  });

  it('draws the sequence story with every construct the family supports', () => {
    const { container } = render(diagramDemo.render());

    expect(container.querySelectorAll('[data-part="lifeline"]').length).toBe(4);
    expect(container.querySelectorAll('[data-part="activation"]').length).toBe(3);
    expect(container.querySelectorAll('[data-part="note"]').length).toBe(1);
    expect(container.querySelector('[data-part="frame"]')?.getAttribute('data-kind')).toBe('alt');
    expect(container.querySelector('[data-part="message-label"]')?.textContent).toBe(
      '1 publish_spec',
    );
  });

  it('honours the components override and the replaced shape', () => {
    const { container } = render(diagramDemo.render());
    const hot = [...container.querySelectorAll('[data-part="node"][data-class~="hot"]')];

    expect(hot.length).toBe(2);
    expect(hot.every((node) => node.querySelector('circle'))).toBe(true);
    // The folded card is the only rect outline that closes and then re-opens with a second `M`.
    expect(
      [...container.querySelectorAll('[data-shape="rect"] [data-part="node-shape"]')].filter(
        (shape) => (shape.getAttribute('d') ?? '').includes('ZM'),
      ).length,
    ).toBe(3);
  });

  it('re-skins with custom properties without changing geometry', () => {
    const { container } = render(diagramDemo.render());
    const themed = figures(container).filter((figure) => figure.querySelector('[data-part="svg"]'));
    const [house, tier0, skin] = themed.slice(11, 14);

    expect(house?.style.getPropertyValue('--diagram-node-fill')).toBe('');
    expect(tier0?.style.getPropertyValue('--diagram-node-fill')).toBe('transparent');
    expect(skin?.style.getPropertyValue('--diagram-edge-stroke')).toBe('var(--color-info)');
    expect(tier0?.querySelector('[data-part="svg"]')?.getAttribute('viewBox')).toBe(
      house?.querySelector('[data-part="svg"]')?.getAttribute('viewBox'),
    );
  });

  it('reports rather than throws when the browser cannot measure', async () => {
    render(diagramDemo.render());

    await userEvent.click(screen.getByRole('button', { name: 'Measure InterVariable' }));
    await userEvent.click(screen.getByRole('button', { name: 'Run measurement audit' }));

    // happy-dom has neither a 2D canvas nor getComputedTextLength; both panels must say so.
    expect(screen.getByText(/nothing can be measured/)).toBeTruthy();
    expect(screen.getByText(/no SVG text measurement/)).toBeTruthy();
  });

  it('toggles the measured-box overlay', async () => {
    const { container } = render(diagramDemo.render());

    expect(container.querySelectorAll('[data-part="node-label"] ~ *').length).toBe(0);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Show measured label boxes' }));

    expect(container.querySelectorAll('rect + [data-part="node-label"]').length).toBe(3);
  });
});
