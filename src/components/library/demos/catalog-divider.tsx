import { catalogDemo } from '@/components/library/catalog-demo';

export const catalogDividerDemo = catalogDemo({
  slug: 'catalog-divider',
  title: 'Divider',
  description: 'Horizontal separator line between blocks; use sparingly.',
  root: 'grid',
  elements: {
    grid: { type: 'Grid', props: { columns: 1 }, children: ['before', 'divider', 'after'] },
    before: {
      type: 'Prose',
      props: { markdown: 'Registration closes **March 1st**; late entries are not accepted.' },
    },
    divider: { type: 'Divider', props: {} },
    after: {
      type: 'Prose',
      props: { markdown: 'Results are posted within two weeks of the event.' },
    },
  },
});
