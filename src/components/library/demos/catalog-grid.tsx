import type { Spec } from '@json-render/core';

import { SpecView } from '@/catalog/registry';
import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';

const columnOptions = ['1', '2', '3', '4'] as const;

function CatalogGridDemo() {
  return (
    <Playground
      controls={{
        columns: { kind: 'select', label: 'Columns', options: columnOptions, defaultValue: '3' },
      }}
      layout="block"
      render={(values) => {
        const spec: Spec = {
          root: 'grid',
          elements: {
            grid: {
              type: 'Grid',
              props: { columns: Number(values.columns) },
              children: ['card-a', 'card-b', 'card-c', 'card-d'],
            },
            'card-a': { type: 'Card', props: { title: 'Starter', badge: 'Free' }, children: [] },
            'card-b': { type: 'Card', props: { title: 'Pro', badge: '$12/mo' }, children: [] },
            'card-c': { type: 'Card', props: { title: 'Team', badge: '$29/mo' }, children: [] },
            'card-d': {
              type: 'Card',
              props: { title: 'Enterprise', badge: 'Contact us' },
              children: [],
            },
          },
        };

        return <SpecView spec={spec} />;
      }}
    />
  );
}

export const catalogGridDemo: LibraryDemo = {
  slug: 'catalog-grid',
  title: 'Grid',
  description:
    'Grid of children; one column is the vertical-flow container, 2-4 compare side by side.',
  group: 'Catalog',
  render: () => <CatalogGridDemo />,
};
