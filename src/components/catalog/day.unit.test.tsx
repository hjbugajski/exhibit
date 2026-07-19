// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { Day } from '@/components/catalog/day';
import { Stop } from '@/components/catalog/stop';

/** Stub the Map chunk (maplibre-gl needs WebGL); render marker labels so order is assertable. */
vi.mock('@/components/catalog/map', () => ({
  Map: ({ props }: { props: CatalogComponentProps<'Map'> }) => (
    <div data-testid="day-map">{props.markers?.map((marker) => marker.label).join(', ')}</div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Day', () => {
  it('auto-renders a map of child stops with coordinates, in mount order', () => {
    render(
      <Day props={{ label: 'Day 1' }}>
        <Stop props={{ title: 'Shrine', coordinates: { lat: 34.9671, lng: 135.7727 } }} />
        <Stop props={{ title: 'Lunch' }} />
        <Stop props={{ title: 'Hotel', coordinates: { lat: 35.0031, lng: 135.7726 } }} />
      </Day>,
    );

    expect(screen.getByTestId('day-map').textContent).toBe('Shrine, Hotel');
  });

  it('renders no map when no child stop has coordinates', () => {
    render(
      <Day props={{ label: 'Day 2' }}>
        <Stop props={{ title: 'Lunch' }} />
      </Day>,
    );

    expect(screen.queryByTestId('day-map')).toBeNull();
  });

  it('drops a stop from the map when it unmounts', () => {
    const { rerender } = render(
      <Day props={{ label: 'Day 1' }}>
        <Stop key="shrine" props={{ title: 'Shrine', coordinates: { lat: 1, lng: 2 } }} />
        <Stop key="hotel" props={{ title: 'Hotel', coordinates: { lat: 3, lng: 4 } }} />
      </Day>,
    );

    rerender(
      <Day props={{ label: 'Day 1' }}>
        <Stop key="hotel" props={{ title: 'Hotel', coordinates: { lat: 3, lng: 4 } }} />
      </Day>,
    );

    expect(screen.getByTestId('day-map').textContent).toBe('Hotel');
  });
});
