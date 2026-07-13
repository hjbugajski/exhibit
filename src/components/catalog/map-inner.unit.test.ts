import { describe, expect, it } from 'vitest';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { fitOptions } from '@/components/catalog/map-inner';

/**
 * fitOptions is pure (see map-inner.tsx) but excluded from map-inner.unit.test.tsx's coverage there
 * because that file mocks the whole ui/map module for WebGL reasons - test it directly here
 * instead. resolveTokenColor stays untested (needs a real canvas).
 */
describe('fitOptions', () => {
  it('uses an explicit center/zoom over any markers or paths', () => {
    const props: CatalogComponentProps<'Map'> = {
      center: { lat: 10, lng: 20 },
      zoom: 8,
      markers: [{ id: 'm1', label: 'Marker', lat: 1, lng: 1 }],
    };

    expect(fitOptions(props)).toEqual({ center: [20, 10], zoom: 8 });
  });

  it('falls back to a world view with no center, markers, or paths', () => {
    const props: CatalogComponentProps<'Map'> = {};

    expect(fitOptions(props)).toEqual({ center: [0, 20], zoom: 1.5 });
  });

  it('fits bounds to the min/max of marker and path points, padded, when there is no explicit center', () => {
    const props: CatalogComponentProps<'Map'> = {
      markers: [{ id: 'm1', label: 'Marker', lat: 5, lng: -10 }],
      paths: [
        {
          id: 'p1',
          points: [
            { lat: -20, lng: 30 },
            { lat: 40, lng: 0 },
          ],
        },
      ],
    };

    expect(fitOptions(props)).toEqual({
      bounds: [
        [-10, -20],
        [30, 40],
      ],
      fitBoundsOptions: { padding: 56, maxZoom: 14 },
    });
  });
});
