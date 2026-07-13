import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import MapLibreGL, { type MarkerOptions, type PopupOptions } from 'maplibre-gl';

import { useMap } from '@/components/ui/map/map-context';
import { useLatest } from '@/components/ui/map/map-utils';
import { PopupCloseButton, usePopupInstance } from '@/components/ui/map/popup-utils';
import { cn } from '@/lib/utils';

interface MarkerContextValue {
  marker: MapLibreGL.Marker;
  map: MapLibreGL.Map | null;
}

const MarkerContext = createContext<MarkerContextValue | null>(null);

function useMarkerContext() {
  const context = use(MarkerContext);
  if (!context) {
    throw new Error('Marker components must be used within Marker.Root');
  }
  return context;
}

export type MarkerRootProps = {
  longitude: number;
  latitude: number;
  children: ReactNode;
  onClick?: (e: MouseEvent) => void;
  onMouseEnter?: (e: MouseEvent) => void;
  onMouseLeave?: (e: MouseEvent) => void;
  /** Requires `draggable: true`. */
  onDragStart?: (lngLat: { lng: number; lat: number }) => void;
  /** Requires `draggable: true`. */
  onDrag?: (lngLat: { lng: number; lat: number }) => void;
  /** Requires `draggable: true`. */
  onDragEnd?: (lngLat: { lng: number; lat: number }) => void;
} & Omit<MarkerOptions, 'element'>;

function Root({
  longitude,
  latitude,
  children,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onDragStart,
  onDrag,
  onDragEnd,
  draggable = false,
  ...markerOptions
}: MarkerRootProps) {
  const { map } = useMap();

  const callbacksRef = useLatest({
    onClick,
    onMouseEnter,
    onMouseLeave,
    onDragStart,
    onDrag,
    onDragEnd,
  });

  // `color`, `scale`, and `anchor` (from ...markerOptions, below) are read once here at
  // construction. MapLibre's Marker has no setters for them, so they can't be resynced post-mount
  // without recreating the marker; `color` and `scale` only affect MapLibre's default marker
  // element anyway, which this component never uses (it always supplies its own `element`).
  const [marker] = useState(() => {
    const markerInstance = new MapLibreGL.Marker({
      ...markerOptions,
      element: document.createElement('div'),
      draggable,
    }).setLngLat([longitude, latitude]);

    const handleClick = (e: MouseEvent) => callbacksRef.current.onClick?.(e);
    const handleMouseEnter = (e: MouseEvent) => callbacksRef.current.onMouseEnter?.(e);
    const handleMouseLeave = (e: MouseEvent) => callbacksRef.current.onMouseLeave?.(e);

    markerInstance.getElement()?.addEventListener('click', handleClick);
    markerInstance.getElement()?.addEventListener('mouseenter', handleMouseEnter);
    markerInstance.getElement()?.addEventListener('mouseleave', handleMouseLeave);

    const handleDragStart = () => {
      const lngLat = markerInstance.getLngLat();
      callbacksRef.current.onDragStart?.({ lng: lngLat.lng, lat: lngLat.lat });
    };
    const handleDrag = () => {
      const lngLat = markerInstance.getLngLat();
      callbacksRef.current.onDrag?.({ lng: lngLat.lng, lat: lngLat.lat });
    };
    const handleDragEnd = () => {
      const lngLat = markerInstance.getLngLat();
      callbacksRef.current.onDragEnd?.({ lng: lngLat.lng, lat: lngLat.lat });
    };

    markerInstance.on('dragstart', handleDragStart);
    markerInstance.on('drag', handleDrag);
    markerInstance.on('dragend', handleDragEnd);

    return markerInstance;
  });

  useEffect(() => {
    if (!map) {
      return;
    }

    marker.addTo(map);

    return () => {
      marker.remove();
    };
  }, [map, marker]);

  const { offset, rotation, rotationAlignment, pitchAlignment } = markerOptions;

  useEffect(() => {
    const current = marker.getLngLat();
    if (current.lng !== longitude || current.lat !== latitude) {
      marker.setLngLat([longitude, latitude]);
    }

    if (marker.isDraggable() !== draggable) {
      marker.setDraggable(draggable);
    }

    const currentOffset = marker.getOffset();
    const newOffset = offset ?? [0, 0];
    const [newOffsetX, newOffsetY] = Array.isArray(newOffset)
      ? newOffset
      : [newOffset.x, newOffset.y];
    if (currentOffset.x !== newOffsetX || currentOffset.y !== newOffsetY) {
      marker.setOffset(newOffset);
    }

    if (marker.getRotation() !== (rotation ?? 0)) {
      marker.setRotation(rotation ?? 0);
    }
    if (marker.getRotationAlignment() !== (rotationAlignment ?? 'auto')) {
      marker.setRotationAlignment(rotationAlignment ?? 'auto');
    }
    if (marker.getPitchAlignment() !== (pitchAlignment ?? 'auto')) {
      marker.setPitchAlignment(pitchAlignment ?? 'auto');
    }
  }, [marker, longitude, latitude, draggable, offset, rotation, rotationAlignment, pitchAlignment]);

  return <MarkerContext value={{ marker, map }}>{children}</MarkerContext>;
}

