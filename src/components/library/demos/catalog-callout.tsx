import { catalogDemo } from '@/components/library/catalog-demo';

const variants = ['default', 'info', 'success', 'warning', 'danger'] as const;

export const catalogCalloutDemo = catalogDemo({
  slug: 'catalog-callout',
  title: 'Callout',
  description: 'Boxed aside for a tip, warning, success note, or side note; five tones.',
  controls: {
    variant: { kind: 'select', label: 'Variant', options: variants, defaultValue: 'info' },
    title: { kind: 'text', label: 'Title', defaultValue: 'Before you book' },
    markdown: {
      kind: 'text',
      label: 'Markdown',
      defaultValue: 'Most temples close at **5 PM** — plan indoor stops for the evening.',
    },
  },
  element: (values) => ({
    type: 'Callout',
    props: { variant: values.variant, title: values.title, markdown: values.markdown },
  }),
});
