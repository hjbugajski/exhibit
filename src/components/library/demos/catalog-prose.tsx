import type { Spec } from '@json-render/core';

import { SpecView } from '@/catalog/registry';
import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';

function CatalogProseDemo() {
  return (
    <Playground
      controls={{
        markdown: {
          kind: 'text',
          label: 'Markdown',
          defaultValue:
            'The trailhead opens at **6 AM** — see the [park bulletin](https://example.com).',
        },
      }}
      layout="block"
      render={(values) => {
        const spec: Spec = {
          root: 'prose',
          elements: {
            prose: { type: 'Prose', props: { markdown: values.markdown }, children: [] },
          },
        };

        return <SpecView spec={spec} />;
      }}
    />
  );
}

export const catalogProseDemo: LibraryDemo = {
  slug: 'catalog-prose',
  title: 'Prose',
  description: 'Markdown-rendered body text — the primary workhorse for free-form writing.',
  group: 'Catalog',
  render: () => <CatalogProseDemo />,
};
