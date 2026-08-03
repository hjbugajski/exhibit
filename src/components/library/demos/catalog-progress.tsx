import { catalogDemo } from '@/components/library/catalog-demo';

const progressValues = ['0', '25', '50', '75', '100'] as const;

export const catalogProgressDemo = catalogDemo({
  slug: 'catalog-progress',
  title: 'Progress',
  description: 'Horizontal progress bar with an optional label and a percentage readout.',
  controls: {
    value: { kind: 'select', label: 'Value', options: progressValues, defaultValue: '50' },
    label: { kind: 'text', label: 'Label', defaultValue: 'Demo phase' },
  },
  element: (values) => ({
    type: 'Progress',
    props: { label: values.label, value: Number(values.value) },
  }),
});
