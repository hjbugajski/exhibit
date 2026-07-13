// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
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

    render(<CatalogChartInner props={props} />);

    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders a line chart without console errors', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const props: CatalogComponentProps<'Chart'> = {
      kind: 'line',
      data: [
        { label: 'Mon', value: 1 },
        { label: 'Tue', value: 2 },
      ],
    };

    render(<CatalogChartInner props={props} />);

    expect(consoleError).not.toHaveBeenCalled();
  });
});