function DefaultMarkerIcon() {
  return (
    // Repo convention: semantic tokens only (upstream mapcn ships border-white bg-blue-500).
    <div className="border-background bg-accent relative h-4 w-4 rounded-full border-2 shadow-lg" />
  );
}

export interface MarkerContentProps {
  /** Defaults to a themed dot. */
  children?: ReactNode;
  className?: string;
}

function Content({ children, className }: MarkerContentProps) {
  const { marker } = useMarkerContext();

  return createPortal(
    <div className={cn('relative cursor-pointer', className)}>
      {children || <DefaultMarkerIcon />}
    </div>,
    marker.getElement(),
  );
}

export type MarkerPopupProps = {
  children: ReactNode;
  className?: string;
  closeButton?: boolean;
  onClose?: () => void;
} & Omit<PopupOptions, 'className' | 'closeButton'>;

/**
 * Bound via marker.setPopup: opens on the marker's native click toggle, not on mount (unlike
 * MapPopup, which attaches immediately at coordinates).
 */
function Popup({
  children,
  className,
  closeButton = false,
  onClose,
  ...popupOptions
}: MarkerPopupProps) {
  const { marker, map } = useMarkerContext();
  const { offset, maxWidth } = popupOptions;

  const { container, popup } = usePopupInstance({
    map,
    offset,
    maxWidth,
    onClose,
    createPopup: () =>
      new MapLibreGL.Popup({ offset: 16, ...popupOptions, closeButton: false }).setMaxWidth('none'),
    attach: ({ popup, container }) => {
      popup.setDOMContent(container);
      marker.setPopup(popup);
      return () => marker.setPopup(null);
    },
  });

  const handleClose = () => popup.remove();

  return createPortal(
    <div
      className={cn(
        'bg-surface-raised text-foreground relative max-w-62 rounded-md border p-3 shadow-md',
        'animate-pop-in',
        className,
      )}
    >
      {closeButton && <PopupCloseButton onClick={handleClose} />}
      {children}
    </div>,
    container,
  );
}

export type MarkerTooltipProps = {
  children: ReactNode;
  className?: string;
} & Omit<PopupOptions, 'className' | 'closeButton' | 'closeOnClick'>;

function Tooltip({ children, className, ...popupOptions }: MarkerTooltipProps) {
  const { marker, map } = useMarkerContext();
  const { offset, maxWidth } = popupOptions;

  const { container } = usePopupInstance({
    map,
    offset,
    maxWidth,
    createPopup: () =>
      new MapLibreGL.Popup({
        offset: 16,
        ...popupOptions,
        closeOnClick: true,
        closeButton: false,
      }).setMaxWidth('none'),
    attach: ({ popup: tooltip, container, map }) => {
      tooltip.setDOMContent(container);

      const handleMouseEnter = () => {
        tooltip.setLngLat(marker.getLngLat()).addTo(map);
      };
      const handleMouseLeave = () => tooltip.remove();

      marker.getElement()?.addEventListener('mouseenter', handleMouseEnter);
      marker.getElement()?.addEventListener('mouseleave', handleMouseLeave);

      return () => {
        marker.getElement()?.removeEventListener('mouseenter', handleMouseEnter);
        marker.getElement()?.removeEventListener('mouseleave', handleMouseLeave);
        tooltip.remove();
      };
    },
  });

  return createPortal(
    <div
      className={cn(
        'bg-foreground text-background pointer-events-none rounded-md px-2 py-1 text-xs text-balance shadow-md',
        'animate-pop-in',
        className,
      )}
    >
      {children}
    </div>,
    container,
  );
}

export interface MarkerLabelProps {
  children: ReactNode;
  className?: string;
  /** Side of the marker to render on (default: 'top'). */
  position?: 'top' | 'bottom';
}

function Label({ children, className, position = 'top' }: MarkerLabelProps) {
  const labelPositionClasses = {
    top: 'bottom-full mb-1',
    bottom: 'top-full mt-1',
  };

  return (
    <div
      className={cn(
        'absolute left-1/2 -translate-x-1/2 whitespace-nowrap',
        'text-foreground text-[10px] font-medium',
        labelPositionClasses[position],
        className,
      )}
    >
      {children}
    </div>
  );
}

export const Marker = { Root, Content, Popup, Tooltip, Label };
