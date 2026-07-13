import type { Spec } from '@json-render/core';

import { SpecView } from '@/catalog/registry';
import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';

function CatalogQuoteDemo() {
  return (
    <Playground
      controls={{
        markdown: {
          kind: 'text',
          label: 'Markdown',
          defaultValue:
            'The best time to plant a tree was 20 years ago; the second best time is now.',
        },
        attribution: { kind: 'text', label: 'Attribution', defaultValue: 'Chinese proverb' },
      }}
      layout="block"
      render={(values) => {
        const spec: Spec = {
          root: 'quote',
          elements: {
            quote: {
              type: 'Quote',
              props: { markdown: values.markdown, attribution: values.attribution },
              children: [],
            },
          },
        };

        return <SpecView spec={spec} />;
      }}
    />
  );
}

export const catalogQuoteDemo: LibraryDemo = {
  slug: 'catalog-quote',
  title: 'Quote',
  description: 'Block quotation, optionally attributed, for a notable quote from a source.',
  group: 'Catalog',
  render: () => <CatalogQuoteDemo />,
};
