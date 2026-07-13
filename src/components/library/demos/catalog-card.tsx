import type { Spec } from '@json-render/core';

import { SpecView } from '@/catalog/registry';
import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';

const trends = ['up', 'down', 'flat'] as const;

function CatalogCardDemo() {
  return (
    <Playground
      controls={{
        title: { kind: 'text', label: 'Title', defaultValue: 'Pro' },
        subtitle: { kind: 'text', label: 'Subtitle', defaultValue: 'Best value' },
        badge: { kind: 'text', label: 'Badge', defaultValue: '$12/mo' },
        value: { kind: 'text', label: 'Value', defaultValue: '' },
        delta: { kind: 'text', label: 'Delta', defaultValue: '' },
        trend: { kind: 'select', label: 'Trend', options: trends, defaultValue: 'flat' },
      }}
      layout="block"
      render={(values) => {
        const spec: Spec = {
          root: 'card',
          elements: {
            card: {
              type: 'Card',
              props: {
                title: values.title,
                subtitle: values.subtitle,
                badge: values.badge,
                ...(values.value
                  ? { value: values.value, delta: values.delta || undefined, trend: values.trend }
                  : {}),
              },
              children: ['prose'],
            },
            prose: {
              type: 'Prose',
              props: { markdown: 'Unlimited projects, **200 GB** storage, and priority support.' },
              children: [],
            },
          },
        };

        return <SpecView spec={spec} />;
      }}
    />
  );
}

export const catalogCardDemo: LibraryDemo = {
  slug: 'catalog-card',
  title: 'Card',
  description:
    'Bordered container for a self-contained chunk of content; set a value for a key metric.',
  group: 'Catalog',
  render: () => <CatalogCardDemo />,
};
