import type { Spec } from '@json-render/core';

import { SpecView } from '@/catalog/registry';
import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';

function CatalogRatingDemo() {
  return (
    <Playground
      controls={{
        label: { kind: 'text', label: 'Label', defaultValue: 'Draft 2' },
      }}
      layout="block"
      render={(values) => {
        const spec: Spec = {
          root: 'rating',
          elements: {
            rating: {
              type: 'Rating',
              props: {
                label: values.label,
                // Interactive — the rating is ephemeral in this preview, not persisted.
                statePath: '/ratings/draft-2',
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

export const catalogRatingDemo: LibraryDemo = {
  slug: 'catalog-rating',
  title: 'Rating',
  description: 'Five-star rating the owner sets in the browser; the score persists at a statePath.',
  group: 'Catalog',
  render: () => <CatalogRatingDemo />,
};
