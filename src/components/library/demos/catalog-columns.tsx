import type { Spec } from '@json-render/core';

import { SpecView } from '@/catalog/registry';
import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';

const ratios = ['1:1', '1:2', '2:1'] as const;

function CatalogColumnsDemo() {
  return (
    <Playground
      controls={{
        ratio: { kind: 'select', label: 'Ratio', options: ratios, defaultValue: '1:1' },
      }}
      layout="block"
      render={(values) => {
        const spec: Spec = {
          root: 'columns',
          elements: {
            columns: {
              type: 'Columns',
              props: { ratio: values.ratio },
              children: ['left', 'right'],
            },
            left: {
              type: 'Prose',
              props: { markdown: 'The **before**: a cramped kitchen with dated cabinets.' },
              children: [],
            },
            right: {
              type: 'Prose',
              props: { markdown: 'The **after**: an open layout with an island and pantry.' },
              children: [],
            },
          },
        };

        return <SpecView spec={spec} />;
      }}
    />
  );
}

export const catalogColumnsDemo: LibraryDemo = {
  slug: 'catalog-columns',
  title: 'Columns',
  description: 'Exactly two children side by side, stacking vertically on mobile.',
  group: 'Catalog',
  render: () => <CatalogColumnsDemo />,
};
