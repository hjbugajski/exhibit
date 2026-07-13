import type { Spec } from '@json-render/core';

import { SpecView } from '@/catalog/registry';
import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';

const columnOptions = ['1', '2'] as const;

function CatalogKeyValueListDemo() {
  return (
    <Playground
      controls={{
        columns: { kind: 'select', label: 'Columns', options: columnOptions, defaultValue: '1' },
      }}
      layout="block"
      render={(values) => {
        const spec: Spec = {
          root: 'kv',
          elements: {
            kv: {
              type: 'KeyValueList',
              props: {
                columns: Number(values.columns),
                items: [
                  { id: 'checkin', key: 'Check-in', value: 'May 3, 2026' },
                  { id: 'checkout', key: 'Check-out', value: 'May 8, 2026' },
                  { id: 'guests', key: 'Guests', value: '2 adults' },
                  { id: 'room', key: 'Room type', value: 'Deluxe king' },
                  { id: 'rate', key: 'Nightly rate', value: '$180' },
                  { id: 'total', key: 'Total', value: '$900' },
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

export const catalogKeyValueListDemo: LibraryDemo = {
  slug: 'catalog-key-value-list',
  title: 'Key-value list',
  description: 'Compact list of label/value pairs, like a spec sheet.',
  group: 'Catalog',
  render: () => <CatalogKeyValueListDemo />,
};
