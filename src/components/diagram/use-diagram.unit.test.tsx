// @vitest-environment happy-dom
/*
 * The font refinement (C27). The rendered-text measurer is stubbed because happy-dom reports no
 * text metrics — what matters is the control flow: measure with the deterministic table first,
 * audit once after the fonts settle, re-lay-out at most once, and never oscillate.
 */

import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Diagram } from '@/components/diagram/diagram';
import { metricsMeasurer } from '@/lib/diagram/core/text/measurers';
import type { Size, TextMeasurer, TextStyle } from '@/lib/diagram/types';

const stub = vi.hoisted(() => ({ measurer: null as TextMeasurer | null }));

// vi.mock is hoisted above the imports, so the component under test receives the stubbed factory.
vi.mock('@/lib/diagram/core/text/measurers', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();

  return {
    ...actual,
    createSvgMeasurer: () =>
      stub.measurer ?? { id: 'svg', measure: () => ({ width: 0, height: 0 }) },
  };
});

const SOURCE = 'flowchart TD\n  A[A reasonably long label here] --> B[Another one]';

function scaled(factor: number): TextMeasurer {
  return {
    id: `svg-x${factor}`,
    measure: (text: string, style: TextStyle): Size => {
      const size = metricsMeasurer.measure(text, style);

      return { width: size.width * factor, height: size.height };
    },
  };
}

function box(container: HTMLElement): string | null {
  return container.querySelector('[data-part="svg"]')?.getAttribute('viewBox') ?? null;
}

function draw() {
  return (
    <Diagram.Root source={SOURCE}>
      <Diagram.Svg />
    </Diagram.Root>
  );
}

beforeEach(() => {
  stub.measurer = null;
});

afterEach(() => {
  cleanup();

  // The hook keeps one hidden probe per document and reuses its measurer; dropping the probe is
  // what a fresh document does, and it is how the next case gets the next stub.
  for (const probe of document.querySelectorAll('body > svg[aria-hidden="true"]')) {
    probe.remove();
  }
});

describe('font refinement', () => {
  it('re-lays-out once when the table is more than 2% off, then stabilises', async () => {
    const first = render(draw());
    const table = box(first.container);

    cleanup();
    stub.measurer = scaled(1.3);

    const { container, rerender } = render(draw());

    await waitFor(() => {
      expect(box(container)).not.toBe(table);
    });

    const refined = box(container);

    rerender(draw());
    await Promise.resolve();

    expect(box(container)).toBe(refined);
  });

  it('leaves the layout alone when the table is within tolerance', async () => {
    const first = render(draw());
    const table = box(first.container);

    cleanup();
    stub.measurer = scaled(1.01);

    const { container } = render(draw());

    await waitFor(() => {
      expect(container.querySelector('[data-part="svg"]')).not.toBeNull();
    });

    expect(box(container)).toBe(table);
  });

  it('never refines when the caller pinned a measurer', async () => {
    const first = render(draw());
    const table = box(first.container);

    cleanup();
    stub.measurer = scaled(1.5);

    const { container } = render(
      <Diagram.Root source={SOURCE} measurer={metricsMeasurer}>
        <Diagram.Svg />
      </Diagram.Root>,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-part="svg"]')).not.toBeNull();
    });

    expect(box(container)).toBe(table);
  });
});
