import type { Spec } from '@json-render/core';

import { SpecView } from '@/catalog/registry';
import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';

// Kyoto landmarks, visited in order; view auto-fits to markers/path (no center/zoom given).
const kiyomizu = { lat: 34.9949, lng: 135.785 };
const fushimiInari = { lat: 34.9671, lng: 135.7727 };
const kinkakuji = { lat: 35.0394, lng: 135.7292 };

function CatalogMapDemo() {
  return (
    <Playground
      controls={{
        dashed: { kind: 'boolean', label: 'Dashed path', defaultValue: false },
      }}
      layout="block"
      render={(values) => {
        const spec: Spec = {
          root: 'map',
          elements: {
            map: {
              type: 'Map',
              props: {
                markers: [
                  { id: 'kiyomizu-dera', ...kiyomizu, label: 'Kiyomizu-dera' },
                  { id: 'fushimi-inari', ...fushimiInari, label: 'Fushimi Inari Taisha' },
                  { id: 'kinkaku-ji', ...kinkakuji, label: 'Kinkaku-ji' },
                ],
                paths: [
                  {
                    id: 'route',
                    points: [kiyomizu, fushimiInari, kinkakuji],
                    dashed: values.dashed,
                  },
                ],
              },
              children: [],
            },
          },
        };

        return <SpecView spec={spec} />;
      }}
    />
  );
}

export const catalogMapDemo: LibraryDemo = {
  slug: 'catalog-map',
  title: 'Map',
  description: 'Interactive street map with labeled markers and optional route paths.',
  group: 'Catalog',
  render: () => <CatalogMapDemo />,
};
