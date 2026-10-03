// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CatalogComponentProps } from '@/catalog/catalog';
import CatalogChartInner from '@/components/catalog/chart-inner';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CatalogChartInner', () => {
  it('renders a bar chart without console errors', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const props: CatalogComponentProps<'Chart'> = {
      kind: 'bar',
      data: [
        { label: 'Mon', value: 1 },
        { label: 'Tue', value: 2 },
      ],
    };

    const { container } = render(<CatalogChartInner props={props} />);

    // One <rect> per bar, so an empty scene cannot pass on the console assertion alone.
    expect(container.querySelectorAll('svg rect').length).toBeGreaterThanOrEqual(2);
    expect(consoleError).not.toHaveBeenCalled();
  });

  // Each kind names the SVG primitive it must emit, so an empty scene cannot pass on the console
  // assertion alone. The donut draws one arc path per slice.
  it.each([
    { kind: 'line', selector: 'svg path', minimum: 1 },
    { kind: 'area', selector: 'svg path', minimum: 2 },
    { kind: 'scatter', selector: 'svg circle', minimum: 2 },
    { kind: 'donut', selector: 'svg path', minimum: 2 },
  ] as const)('renders a $kind chart without console errors', ({ kind, selector, minimum }) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const props: CatalogComponentProps<'Chart'> = {
      kind,
      data: [
        { label: 'Mon', value: 1 },
        { label: 'Tue', value: 2 },
      ],
    };

    const { container } = render(<CatalogChartInner props={props} />);

    expect(container.querySelectorAll(selector).length).toBeGreaterThanOrEqual(minimum);
    expect(consoleError).not.toHaveBeenCalled();
  });

  describe('with repeated labels', () => {
    const data = [
      { label: 'Q1', value: 1 },
      { label: 'Q2', value: 2 },
      { label: 'Q1', value: 3 },
      { label: 'Q2', value: 4 },
    ];

    it('draws every bar in its own slot', () => {
      const { container } = render(<CatalogChartInner props={{ kind: 'bar', data }} />);
      const bars = [...container.querySelectorAll('svg rect')];
      const positions = new Set(bars.map((bar) => bar.getAttribute('x')));

      expect(bars).toHaveLength(4);
      expect(positions.size).toBe(4);
    });

    it('labels every slot on the axis', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { container } = render(<CatalogChartInner props={{ kind: 'line', data }} />);
      const ticks = [...container.querySelectorAll('svg text')].map((node) => node.textContent);

      expect(ticks.filter((tick) => tick === 'Q1')).toHaveLength(2);
      expect(consoleError).not.toHaveBeenCalled();
    });

    it('colors every donut slice on its own', () => {
      const { container } = render(<CatalogChartInner props={{ kind: 'donut', data }} />);
      const arcs = [...container.querySelectorAll('svg path')];
      const fills = new Set(arcs.map((arc) => arc.getAttribute('fill')));

      expect(arcs).toHaveLength(4);
      expect(fills.size).toBe(4);
    });
  });

  /** The plotted values are hover-only, so the table is the text alternative. */
  it('names the chart and repeats its data as a table', () => {
    const props: CatalogComponentProps<'Chart'> = {
      kind: 'bar',
      valueLabel: 'Cost ($)',
      data: [
        { label: 'Mon', value: 1 },
        { label: 'Tue', value: 2 },
      ],
    };

    render(<CatalogChartInner props={props} />);

    const table = screen.getByRole('table', { name: 'Cost ($) bar chart, 2 data points' });

    expect(screen.getByRole('rowheader', { name: 'Mon' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: '2' })).toBeTruthy();
    expect(table.className).toContain('sr-only');
  });
});
