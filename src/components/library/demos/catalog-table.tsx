import type { Spec } from '@json-render/core';

import { SpecView } from '@/catalog/registry';
import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';

function CatalogTableDemo() {
  return (
    <Playground
      controls={{}}
      layout="block"
      render={() => {
        const spec: Spec = {
          root: 'table',
          elements: {
            table: {
              type: 'Table',
              props: {
                columns: [
                  { key: 'destination', label: 'Destination' },
                  { key: 'nights', label: 'Nights', align: 'right' },
                  { key: 'flight', label: 'Flight', align: 'right' },
                  { key: 'hotel', label: 'Hotel', align: 'right' },
                ],
                rows: [
                  {
                    destination: {
                      text: 'Kyoto',
                      href: 'https://en.wikivoyage.org/wiki/Kyoto',
                    },
                    nights: '3',
                    flight: '$820',
                    hotel: '$540',
                  },
                  { destination: 'Osaka', nights: '2', flight: '$60', hotel: '$310' },
                  { destination: 'Tokyo', nights: '4', flight: '$95', hotel: '$720' },
                  { destination: 'Hakone', nights: '1', flight: '$40', hotel: '$260' },
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

export const catalogTableDemo: LibraryDemo = {
  slug: 'catalog-table',
  title: 'Table',
  description:
    'Data table for structured rows and columns — plain-string or { text, href } link cells, not markdown.',
  group: 'Catalog',
  render: () => <CatalogTableDemo />,
};
