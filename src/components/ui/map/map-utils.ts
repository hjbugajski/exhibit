import { useRef } from 'react';

import type MapLibreGL from 'maplibre-gl';

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
 * Merges hover overrides into a paint spec: each override becomes a MapLibre `case` on
 * `feature-state.hover`, applied only while hovered; base keys without an override pass through
 * untouched.
 */
export function mergeHoverPaint<T extends Record<string, unknown>>(
  paint: T,
  hoverPaint: T | undefined,
): T {
  if (!hoverPaint) {
    return paint;
  }
  const merged: Record<string, unknown> = { ...paint };
  for (const [key, hoverValue] of Object.entries(hoverPaint)) {
    if (hoverValue === undefined) {
      continue;
    }
    const baseValue = merged[key];
    merged[key] =
      baseValue === undefined
        ? hoverValue
        : ['case', ['boolean', ['feature-state', 'hover'], false], hoverValue, baseValue];
  }
  return merged as T;
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
