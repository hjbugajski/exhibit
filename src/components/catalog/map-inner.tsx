import { useMemo, useState } from 'react';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { MapControls } from '@/components/ui/map/controls';
import { Map as MapCanvas } from '@/components/ui/map/map';
import { Marker } from '@/components/ui/map/marker';
import { resolveTokenColor } from '@/components/ui/map/resolve-token-color';
import { MapRoute } from '@/components/ui/map/route';

type Props = CatalogComponentProps<'Map'>;

/**
 * Initial view for the catalog Map: an explicit center wins, else bounds fitted to all markers/path
 * points, else a fixed world view. Exported for direct unit testing.
 */
export function fitOptions(props: Props) {
  if (props.center) {
    return {
      center: [props.center.lng, props.center.lat] as [number, number],
      zoom: props.zoom ?? 12,
    };
  }

  const points = [...(props.markers ?? []), ...(props.paths ?? []).flatMap((path) => path.points)];

  if (points.length === 0) {
    return { center: [0, 20] as [number, number], zoom: props.zoom ?? 1.5 };
  }

  const lngs = points.map((point) => point.lng);
  const lats = points.map((point) => point.lat);
  const bounds: [[number, number], [number, number]] = [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];

  return { bounds, fitBoundsOptions: { padding: 56, maxZoom: props.zoom ?? 14 } };
}

/**
 * Default export (the only one in the catalog) because map.tsx lazy-loads this module via
 * React.lazy, which requires a default export.
 */
export default function CatalogMapInner({ props }: { props: Props }) {
  const [routeColor] = useState(() => resolveTokenColor('--color-accent', '#15171c'));

  const routes = useMemo(
    () =>
      (props.paths ?? []).map((path) => ({
        ...path,
        coordinates: path.points.map((point) => [point.lng, point.lat] as [number, number]),
      })),
    [props.paths],
  );

  return (
    // cooperativeGestures: plain scroll keeps scrolling the page; ctrl/cmd+scroll zooms.
    <MapCanvas cooperativeGestures {...fitOptions(props)}>
      <MapControls />
      {routes.map((path) => (
        <MapRoute
          color={routeColor}
          coordinates={path.coordinates}
          dashArray={path.dashed ? [2, 2] : undefined}
          interactive={false}
          key={path.id}
        />
      ))}
      {(props.markers ?? []).map((marker) => (
        <Marker.Root key={marker.id} latitude={marker.lat} longitude={marker.lng}>
          <Marker.Content>
            <span className="border-background bg-accent block size-4 rounded-full border-2 shadow-lg" />
            <Marker.Label>{marker.label}</Marker.Label>
          </Marker.Content>
          {marker.description ? (
            <Marker.Popup>
              <p className="text-sm font-medium">{marker.label}</p>
              <p className="text-foreground-muted text-sm">{marker.description}</p>
            </Marker.Popup>
          ) : null}
        </Marker.Root>
      ))}
    </MapCanvas>
  );
}
