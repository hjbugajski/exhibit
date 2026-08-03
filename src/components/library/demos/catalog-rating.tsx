import { catalogDemo } from '@/components/library/catalog-demo';

export const catalogRatingDemo = catalogDemo({
  slug: 'catalog-rating',
  title: 'Rating',
  description: 'Five-star rating the owner sets in the browser; the score persists at a statePath.',
  controls: {
    label: { kind: 'text', label: 'Label', defaultValue: 'Draft 2' },
  },
  element: (values) => ({
    type: 'Rating',
    props: {
      label: values.label,
      // Interactive — the rating is ephemeral in this preview, not persisted.
      statePath: '/ratings/draft-2',
    },
  }),
});
