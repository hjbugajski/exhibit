import { useEffect, useState } from 'react';

import { X } from 'lucide-react';
import type MapLibreGL from 'maplibre-gl';
import { type PopupOptions } from 'maplibre-gl';

import { useLatest } from '@/components/ui/map/map-utils';

export function PopupCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close popup"
      className="focus-visible:ring-focus hover:bg-surface-muted text-foreground absolute top-1 right-1 z-10 inline-flex size-5 cursor-pointer items-center justify-center rounded-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset"
    >
      <X className="size-3.5" />
    </button>
  );
}

interface UsePopupInstanceOptions {
  map: MapLibreGL.Map | null;
  offset: PopupOptions['offset'];
  maxWidth: PopupOptions['maxWidth'];
  onClose?: () => void;
  /** Builds the Popup instance once, at mount. */
  createPopup: () => MapLibreGL.Popup;
  /**
   * Attaches the popup once `map` is available (e.g. `marker.setPopup`, `popup.addTo`, or hover
   * listeners). Returns an optional teardown.
   */
  attach: (ctx: {
    popup: MapLibreGL.Popup;
    container: HTMLDivElement;
    map: MapLibreGL.Map;
  }) => (() => void) | void;
}

/**
 * Shared portal container + Popup lifecycle for Marker.Popup, Marker.Tooltip, and MapPopup:
 * constructs the popup and its DOM-content container once, attaches it once the map exists, wires
 * the `close` event to `onClose`, and keeps `offset`/`maxWidth` in sync. Callers own attach/detach
 * semantics (they differ: `setPopup`, `addTo`, or hover listeners).
 */
export function usePopupInstance({
  map,
  offset,
  maxWidth,
  onClose,
  createPopup,
  attach,
}: UsePopupInstanceOptions) {
  const [container] = useState(() => document.createElement('div'));
  const [popup] = useState(createPopup);
  const attachRef = useLatest(attach);
  const onCloseRef = useLatest(onClose);

  useEffect(() => {
    if (!map) {
      return;
    }

    const handleClose = () => onCloseRef.current?.();
    popup.on('close', handleClose);
    const cleanup = attachRef.current({ popup, container, map });

    return () => {
      popup.off('close', handleClose);
      cleanup?.();
    };
  }, [map, popup, container, attachRef, onCloseRef]);

  useEffect(() => {
    popup.setOffset(offset ?? 16);
    if (maxWidth) {
      popup.setMaxWidth(maxWidth);
    }
  }, [popup, offset, maxWidth]);

  return { container, popup };
}
