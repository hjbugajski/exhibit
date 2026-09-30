import { renderToString } from 'react-dom/server';

// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { itineraryFixture } from '@/catalog/fixtures/itinerary';
import { SpecView } from '@/catalog/registry';
import type { StopMarker } from '@/catalog/stop-markers';
import { Day } from '@/components/catalog/day';

/** Stub the Map chunk (maplibre-gl needs WebGL); render labels and paths so both are assertable. */
vi.mock('@/components/catalog/map', () => ({
  Map: ({ props }: { props: CatalogComponentProps<'Map'> }) => (
    <div data-testid="map">
      <span data-testid="map-labels">
        {props.markers?.map((marker) => marker.label).join(' | ')}
      </span>
      {props.paths?.map((path) => (
        <span
          data-dashed={path.dashed ? '' : undefined}
          data-points={path.points.length}
          data-testid="map-path"
          key={path.id}
        />
      ))}
    </div>
  ),
}));

afterEach(() => {
  cleanup();
});

function marker(id: string, label: string): StopMarker {
  return { id, lat: 1, lng: 2, label };
}

describe('Day', () => {
  it('renders the given markers as a numbered, dashed route', () => {
    render(
      <Day
        markers={[marker('a', 'Shrine'), marker('b', 'Lunch'), marker('c', 'Hotel')]}
        props={{ label: 'Day 1' }}
      />,
    );

    expect(screen.getByTestId('map-labels').textContent).toBe('1. Shrine | 2. Lunch | 3. Hotel');
    const paths = screen.getAllByTestId('map-path');

    expect(paths).toHaveLength(1);
    expect(paths[0]?.dataset.points).toBe('3');
    expect(paths[0]?.hasAttribute('data-dashed')).toBe(true);
  });

  it('draws no route for a single marker', () => {
    render(<Day markers={[marker('a', 'Shrine')]} props={{ label: 'Day 1' }} />);

    expect(screen.getByTestId('map-labels').textContent).toBe('1. Shrine');
    expect(screen.queryByTestId('map-path')).toBeNull();
  });

  it('renders no map without markers', () => {
    render(<Day props={{ label: 'Day 2' }} />);

    expect(screen.queryByTestId('map')).toBeNull();
  });

  it("uses the label's slug as the section id", () => {
    const { container } = render(<Day props={{ label: 'Day 1: Kyoto & Nara' }} />);

    expect(container.querySelector('section')?.id).toBe('day-1-kyoto-nara');
  });

  it('renders no id for a label with no slug', () => {
    const { container } = render(<Day props={{ label: '— ✈ —' }} />);

    expect(container.querySelector('section')?.hasAttribute('id')).toBe(false);
  });

  /** The map must exist before any effect runs, or it appears a commit late and shifts the stops. */
  it("server-renders the fixture's day map with its stop labels", () => {
    const html = renderToString(<SpecView spec={itineraryFixture} />);
    const { elements } = itineraryFixture;
    const day1Stops = (elements['day-1']?.children ?? [])
      .filter((key) => elements[key]?.type === 'Stop')
      .map((key) => elements[key]?.props.title as string);

    expect(day1Stops.length).toBeGreaterThan(0);
    for (const [index, title] of day1Stops.entries()) {
      expect(html).toContain(`${index + 1}. ${title}`);
    }
  });
});
