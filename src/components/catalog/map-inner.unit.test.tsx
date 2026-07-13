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

    expect(screen.getAllByText('Lunch')).toHaveLength(2);
  });
});
