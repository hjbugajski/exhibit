import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';
import { MapControls } from '@/components/ui/map/controls';
import { Map as MapCanvas } from '@/components/ui/map/map';
import { Marker } from '@/components/ui/map/marker';

const zoomLevels = ['3', '9', '13'] as const;

function MapDemo() {
  return (
    <Playground
      controls={{
        zoom: { kind: 'select', label: 'Zoom', options: zoomLevels, defaultValue: '9' },
        showCompass: { kind: 'boolean', label: 'Show compass', defaultValue: true },
        showFullscreen: { kind: 'boolean', label: 'Show fullscreen', defaultValue: true },
        showLocate: { kind: 'boolean', label: 'Show locate', defaultValue: true },
      }}
      render={(values) => (
        <div className="h-64 w-full max-w-2xl overflow-hidden rounded-lg border">
          <MapCanvas center={[-122.42, 37.77]} zoom={Number(values.zoom)}>
            <MapControls
              showCompass={values.showCompass}
              showFullscreen={values.showFullscreen}
              showLocate={values.showLocate}
            />
            <Marker.Root latitude={37.77} longitude={-122.42}>
              <Marker.Content />
            </Marker.Root>
          </MapCanvas>
        </div>
      )}
    />
  );
}

export const mapDemo: LibraryDemo = {
  slug: 'map',
  title: 'Map',
  description: 'MapLibre canvas with themed controls and markers for geospatial artifacts.',
  group: 'Components',
  render: () => <MapDemo />,
};
