import type { Spec } from '@json-render/core';

import { SpecView } from '@/catalog/registry';
import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';

const levels = ['1', '2', '3'] as const;

function CatalogHeadingDemo() {
  return (
    <Playground
      controls={{
        level: { kind: 'select', label: 'Level', options: levels, defaultValue: '2' },
        text: { kind: 'text', label: 'Text', defaultValue: 'Getting Started' },
      }}
      layout="block"
      render={(values) => {
        const spec: Spec = {
          root: 'heading',
          elements: {
            heading: {
              type: 'Heading',
              props: { level: Number(values.level), text: values.text },
              children: [],
            },
          },
        };

        return <SpecView spec={spec} />;
      }}
    />
  );
}

export const catalogHeadingDemo: LibraryDemo = {
  slug: 'catalog-heading',
  title: 'Heading',
  description: 'Standalone heading, independent of Section titles; use sparingly.',
  group: 'Catalog',
  render: () => <CatalogHeadingDemo />,
};
