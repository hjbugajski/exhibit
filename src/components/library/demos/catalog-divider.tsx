import type { Spec } from '@json-render/core';

import { SpecView } from '@/catalog/registry';
import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';

function CatalogDividerDemo() {
  return (
    <Playground
      controls={{}}
      layout="block"
      render={() => {
        const spec: Spec = {
          root: 'grid',
          elements: {
            grid: { type: 'Grid', props: { columns: 1 }, children: ['before', 'divider', 'after'] },
            before: {
              type: 'Prose',
              props: {
                markdown: 'Registration closes **March 1st**; late entries are not accepted.',
              },
              children: [],
            },
            divider: { type: 'Divider', props: {}, children: [] },
            after: {
              type: 'Prose',
              props: { markdown: 'Results are posted within two weeks of the event.' },
              children: [],
            },
          },
        };

        return <SpecView spec={spec} />;
      }}
    />
  );
}

export const catalogDividerDemo: LibraryDemo = {
  slug: 'catalog-divider',
  title: 'Divider',
  description: 'Horizontal separator line between blocks; use sparingly.',
  group: 'Catalog',
  render: () => <CatalogDividerDemo />,
};
