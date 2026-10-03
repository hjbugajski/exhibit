// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react';
import type * as MapLibreGL from 'maplibre-gl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Map, type MapProps } from '@/components/ui/map/map';

type Listener = () => void;

const maps = vi.hoisted(() => {
  /** Implements the Map surface `Map` calls, recording `on` listeners and `setProjection` calls. */
  class StubMap {
    readonly listeners = new globalThis.Map<string, Listener>();
    readonly setProjection = vi.fn();

    constructor() {
      instances.push(this);
    }

    on(event: string, listener: Listener) {
      this.listeners.set(event, listener);
      return this;
    }

    off(event: string) {
      this.listeners.delete(event);
      return this;
    }

    fire(event: string) {
      this.listeners.get(event)?.();
    }

    getCenter() {
      return { lng: 1, lat: 2 };
    }

    getZoom() {
      return 3;
    }

    getBearing() {
      return 4;
    }

    getPitch() {
      return 5;
    }

    isMoving() {
      return false;
    }

    jumpTo() {
      return this;
    }

    setStyle() {
      return this;
    }

    remove() {}
  }

  const instances: StubMap[] = [];

  return { StubMap, instances };
});

vi.mock('maplibre-gl', () => ({ Map: maps.StubMap, setWorkerUrl: () => undefined }));
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url', () => ({ default: '' }));
vi.mock('@/lib/map-config', () => ({ getProtomapsApiKeyFn: () => Promise.resolve(null) }));

const styles = { light: 'light-style', dark: 'dark-style' };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  maps.instances.length = 0;
});

function renderMap(props: Partial<MapProps>) {
  const { rerender } = render(<Map styles={styles} theme="light" {...props} />);

  return {
    rerender: (next: Partial<MapProps>) =>
      rerender(<Map styles={styles} theme="light" {...next} />),
  };
}

describe('Map', () => {
  it('reports viewport changes to the latest callback without recreating the map', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderMap({ onViewportChange: first });
    rerender({ onViewportChange: second });

    expect(maps.instances).toHaveLength(1);

    act(() => maps.instances[0]?.fire('move'));

    expect(second).toHaveBeenCalledWith({ center: [1, 2], zoom: 3, bearing: 4, pitch: 5 });
    expect(first).not.toHaveBeenCalled();
  });

  it('re-applies the current projection after a style reload', () => {
    const globe: MapLibreGL.ProjectionSpecification = { type: 'globe' };
    const mercator: MapLibreGL.ProjectionSpecification = { type: 'mercator' };
    const { rerender } = renderMap({ projection: globe });
    const map = maps.instances[0];

    act(() => {
      map?.fire('styledata');
      vi.advanceTimersByTime(100);
    });
    rerender({ projection: mercator });
    act(() => {
      map?.fire('styledata');
      vi.advanceTimersByTime(100);
    });

    expect(map?.setProjection).toHaveBeenLastCalledWith(mercator);
  });
});
