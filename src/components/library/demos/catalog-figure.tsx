import type { Spec } from '@json-render/core';

import { SpecView } from '@/catalog/registry';
import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';

// Network-loaded placeholder image, same tradeoff as the Map demo's tile server.
const SRC = 'https://picsum.photos/800/450';

function CatalogFigureDemo() {
  return (
    <Playground
      controls={{
        caption: { kind: 'text', label: 'Caption', defaultValue: 'View from the ryokan balcony' },
        alt: { kind: 'text', label: 'Alt text', defaultValue: 'Misty mountain valley at dawn' },
      }}
      layout="block"
      render={(values) => {
        const spec: Spec = {
          root: 'figure',
          elements: {
            figure: {
              type: 'Figure',
              props: { src: SRC, alt: values.alt, caption: values.caption },
              children: [],
            },
          },
        };

        return <SpecView spec={spec} />;
      }}
    />
  );
}

export const catalogFigureDemo: LibraryDemo = {
  slug: 'catalog-figure',
  title: 'Figure',
  description: 'Image with an optional caption; the source must be a publicly reachable https URL.',
  group: 'Catalog',
  render: () => <CatalogFigureDemo />,
};
