import { catalogDemo } from '@/components/library/catalog-demo';

const variants = ['default', 'info', 'success', 'warning', 'danger'] as const;

export const catalogBadgeDemo = catalogDemo({
  slug: 'catalog-badge',
  title: 'Badge',
  description: 'Small inline label for a status or tag, e.g. "Best value" or "Sold out".',
  controls: {
    variant: { kind: 'select', label: 'Variant', options: variants, defaultValue: 'success' },
    text: { kind: 'text', label: 'Text', defaultValue: 'Best value' },
  },
  element: (values) => ({
    type: 'Badge',
    props: { text: values.text, variant: values.variant },
  }),
});
