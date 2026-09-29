// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { Day } from '@/components/catalog/day';
import { elevationSeries, Trail } from '@/components/catalog/trail';

/** Stub both lazy chunks (maplibre-gl needs WebGL); print their props so they are assertable. */
vi.mock('@/components/catalog/map', () => ({
  Map: ({ props }: { props: CatalogComponentProps<'Map'> }) => (
    <pre data-testid="map">{JSON.stringify(props)}</pre>
  ),
}));

vi.mock('@/components/catalog/chart', () => ({
  Chart: ({ props }: { props: CatalogComponentProps<'Chart'> }) => (
    <pre data-testid="chart">{JSON.stringify(props)}</pre>
  ),
}));

type Props = CatalogComponentProps<'Trail'>;

const base: Props = {
  name: 'Mount Tam loop',
  distance: { value: 8.4, unit: 'km' },
  elevationGain: { value: 650, unit: 'm' },
  difficulty: 'moderate',
  routeType: 'out-and-back',
};

const track = [
  { lat: 37.9, lng: -122.6 },
  { lat: 37.91, lng: -122.58 },
];
const waypoints = [{ id: 'trailhead', lat: 37.9, lng: -122.6, label: 'Trailhead' }];

function propsOf(testId: string): Record<string, unknown> {
  return JSON.parse(screen.getByTestId(testId).textContent ?? '');
}

afterEach(() => {
  cleanup();
});

describe('Trail', () => {
  it('renders the name, difficulty badge, and stats', () => {
    render(<Trail props={{ ...base, duration: '4 hours', markdown: 'Bring water.' }} />);

    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Mount Tam loop');
    expect(screen.getByText('Moderate')).toBeTruthy();
    expect(screen.getByText('8.4 km')).toBeTruthy();
    expect(screen.getByText('650 m')).toBeTruthy();
    expect(screen.getByText('4 hours')).toBeTruthy();
    expect(screen.getByText('Out and back')).toBeTruthy();
    expect(screen.getByText('Bring water.')).toBeTruthy();
  });

  it('draws the track and waypoints on its map', () => {
    render(<Trail props={{ ...base, track, waypoints }} />);

    expect(propsOf('map')).toEqual({ markers: waypoints, paths: [{ id: 'track', points: track }] });
  });

  it('renders no map and no chart without track, waypoints, or profile', () => {
    render(<Trail props={base} />);

    expect(screen.queryByTestId('map')).toBeNull();
    expect(screen.queryByTestId('chart')).toBeNull();
  });

  it('charts the elevation profile as an area', () => {
    render(<Trail props={{ ...base, elevationProfile: [100, 400, 750] }} />);

    expect(propsOf('chart')).toMatchObject({ kind: 'area', valueLabel: 'Elevation (m)' });
  });

  it('keeps no Day auto-map for a Trail inside a Day', () => {
    render(
      <Day props={{ label: 'Day 1' }}>
        <Trail props={{ ...base, track }} />
      </Day>,
    );

    expect(screen.getAllByTestId('map')).toHaveLength(1);
  });
});

describe('elevationSeries', () => {
  it('uses the fewest fraction digits that keep labels unique', () => {
    const labels = elevationSeries(
      Array.from({ length: 101 }, () => 0),
      { value: 1, unit: 'km' },
    ).map((point) => point.label);

    expect(new Set(labels).size).toBe(101);
    expect(labels[0]).toBe('0.00 km');
    expect(labels.at(-1)).toBe('1.00 km');
  });

  it('labels each sample with its distance from the start', () => {
    expect(elevationSeries([10, 20, 30], { value: 10, unit: 'mi' })).toEqual([
      { label: '0.0 mi', value: 10 },
      { label: '5.0 mi', value: 20 },
      { label: '10.0 mi', value: 30 },
    ]);
  });
});
