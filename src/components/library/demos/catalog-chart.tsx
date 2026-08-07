import { catalogDemo } from '@/components/library/catalog-demo';

const kinds = ['bar', 'line', 'area', 'scatter', 'pie', 'donut'] as const;

const series = [
  { label: 'Jan', value: 12_400 },
  { label: 'Feb', value: 14_100 },
  { label: 'Mar', value: 13_800 },
  { label: 'Apr', value: 16_950 },
  { label: 'May', value: 19_200 },
  { label: 'Jun', value: 18_400 },
  { label: 'Jul', value: 21_600 },
];

const shares = [
  { label: 'Direct', value: 41 },
  { label: 'Search', value: 28 },
  { label: 'Social', value: 19 },
  { label: 'Referral', value: 12 },
];

/** Part-to-whole kinds read badly over a time series, so they get their own sample. */
const data: Record<(typeof kinds)[number], typeof series> = {
  bar: series,
  line: series,
  area: series,
  scatter: series,
  pie: shares,
  donut: shares,
};

export const catalogChartDemo = catalogDemo({
  slug: 'catalog-chart',
  title: 'Chart',
  description: 'Simple single-series chart: bar, line, area, scatter, pie, or donut.',
  controls: {
    kind: { kind: 'select', label: 'Kind', options: kinds, defaultValue: 'line' },
    valueLabel: { kind: 'text', label: 'Value label', defaultValue: 'Revenue ($)' },
  },
  element: (values) => ({
    type: 'Chart',
    props: { kind: values.kind, data: data[values.kind], valueLabel: values.valueLabel },
  }),
});
