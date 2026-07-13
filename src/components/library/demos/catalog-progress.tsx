import type { Spec } from '@json-render/core';

import { SpecView } from '@/catalog/registry';
import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';

const progressValues = ['0', '25', '50', '75', '100'] as const;

function CatalogProgressDemo() {
  return (
    <Playground
      controls={{
        value: { kind: 'select', label: 'Value', options: progressValues, defaultValue: '50' },
        label: { kind: 'text', label: 'Label', defaultValue: 'Demo phase' },
      }}
      layout="block"
      render={(values) => {
        const spec: Spec = {
          root: 'progress',
          elements: {
            progress: {
              type: 'Progress',
              props: { label: values.label, value: Number(values.value) },
              children: [],
            },
          },
        };

        return <SpecView spec={spec} />;
      }}
    />
  );
}

export const catalogProgressDemo: LibraryDemo = {
  slug: 'catalog-progress',
  title: 'Progress',
  description: 'Horizontal progress bar with an optional label and a percentage readout.',
  group: 'Catalog',
  render: () => <CatalogProgressDemo />,
};
