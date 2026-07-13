import type { Spec } from '@json-render/core';

import { SpecView } from '@/catalog/registry';
import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';

const variants = ['default', 'info', 'success', 'warning', 'danger'] as const;

function CatalogBadgeDemo() {
  return (
    <Playground
      controls={{
        variant: { kind: 'select', label: 'Variant', options: variants, defaultValue: 'success' },
        text: { kind: 'text', label: 'Text', defaultValue: 'Best value' },
      }}
      layout="block"
      render={(values) => {
        const spec: Spec = {
          root: 'badge',
          elements: {
            badge: {
              type: 'Badge',
              props: { text: values.text, variant: values.variant },
              children: [],
            },
          },
        };

        return <SpecView spec={spec} />;
      }}
    />
  );
}

export const catalogBadgeDemo: LibraryDemo = {
  slug: 'catalog-badge',
  title: 'Badge',
  description: 'Small inline label for a status or tag, e.g. "Best value" or "Sold out".',
  group: 'Catalog',
  render: () => <CatalogBadgeDemo />,
};
