import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import MapLibreGL, { type PopupOptions } from 'maplibre-gl';

import { useMap } from '@/components/ui/map/map-context';
import { PopupCloseButton, usePopupInstance } from '@/components/ui/map/popup-utils';
import { cn } from '@/lib/utils';

export type MapPopupProps = {
  longitude: number;
  latitude: number;
  onClose?: () => void;
  children: ReactNode;
  className?: string;
  closeButton?: boolean;
} & Omit<PopupOptions, 'className' | 'closeButton'>;

/**
 * Attaches to the map at the given coordinates as soon as it mounts — unlike Marker.Popup, which
 * opens only on its marker's click toggle.
 */
export function MapPopup({
  longitude,
  latitude,
  onClose,
  children,
  className,
  closeButton = false,
  ...popupOptions
}: MapPopupProps) {
  const { map } = useMap();
  const { offset, maxWidth } = popupOptions;

  const { container, popup } = usePopupInstance({
    map,
    offset,
    maxWidth,
    onClose,
    createPopup: () =>
      new MapLibreGL.Popup({ offset: 16, ...popupOptions, closeButton: false })
        .setMaxWidth('none')
        .setLngLat([longitude, latitude]),
    attach: ({ popup, container, map }) => {
      popup.setDOMContent(container);
      popup.addTo(map);
      return () => {
        if (popup.isOpen()) {
          popup.remove();
        }
      };
    },
  });

  useEffect(() => {
    const current = popup.getLngLat();
    if (!current || current.lng !== longitude || current.lat !== latitude) {
      popup.setLngLat([longitude, latitude]);
    }
  }, [popup, longitude, latitude]);

  const handleClose = () => {
    popup.remove();
  };

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
