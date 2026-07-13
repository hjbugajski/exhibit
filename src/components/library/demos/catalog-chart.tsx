import type { Spec } from '@json-render/core';

import { SpecView } from '@/catalog/registry';
import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';

const kinds = ['bar', 'line'] as const;

const data = [
  { label: 'Jan', value: 12_400 },
  { label: 'Feb', value: 14_100 },
  { label: 'Mar', value: 13_800 },
  { label: 'Apr', value: 16_950 },
  { label: 'May', value: 19_200 },
  { label: 'Jun', value: 18_400 },
  { label: 'Jul', value: 21_600 },
];

function CatalogChartDemo() {
  return (
    <Playground
      controls={{
        kind: { kind: 'select', label: 'Kind', options: kinds, defaultValue: 'line' },
        valueLabel: { kind: 'text', label: 'Value label', defaultValue: 'Revenue ($)' },
      }}
      layout="block"
      render={(values) => {
        const spec: Spec = {
          root: 'chart',
          elements: {
            chart: {
              type: 'Chart',
              props: { kind: values.kind, data, valueLabel: values.valueLabel },
              children: [],
            },
          },
        };

        return <SpecView spec={spec} />;
      }}
    />
  );
}

export const catalogChartDemo: LibraryDemo = {
  slug: 'catalog-chart',
  title: 'Chart',
  description: 'Simple single-series bar or line chart for a numeric series over time.',
  group: 'Catalog',
  render: () => <CatalogChartDemo />,
};
