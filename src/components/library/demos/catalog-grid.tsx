import { catalogDemo } from '@/components/library/catalog-demo';

const columnOptions = ['1', '2', '3', '4'] as const;

export const catalogGridDemo = catalogDemo({
  slug: 'catalog-grid',
  title: 'Grid',
  description:
    'Grid of children; one column is the vertical-flow container, 2-4 compare side by side.',
  controls: {
    columns: { kind: 'select', label: 'Columns', options: columnOptions, defaultValue: '3' },
  },
  root: 'grid',
  elements: (values) => ({
    grid: {
      type: 'Grid',
      props: { columns: Number(values.columns) },
      children: ['card-a', 'card-b', 'card-c', 'card-d'],
    },
    'card-a': { type: 'Card', props: { title: 'Starter', badge: 'Free' } },
    'card-b': { type: 'Card', props: { title: 'Pro', badge: '$12/mo' } },
    'card-c': { type: 'Card', props: { title: 'Team', badge: '$29/mo' } },
    'card-d': { type: 'Card', props: { title: 'Enterprise', badge: 'Contact us' } },
  }),
});
