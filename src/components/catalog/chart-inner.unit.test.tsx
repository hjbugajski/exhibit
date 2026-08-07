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
