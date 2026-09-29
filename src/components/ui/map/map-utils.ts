import type * as MapLibreGL from 'maplibre-gl';

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
