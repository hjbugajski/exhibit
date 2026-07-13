import type { Spec } from '@json-render/core';

import { SpecView } from '@/catalog/registry';
import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';

function CatalogDetailsDemo() {
  return (
    <Playground
      controls={{
        summary: { kind: 'text', label: 'Summary', defaultValue: 'Cancellation policy' },
        markdown: {
          kind: 'text',
          label: 'Markdown',
          defaultValue: 'Free cancellation up to **48 hours** before check-in.',
        },
      }}
      layout="block"
      render={(values) => {
        const spec: Spec = {
          root: 'details',
          elements: {
            details: {
              type: 'Details',
              props: { summary: values.summary, markdown: values.markdown },
              children: [],
            },
          },
        };

        return <SpecView spec={spec} />;
      }}
    />
  );
}

export const catalogDetailsDemo: LibraryDemo = {
  slug: 'catalog-details',
  title: 'Details',
  description: 'Collapsible disclosure, collapsed by default, for optional detail or fine print.',
  group: 'Catalog',
  render: () => <CatalogDetailsDemo />,
};
