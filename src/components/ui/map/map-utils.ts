import { useRef } from 'react';

import type * as MapLibreGL from 'maplibre-gl';

/**
 * Keeps a ref in sync with the latest value so callbacks/effects can read it without depending on
 * it (avoiding stale closures without re-subscribing).
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

/**
 * Removes layers then their shared source, swallowing errors. A style reload (e.g. theme switch
 * triggers `setStyle`) can tear down layers/sources out from under this cleanup, so failures here
 * are expected and safe to ignore.
 */
export function removeMapLayers(map: MapLibreGL.Map, layerIds: string[], sourceId: string) {
  try {
    for (const layerId of layerIds) {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
    }
    if (map.getSource(sourceId)) {
      map.removeSource(sourceId);
    }
  } catch {
    // ignore — see comment above
  }
}
