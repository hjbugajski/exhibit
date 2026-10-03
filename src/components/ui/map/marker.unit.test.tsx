// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import type { MarkerOptions } from 'maplibre-gl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MapContext } from '@/components/ui/map/map-context';
import { Marker, type MarkerRootProps } from '@/components/ui/map/marker';

type Listener = () => void;

const markers = vi.hoisted(() => {
  /** Implements the Marker surface `Marker.Root`'s effects call, recording `on` listeners. */
  class StubMarker {
    readonly element: HTMLElement;
    readonly draggable: boolean;
    readonly listeners = new Map<string, Listener>();
    lngLat = { lng: 0, lat: 0 };

    constructor(options: MarkerOptions & { element: HTMLElement }) {
      this.element = options.element;
      this.draggable = options.draggable ?? false;
      instances.push(this);
    }

    setLngLat([lng, lat]: [number, number]) {
      this.lngLat = { lng, lat };
      return this;
    }

    getLngLat() {
      return this.lngLat;
    }

    getElement() {
      return this.element;
    }

    on(event: string, listener: Listener) {
      this.listeners.set(event, listener);
      return this;
    }

    off(event: string) {
      this.listeners.delete(event);
      return this;
    }

    isDraggable() {
      return this.draggable;
    }

    getOffset() {
      return { x: 0, y: 0 };
    }

    getRotation() {
      return 0;
    }

    getRotationAlignment() {
      return 'auto';
    }

    getPitchAlignment() {
      return 'auto';
    }
  }

  const instances: StubMarker[] = [];

  return { StubMarker, instances };
});

vi.mock('maplibre-gl', () => ({ Marker: markers.StubMarker }));

afterEach(() => {
  cleanup();
  markers.instances.length = 0;
});

function renderMarker(props: Partial<MarkerRootProps>) {
  const renderRoot = (next: Partial<MarkerRootProps>) => (
    <MapContext value={{ map: null, isLoaded: false, resolvedTheme: 'light' }}>
      <Marker.Root latitude={2} longitude={1} {...next}>
        {null}
      </Marker.Root>
    </MapContext>
  );
  const { rerender } = render(renderRoot(props));

  return { rerender: (next: Partial<MarkerRootProps>) => rerender(renderRoot(next)) };
}

describe('Marker.Root', () => {
  it('calls the latest click handler', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderMarker({ onClick: first });
    rerender({ onClick: second });

    markers.instances[0]?.element.dispatchEvent(new MouseEvent('click'));

    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });

  it('reports the drag end position to the latest handler', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderMarker({ draggable: true, onDragEnd: first });
    rerender({ draggable: true, onDragEnd: second });

    markers.instances[0]?.listeners.get('dragend')?.();

    expect(second).toHaveBeenCalledWith({ lng: 1, lat: 2 });
    expect(first).not.toHaveBeenCalled();
  });
});
