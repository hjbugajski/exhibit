import type { Spec } from '@json-render/core';

import { SpecView } from '@/catalog/registry';
import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';

const variants = ['default', 'info', 'success', 'warning', 'danger'] as const;

function CatalogCalloutDemo() {
  return (
    <Playground
      controls={{
        variant: { kind: 'select', label: 'Variant', options: variants, defaultValue: 'info' },
        title: { kind: 'text', label: 'Title', defaultValue: 'Before you book' },
        markdown: {
          kind: 'text',
          label: 'Markdown',
          defaultValue: 'Most temples close at **5 PM** — plan indoor stops for the evening.',
        },
      }}
      layout="block"
      render={(values) => {
        const spec: Spec = {
          root: 'callout',
          elements: {
            callout: {
              type: 'Callout',
              props: { variant: values.variant, title: values.title, markdown: values.markdown },
              children: [],
            },
          },
        };

        return <SpecView spec={spec} />;
      }}
    />
  );
}

export const catalogCalloutDemo: LibraryDemo = {
  slug: 'catalog-callout',
  title: 'Callout',
  description: 'Boxed aside for a tip, warning, success note, or side note; five tones.',
  group: 'Catalog',
  render: () => <CatalogCalloutDemo />,
};
