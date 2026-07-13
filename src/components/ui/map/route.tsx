import { useEffect, useId, useMemo } from 'react';

import type MapLibreGL from 'maplibre-gl';

import { useMap } from '@/components/ui/map/map-context';
import { removeMapLayers, useLatest } from '@/components/ui/map/map-utils';
import { resolveTokenColor } from '@/components/ui/map/resolve-token-color';

export interface MapRouteProps {
  id?: string;
  /** [longitude, latitude] pairs. */
  coordinates: [number, number][];
  /** CSS color (default: the theme's `--color-info` token). */
  color?: string;
  /** Pixels (default: 3). */
  width?: number;
  /** 0 to 1 (default: 0.8). */
  opacity?: number;
  /** [dash length, gap length]. */
  dashArray?: [number, number];
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  /** Enables the pointer cursor and mouse callbacks (default: true). */
  interactive?: boolean;
  /** MapLibre layer id to insert the route layer before (z-order control). */
  beforeId?: string;
}

/**
 * Imperatively adds a line source+layer for its lifetime and removes them on unmount; renders no
 * DOM (always returns null).
 */
export function MapRoute({
  id: propId,
  coordinates,
  color: colorProp,
  width = 3,
  opacity = 0.8,
  dashArray,
  onClick,
  onMouseEnter,
  onMouseLeave,
  interactive = true,
  beforeId,
}: MapRouteProps) {
  const { map, isLoaded } = useMap();
  const autoId = useId();
  const id = propId ?? autoId;
  const sourceId = `route-source-${id}`;
  const layerId = `route-layer-${id}`;

  const color = useMemo(
    () => colorProp ?? resolveTokenColor('--color-info', '#3366d9'),
    [colorProp],
  );

  const colorRef = useLatest(color);
  const widthRef = useLatest(width);
  const opacityRef = useLatest(opacity);
  const dashArrayRef = useLatest(dashArray);
  const beforeIdRef = useLatest(beforeId);

  useEffect(() => {
    if (!isLoaded || !map) {
      return;
    }

    map.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: [] },
      },
    });

    map.addLayer(
      {
        id: layerId,
        type: 'line',
        source: sourceId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': colorRef.current,
          'line-width': widthRef.current,
          'line-opacity': opacityRef.current,
          ...(dashArrayRef.current && { 'line-dasharray': dashArrayRef.current }),
        },
      },
      beforeIdRef.current,
    );

    return () => removeMapLayers(map, [layerId], sourceId);
  }, [isLoaded, map, sourceId, layerId, colorRef, widthRef, opacityRef, dashArrayRef, beforeIdRef]);

  // Re-order the layer when beforeId changes after mount.
  useEffect(() => {
    if (!isLoaded || !map || !map.getLayer(layerId)) {
      return;
    }
    map.moveLayer(layerId, beforeId);
  }, [isLoaded, map, layerId, beforeId]);

  useEffect(() => {
    if (!isLoaded || !map || coordinates.length < 2) {
      return;
    }

    const source = map.getSource(sourceId) as MapLibreGL.GeoJSONSource;
    if (source) {
      source.setData({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates },
      });
    }
  }, [isLoaded, map, coordinates, sourceId]);

  useEffect(() => {
    if (!isLoaded || !map || !map.getLayer(layerId)) {
      return;
    }

    map.setPaintProperty(layerId, 'line-color', color);
    map.setPaintProperty(layerId, 'line-width', width);
    map.setPaintProperty(layerId, 'line-opacity', opacity);
    map.setPaintProperty(layerId, 'line-dasharray', dashArray);
  }, [isLoaded, map, layerId, color, width, opacity, dashArray]);

  useEffect(() => {
    if (!isLoaded || !map || !interactive) {
      return;
    }

    const handleClick = () => {
      onClick?.();
    };
    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
      onMouseEnter?.();
    };
    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = '';
      onMouseLeave?.();
    };

    map.on('click', layerId, handleClick);
    map.on('mouseenter', layerId, handleMouseEnter);
    map.on('mouseleave', layerId, handleMouseLeave);

    return () => {
      map.off('click', layerId, handleClick);
      map.off('mouseenter', layerId, handleMouseEnter);
      map.off('mouseleave', layerId, handleMouseLeave);
    };
  }, [isLoaded, map, layerId, onClick, onMouseEnter, onMouseLeave, interactive]);

  return null;
}
