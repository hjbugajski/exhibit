// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import type * as MapLibreGL from 'maplibre-gl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MapContext, type Theme } from '@/components/ui/map/map-context';
import { MapRoute, type MapRouteProps } from '@/components/ui/map/route';

/** Stands in for the canvas probe: encodes the scheme at call time so each test can see it. */
vi.mock('@/components/ui/map/resolve-token-color', () => ({
  resolveTokenColor: (token: string) => `${document.documentElement.dataset.theme}:${token}`,
}));

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.theme;
});

function createStubMap() {
  const addLayer = vi.fn();
  const setPaintProperty = vi.fn();
  const on = vi.fn();
  const noop = () => undefined;
  const map = {
    addSource: noop,
    addLayer,
    setPaintProperty,
    getLayer: () => ({}),
    getSource: () => ({ setData: noop }),
    on,
    off: noop,
    moveLayer: noop,
    getCanvas: () => ({ style: {} }),
    removeLayer: noop,
    removeSource: noop,
  } as unknown as MapLibreGL.Map;

  return { map, addLayer, setPaintProperty, on };
}

const coordinates: [number, number][] = [
  [0, 0],
  [1, 1],
];

/**
 * Mounts a route in the light scheme, switches the document to dark, and rerenders with the new
 * context theme the way `Map` does. Returns the initial layer colour and the last painted colour.
 */
function renderAcrossSchemeChange(props: Partial<MapRouteProps>) {
  const { map, addLayer, setPaintProperty } = createStubMap();
  const renderRoute = (resolvedTheme: Theme) => (
    <MapContext value={{ map, isLoaded: true, resolvedTheme }}>
      <MapRoute coordinates={coordinates} {...props} />
    </MapContext>
  );

  document.documentElement.dataset.theme = 'light';
  const { rerender } = render(renderRoute('light'));
  const initial = addLayer.mock.calls[0]?.[0].paint['line-color'];

  document.documentElement.dataset.theme = 'dark';
  rerender(renderRoute('dark'));
  const linePaints = setPaintProperty.mock.calls.filter(
    ([, property]) => property === 'line-color',
  );

  return { initial, final: linePaints.at(-1)?.[2] };
}

describe('MapRoute', () => {
  it('repaints the default info token for the new scheme', () => {
    expect(renderAcrossSchemeChange({})).toEqual({
      initial: 'light:--color-info',
      final: 'dark:--color-info',
    });
  });

  it('repaints a custom colour token for the new scheme', () => {
    expect(renderAcrossSchemeChange({ colorToken: '--color-accent' })).toEqual({
      initial: 'light:--color-accent',
      final: 'dark:--color-accent',
    });
  });

  it('keeps a literal colour across a scheme change', () => {
    expect(renderAcrossSchemeChange({ color: '#ff0000', colorToken: '--color-accent' })).toEqual({
      initial: '#ff0000',
      final: '#ff0000',
    });
  });

  it('keeps one click subscription and calls the latest handler', () => {
    const { map, on } = createStubMap();
    const first = vi.fn();
    const second = vi.fn();
    const renderRoute = (onClick: () => void) => (
      <MapContext value={{ map, isLoaded: true, resolvedTheme: 'light' }}>
        <MapRoute coordinates={coordinates} id="trip" onClick={onClick} />
      </MapContext>
    );

    const { rerender } = render(renderRoute(first));
    rerender(renderRoute(second));

    const clicks = on.mock.calls.filter(([event]) => event === 'click');
    expect(clicks).toHaveLength(1);
    expect(clicks[0]?.[1]).toBe('route-layer-trip');
    clicks[0]?.[2]();
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });

  it('keeps the layer when the width changes', () => {
    const { map, addLayer } = createStubMap();
    const renderRoute = (width: number) => (
      <MapContext value={{ map, isLoaded: true, resolvedTheme: 'light' }}>
        <MapRoute coordinates={coordinates} width={width} />
      </MapContext>
    );

    const { rerender } = render(renderRoute(3));
    rerender(renderRoute(6));

    expect(addLayer).toHaveBeenCalledOnce();
  });
});
