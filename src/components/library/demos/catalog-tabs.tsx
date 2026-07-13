import type { Spec } from '@json-render/core';

import { SpecView } from '@/catalog/registry';
import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';

function CatalogTabsDemo() {
  return (
    <Playground
      controls={{}}
      layout="block"
      render={() => {
        const spec: Spec = {
          root: 'tabs',
          elements: {
            tabs: {
              type: 'Tabs',
              props: { items: ['Studio', 'One-bedroom', 'Two-bedroom'] },
              children: ['studio', 'one-bed', 'two-bed'],
            },
            studio: {
              type: 'KeyValueList',
              props: {
                items: [
                  { id: 'rent', key: 'Rent', value: '$1,450/mo' },
                  { id: 'sqft', key: 'Size', value: '480 sq ft' },
                ],
              },
              children: [],
            },
            'one-bed': {
              type: 'KeyValueList',
              props: {
                items: [
                  { id: 'rent', key: 'Rent', value: '$1,850/mo' },
                  { id: 'sqft', key: 'Size', value: '720 sq ft' },
                ],
              },
              children: [],
            },
            'two-bed': {
              type: 'KeyValueList',
              props: {
                items: [
                  { id: 'rent', key: 'Rent', value: '$2,400/mo' },
                  { id: 'sqft', key: 'Size', value: '1,050 sq ft' },
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

export const catalogTabsDemo: LibraryDemo = {
  slug: 'catalog-tabs',
  title: 'Tabs',
  description: 'Tabbed container with one label per child; use for alternate views of a topic.',
  group: 'Catalog',
  render: () => <CatalogTabsDemo />,
};
