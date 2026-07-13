import type { Spec } from '@json-render/core';

import { SpecView } from '@/catalog/registry';
import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';

function CatalogSectionDemo() {
  return (
    <Playground
      controls={{
        title: { kind: 'text', label: 'Title', defaultValue: 'Plan Comparison' },
        subtitle: { kind: 'text', label: 'Subtitle', defaultValue: 'Pick the tier that fits' },
      }}
      layout="block"
      render={(values) => {
        const spec: Spec = {
          root: 'section',
          elements: {
            section: {
              type: 'Section',
              props: { title: values.title, subtitle: values.subtitle },
              children: ['prose'],
            },
            prose: {
              type: 'Prose',
              props: {
                markdown: 'All plans include unlimited projects and **priority email support**.',
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

export const catalogSectionDemo: LibraryDemo = {
  slug: 'catalog-section',
  title: 'Section',
  description: 'Top-level page section with an anchor; groups related content under a title.',
  group: 'Catalog',
  render: () => <CatalogSectionDemo />,
};
