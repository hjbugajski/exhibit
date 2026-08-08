import { catalogDemo } from '@/components/library/catalog-demo';

const ratios = ['1:1', '1:2', '2:1'] as const;

export const catalogColumnsDemo = catalogDemo({
  slug: 'catalog-columns',
  title: 'Columns',
  description: 'Exactly two children side by side, stacking vertically on mobile.',
  controls: {
    ratio: { kind: 'select', label: 'Ratio', options: ratios, defaultValue: '1:1' },
  },
  root: 'columns',
  elements: (values) => ({
    columns: { type: 'Columns', props: { ratio: values.ratio }, children: ['left', 'right'] },
    left: {
      type: 'Prose',
      props: { markdown: 'The **before**: a cramped kitchen with dated cabinets.' },
    },
    right: {
      type: 'Prose',
      props: { markdown: 'The **after**: an open layout with an island and pantry.' },
    },
  }),
});
