import { createContext, use } from 'react';

import type MapLibreGL from 'maplibre-gl';

export type Theme = 'light' | 'dark';

export interface MapContextValue {
  map: MapLibreGL.Map | null;
  /**
   * True once both the map's `load` event and the current style have finished — only then are
   * layers/sources safe to add.
   */
  isLoaded: boolean;
  resolvedTheme: Theme;
}

export const MapContext = createContext<MapContextValue | null>(null);

export function useMap() {
  const context = use(MapContext);
  if (!context) {
    throw new Error('useMap must be used within a Map component');
  }
  return context;
}
