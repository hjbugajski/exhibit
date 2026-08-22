import { useEffect, useRef } from 'react';

import type * as MapLibreGL from 'maplibre-gl';

/**
 * Keeps a ref in sync with the latest value so callbacks/effects can read it without depending on
 * it (avoiding stale closures without re-subscribing). Synced in an effect, not during render, so
 * readers see the value from the last commit — only safe for event handlers and for effects that
 * flush after the sync (same component, declared below the useLatest call; a child's effects flush
 * before the parent's and would read one commit behind).
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
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
