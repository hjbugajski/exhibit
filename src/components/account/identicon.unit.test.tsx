// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Identicon } from './identicon';

afterEach(cleanup);

/** Everything visual about one render. */
function fingerprint(container: HTMLElement): string {
  const svg = container.querySelector('svg');
  const cells = [...(svg?.querySelectorAll('rect') ?? [])].map(
    (cell) => `${cell.getAttribute('x')},${cell.getAttribute('y')},${cell.getAttribute('fill')}`,
  );

  return JSON.stringify({ viewBox: svg?.getAttribute('viewBox'), cells });
}

describe('Identicon', () => {
  it('is deterministic: the same seed renders the same pixels', () => {
    const first = fingerprint(render(<Identicon seed="owner@example.com" />).container);
    cleanup();
    const second = fingerprint(render(<Identicon seed="owner@example.com" />).container);

    expect(first).toBe(second);
  });

  it('different seeds render different patterns', () => {
    const first = fingerprint(render(<Identicon seed="owner@example.com" />).container);
    cleanup();
    const second = fingerprint(render(<Identicon seed="someone-else@example.com" />).container);

    expect(first).not.toBe(second);
  });

  it('has no background: every rect is a 1×1 sprite pixel', () => {
    const { container } = render(<Identicon seed="owner@example.com" />);
    const pixels = [...container.querySelectorAll('rect')];

    expect(pixels.length).toBeGreaterThan(0);

    for (const pixel of pixels) {
      expect(pixel.getAttribute('width')).toBe('1');
      expect(pixel.getAttribute('height')).toBe('1');
    }
  });

  it('viewBox is exactly the bounding box of the lit cells', () => {
    const { container } = render(<Identicon seed="owner@example.com" />);
    const svg = container.querySelector('svg');
    const pixels = [...container.querySelectorAll('rect')];
    const xs = pixels.map((pixel) => Number(pixel.getAttribute('x')));
    const ys = pixels.map((pixel) => Number(pixel.getAttribute('y')));
    const xMin = Math.min(...xs);
    const yMin = Math.min(...ys);
    const expected = `${xMin} ${yMin} ${Math.max(...xs) - xMin + 1} ${Math.max(...ys) - yMin + 1}`;

    expect(svg?.getAttribute('viewBox')).toBe(expected);
  });
});
