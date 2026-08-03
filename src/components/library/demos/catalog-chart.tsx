import { catalogDemo } from '@/components/library/catalog-demo';

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

export const catalogChartDemo = catalogDemo({
  slug: 'catalog-chart',
  title: 'Chart',
  description: 'Simple single-series bar or line chart for a numeric series over time.',
  controls: {
    kind: { kind: 'select', label: 'Kind', options: kinds, defaultValue: 'line' },
    valueLabel: { kind: 'text', label: 'Value label', defaultValue: 'Revenue ($)' },
  },
  element: (values) => ({
    type: 'Chart',
    props: { kind: values.kind, data, valueLabel: values.valueLabel },
  }),
});
