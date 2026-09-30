// @vitest-environment happy-dom
import type { Spec } from '@json-render/core';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { SpecView } from '@/catalog/registry';

/** Stub the Map chunk (maplibre-gl needs WebGL); expose its markers and paths. */
vi.mock('@/components/catalog/map', () => ({
  Map: ({ props }: { props: CatalogComponentProps<'Map'> }) => (
    <div
      data-markers={props.markers?.map((marker) => marker.label).join(' | ')}
      data-paths={props.paths?.map((path) => path.id).join(' ')}
      data-testid="map"
    />
  ),
}));

afterEach(() => {
  cleanup();
});

/** An Itinerary of Days, each with the given stop count; stops carry coordinates when `mapped`. */
function trip(days: { label: string; stops: number; mapped: boolean }[]): Spec {
  const elements: Spec['elements'] = {
    trip: { type: 'Itinerary', props: { title: 'Trip' }, children: [] },
  };

  for (const [dayIndex, day] of days.entries()) {
    const dayKey = `day-${dayIndex + 1}`;
    const stopKeys = Array.from({ length: day.stops }, (_, i) => `${dayKey}-stop-${i + 1}`);

    elements.trip?.children?.push(dayKey);
    elements[dayKey] = { type: 'Day', props: { label: day.label }, children: stopKeys };

    for (const [i, key] of stopKeys.entries()) {
      elements[key] = {
        type: 'Stop',
        props: {
          title: `${day.label} stop ${i + 1}`,
          coordinates: day.mapped ? { lat: dayIndex, lng: i } : undefined,
        },
        children: [],
      };
    }
  }

  return { root: 'trip', elements };
}

describe('Itinerary', () => {
  it('renders a trip map of every day plus each day map', () => {
    render(
      <SpecView
        spec={trip([
          { label: 'Day 1', stops: 2, mapped: true },
          { label: 'Day 2', stops: 1, mapped: true },
        ])}
      />,
    );

    const [tripMap, ...dayMaps] = screen.getAllByTestId('map');

    expect(dayMaps).toHaveLength(2);
    expect(tripMap?.dataset.markers).toBe('Day 1 stop 1 | Day 1 stop 2 | Day 2 stop 1');
    expect(tripMap?.dataset.paths).toBe('route-day-1');
  });

  it('renders no trip map when only one day is mapped', () => {
    render(
      <SpecView
        spec={trip([
          { label: 'Day 1', stops: 2, mapped: true },
          { label: 'Day 2', stops: 2, mapped: false },
        ])}
      />,
    );

    expect(screen.getAllByTestId('map')).toHaveLength(1);
  });

  it('links each day from the day index', () => {
    const { container } = render(
      <SpecView
        spec={trip([
          { label: 'Day 1: Kyoto', stops: 1, mapped: false },
          { label: 'Day 2: Osaka', stops: 1, mapped: false },
        ])}
      />,
    );

    const links = within(screen.getByRole('navigation', { name: 'Days' })).getAllByRole('link');
    const dayIds = [...container.querySelectorAll('section')].map((section) => `#${section.id}`);

    expect(links.map((link) => link.getAttribute('href'))).toEqual(dayIds);
    expect(dayIds).toEqual(['#day-1-kyoto', '#day-2-osaka']);
  });

  it('renders no day index for a single day', () => {
    render(<SpecView spec={trip([{ label: 'Day 1', stops: 1, mapped: true }])} />);

    expect(screen.queryByRole('navigation', { name: 'Days' })).toBeNull();
  });
});
