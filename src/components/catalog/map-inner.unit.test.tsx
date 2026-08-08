// @vitest-environment happy-dom
import type { ReactNode } from 'react';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CatalogComponentProps } from '@/catalog/catalog';
import CatalogMapInner from '@/components/catalog/map-inner';

/**
 * The real ui/map/map.tsx wraps maplibre-gl, which needs WebGL (unavailable in happy-dom); stub the
 * map modules with passthrough components so we can assert on the keys CatalogMapInner assigns to
 * markers without a real map instance.
 */
vi.mock('@/components/ui/map/map', () => ({
  Map: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/map/controls', () => ({
  MapControls: () => null,
}));
vi.mock('@/components/ui/map/route', () => ({
  MapRoute: () => null,
}));
vi.mock('@/components/ui/map/marker', () => ({
  Marker: {
    Root: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Content: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Label: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
    Popup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CatalogMapInner', () => {
  it('renders every marker even when labels duplicate but ids differ', () => {
    const props: CatalogComponentProps<'Map'> = {
      markers: [
        { id: 'lunch-1', label: 'Lunch', lat: 1, lng: 1 },
        { id: 'lunch-2', label: 'Lunch', lat: 2, lng: 2 },
      ],
    };

    render(<CatalogMapInner props={props} />);

    // Two marker labels on the map, plus their two entries in the visually hidden list.
    expect(screen.getAllByText('Lunch')).toHaveLength(4);
  });

  it('lists every marker label and description as a text alternative to the canvas', () => {
    const props: CatalogComponentProps<'Map'> = {
      markers: [
        { id: 'shrine', label: 'Shrine', description: 'Opens at 9am', lat: 1, lng: 1 },
        { id: 'hotel', label: 'Hotel', lat: 2, lng: 2 },
      ],
    };

    render(<CatalogMapInner props={props} />);

    const items = screen.getByRole('list', { name: 'Map markers' }).children;

    expect([...items].map((item) => item.textContent)).toEqual(['Shrine: Opens at 9am', 'Hotel']);
  });

  it('renders no marker list when the map has no markers', () => {
    render(<CatalogMapInner props={{ center: { lat: 1, lng: 1 } }} />);

    expect(screen.queryByRole('list')).toBeNull();
  });
});
